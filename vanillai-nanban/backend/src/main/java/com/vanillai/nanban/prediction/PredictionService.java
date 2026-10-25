package com.vanillai.nanban.prediction;

import com.vanillai.nanban.config.NanbanProperties;
import com.vanillai.nanban.dto.Dtos.ForecastDto;
import com.vanillai.nanban.dto.Dtos.ModelInfo;
import com.vanillai.nanban.dto.Dtos.PredictionDto;
import com.vanillai.nanban.model.Location;
import com.vanillai.nanban.model.Prediction;
import com.vanillai.nanban.model.WeatherData;
import com.vanillai.nanban.repo.PredictionRepository;
import com.vanillai.nanban.repo.WeatherDataRepository;
import com.vanillai.nanban.weather.WeatherModels.Hourly;
import com.vanillai.nanban.weather.WeatherModels.Snapshot;
import com.vanillai.nanban.weather.WeatherService;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * AI Prediction Module (report 5.2.4). Supplements, never replaces, the provider forecast: every
 * prediction is returned next to the provider's own value for the same hour, with a confidence score.
 */
@Service
public class PredictionService {

    private static final Logger log = LoggerFactory.getLogger(PredictionService.class);
    private static final int MIN_POINTS_FOR_MODEL = 48;

    private final WeatherService weather;
    private final WeatherDataRepository weatherRepo;
    private final PredictionRepository predictionRepo;
    private final MlClient ml;
    private final TransactionTemplate tx;
    private final List<Integer> horizons;

    public PredictionService(WeatherService weather, WeatherDataRepository weatherRepo,
                             PredictionRepository predictionRepo, MlClient ml,
                             TransactionTemplate tx, NanbanProperties props) {
        this.weather = weather;
        this.weatherRepo = weatherRepo;
        this.predictionRepo = predictionRepo;
        this.ml = ml;
        this.tx = tx;
        this.horizons = props.prediction().horizons();
    }

    /** Forecast for a saved location: history comes from, and predictions go back to, the database. */
    public ForecastDto forecastForLocation(Location loc) {
        try {
            weather.recordCurrent(loc);
        } catch (RuntimeException e) {
            log.debug("Could not refresh current reading for {}: {}", loc.getCityName(), e.getMessage());
        }
        List<Hourly> history = loadHistory(loc);
        if (history.size() < 24) {
            try {
                weather.backfill(loc);
                history = loadHistory(loc);
            } catch (RuntimeException e) {
                log.warn("Backfill failed for {}: {}", loc.getCityName(), e.getMessage());
            }
        }
        ForecastDto dto = build(loc.getId(), loc.getCityName(), loc.getLatitude(), loc.getLongitude(), history);
        persist(loc, dto);
        return dto;
    }

    /** Forecast for an unsaved coordinate: history is fetched on the fly and nothing is stored. */
    public ForecastDto forecastForCoordinates(double lat, double lon, String cityName) {
        return build(null, cityName, lat, lon, weather.history(lat, lon));
    }

    private ForecastDto build(java.util.UUID locationId, String city, double lat, double lon, List<Hourly> history) {
        Snapshot provider = weather.snapshot(lat, lon);   // may throw WeatherProviderException -> 502
        // Provider hours sit on the place's local hour (e.g. :30 past in India); bucket to the nearest UTC hour.
        Map<Long, Hourly> providerByHour = provider.next48h().stream()
                .collect(Collectors.toMap(h -> hourBucket(h.time()), Function.identity(), (a, b) -> a));

        String source;
        String note = null;
        ModelInfo model = null;
        List<PredictionDto> out = new ArrayList<>();
        Instant now = Instant.now();

        List<Hourly> usable = history.stream().filter(h -> h.temperature() != null).toList();
        MlClient.Response ai = null;
        if (usable.size() >= MIN_POINTS_FOR_MODEL) {
            try {
                ai = ml.predict(usable);
            } catch (MlClient.MlUnavailableException e) {
                log.warn("ML service unavailable, using baseline: {}", e.getMessage());
                note = "The AI model service is unavailable, so a simple statistical estimate is shown instead.";
            }
        } else {
            note = "Only " + usable.size() + " hours of history so far (the AI model needs "
                    + MIN_POINTS_FOR_MODEL + "), so a simple statistical estimate is shown instead.";
        }

        if (ai != null) {
            source = "ml";
            model = new ModelInfo(ai.model() == null ? "ml" : ai.model().name(),
                    ai.model() == null ? null : ai.model().maeTemp(),
                    ai.model() == null ? null : ai.model().trainingSamples());
            for (MlClient.Prediction p : ai.predictions()) {
                Instant at = Instant.parse(p.predictedFor());
                if (!at.isAfter(now)) continue;
                out.add(dto(p.hoursAhead(), at, p.predictedTemp(), p.predictedCondition(),
                        p.confidenceScore(), providerByHour));
            }
        } else {
            source = "baseline";
            for (BaselinePredictor.Result r : BaselinePredictor.predict(usable, horizons)) {
                if (!r.predictedFor().isAfter(now)) continue;
                out.add(dto(r.hoursAhead(), r.predictedFor(), r.temp(), r.condition(), r.confidence(), providerByHour));
            }
            if (out.isEmpty()) note = "Not enough weather history for this place yet - showing the provider forecast only.";
        }
        out.sort(Comparator.comparing(PredictionDto::predictedFor));
        return new ForecastDto(locationId, city, lat, lon, now, source, model, usable.size(), note, out);
    }

    private static PredictionDto dto(int ahead, Instant at, double temp, String cond, double conf,
                                     Map<Long, Hourly> providerByHour) {
        Hourly p = providerByHour.get(hourBucket(at));
        return new PredictionDto(at, ahead, round1(temp), cond, Math.max(0, Math.min(1, conf)),
                p == null ? null : p.temperature(), p == null ? null : p.condition());
    }

    private List<Hourly> loadHistory(Location loc) {
        Instant from = Instant.now().minus(8, ChronoUnit.DAYS);
        return weatherRepo.findByLocationIdAndRecordedAtAfterOrderByRecordedAtAsc(loc.getId(), from).stream()
                .map(PredictionService::toHourly).toList();
    }

    private static Hourly toHourly(WeatherData w) {
        return new Hourly(w.getRecordedAt(), w.getTemperature(), w.getHumidity(), w.getWindSpeed(),
                w.getPrecipitation(), null, w.getCondition());
    }

    private void persist(Location loc, ForecastDto dto) {
        tx.executeWithoutResult(s -> {
            predictionRepo.deleteFutureByLocationId(loc.getId(), Instant.now());
            predictionRepo.saveAll(dto.predictions().stream()
                    .map(p -> new Prediction(loc, p.predictedFor(), p.predictedTemp(),
                            p.predictedCondition(), p.confidenceScore()))
                    .toList());
        });
    }

    private static long hourBucket(Instant t) {
        return Math.round(t.getEpochSecond() / 3600.0);
    }

    private static double round1(double v) {
        return Math.round(v * 10.0) / 10.0;
    }
}
