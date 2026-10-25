package com.vanillai.nanban.weather;

import com.vanillai.nanban.config.NanbanProperties;
import com.vanillai.nanban.model.Location;
import com.vanillai.nanban.model.WeatherData;
import com.vanillai.nanban.repo.LocationRepository;
import com.vanillai.nanban.repo.PredictionRepository;
import com.vanillai.nanban.repo.WeatherDataRepository;
import com.vanillai.nanban.weather.WeatherModels.*;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Weather Data Module (report 5.2.3): calls the provider, normalizes, caches, and keeps the
 * WEATHER_DATA history growing so the prediction model has something to learn from.
 */
@Service
public class WeatherService {

    private static final Logger log = LoggerFactory.getLogger(WeatherService.class);

    private record Cached(Snapshot snapshot, Instant storedAt) {}

    private final OpenMeteoClient client;
    private final WeatherDataRepository weatherRepo;
    private final LocationRepository locationRepo;
    private final PredictionRepository predictionRepo;
    private final NanbanProperties props;
    private final ConcurrentHashMap<String, Cached> cache = new ConcurrentHashMap<>();
    private record CachedAir(AirQuality air, Instant storedAt) {}
    private final ConcurrentHashMap<String, CachedAir> airCache = new ConcurrentHashMap<>();

    public WeatherService(OpenMeteoClient client, WeatherDataRepository weatherRepo,
                          LocationRepository locationRepo, PredictionRepository predictionRepo,
                          NanbanProperties props) {
        this.client = client;
        this.weatherRepo = weatherRepo;
        this.locationRepo = locationRepo;
        this.predictionRepo = predictionRepo;
        this.props = props;
    }

    public List<GeoResult> search(String query) {
        return client.search(query.trim());
    }

    /** Current conditions + provider forecast, served from cache while still fresh. */
    public Snapshot snapshot(double lat, double lon) {
        String key = key(lat, lon);
        Duration ttl = Duration.ofSeconds(props.weather().cacheTtlSeconds());
        Cached hit = cache.get(key);
        if (hit != null && Duration.between(hit.storedAt(), Instant.now()).compareTo(ttl) < 0) {
            return hit.snapshot();
        }
        try {
            Snapshot fresh = client.snapshot(lat, lon);
            cache.put(key, new Cached(fresh, Instant.now()));
            if (cache.size() > 500) evictStale(ttl);
            return fresh;
        } catch (WeatherProviderException e) {
            if (hit != null) {                       // stale data beats an error page
                log.warn("Provider failed, serving stale cache for {}", key);
                return hit.snapshot();
            }
            throw e;
        }
    }

    /** Air quality for a coordinate; cached like the weather, stale data is served if the provider fails. */
    public AirQuality air(double lat, double lon) {
        String key = key(lat, lon);
        Duration ttl = Duration.ofSeconds(props.weather().cacheTtlSeconds());
        CachedAir hit = airCache.get(key);
        if (hit != null && Duration.between(hit.storedAt(), Instant.now()).compareTo(ttl) < 0) return hit.air();
        try {
            AirQuality fresh = client.airQuality(lat, lon);
            airCache.put(key, new CachedAir(fresh, Instant.now()));
            if (airCache.size() > 500) airCache.clear();
            return fresh;
        } catch (WeatherProviderException e) {
            if (hit != null) return hit.air();
            throw e;
        }
    }

    /** Last N days of hourly weather for an arbitrary coordinate (used for unsaved places). */
    public List<Hourly> history(double lat, double lon) {
        return client.history(lat, lon, props.weather().historyDays());
    }

    /** Loads a week of history for a freshly saved location so prediction works immediately. */
    @Transactional
    public int backfill(Location location) {
        List<Hourly> hist = client.history(location.getLatitude(), location.getLongitude(),
                props.weather().historyDays());
        Set<Instant> existing = new HashSet<>();
        weatherRepo.findByLocationIdAndRecordedAtAfterOrderByRecordedAtAsc(
                location.getId(), Instant.now().minus(props.weather().historyDays() + 1L, ChronoUnit.DAYS))
                .forEach(w -> existing.add(w.getRecordedAt()));
        List<WeatherData> rows = hist.stream()
                .filter(h -> !existing.contains(h.time()))
                .map(h -> new WeatherData(location, h.time(), h.temperature(), h.humidity(),
                        h.windSpeed(), h.precipitation(), h.condition()))
                .toList();
        weatherRepo.saveAll(rows);
        return rows.size();
    }

    /** Stores the current reading (hour-aligned) for one saved location. */
    @Transactional
    public void recordCurrent(Location location) {
        Snapshot s = snapshot(location.getLatitude(), location.getLongitude());
        Instant hour = s.current().observedAt().truncatedTo(ChronoUnit.HOURS);
        if (weatherRepo.existsByLocationIdAndRecordedAt(location.getId(), hour)) return;
        Current c = s.current();
        weatherRepo.save(new WeatherData(location, hour, c.temperature(), c.humidity(),
                c.windSpeed(), c.precipitation(), c.condition()));
    }

    /** Hourly collector: the continuously growing history the report's AI module learns from. */
    @Scheduled(fixedRateString = "${nanban.weather.collect-interval-ms}", initialDelay = 120_000)
    public void collectAll() {
        int ok = 0, failed = 0;
        for (Location loc : locationRepo.findAll()) {
            try {
                recordCurrent(loc);
                ok++;
            } catch (RuntimeException e) {
                failed++;
                log.warn("Could not record weather for {}: {}", loc.getCityName(), e.getMessage());
            }
        }
        int pruned = pruneOldPredictions();
        log.info("Weather collection finished: {} ok, {} failed, {} old predictions pruned", ok, failed, pruned);
    }

    int pruneOldPredictions() {
        return predictionRepo.deleteOlderThan(Instant.now().minus(14, ChronoUnit.DAYS));
    }

    private void evictStale(Duration ttl) {
        Instant cutoff = Instant.now().minus(ttl);
        cache.entrySet().removeIf(e -> e.getValue().storedAt().isBefore(cutoff));
    }

    private static String key(double lat, double lon) {
        return String.format(Locale.ROOT, "%.2f,%.2f", lat, lon);
    }
}
