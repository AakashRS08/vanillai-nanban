package com.vanillai.nanban.web;

import com.vanillai.nanban.dto.Dtos.LocationDto;
import com.vanillai.nanban.dto.Dtos.SaveLocationRequest;
import com.vanillai.nanban.model.Location;
import com.vanillai.nanban.repo.LocationRepository;
import com.vanillai.nanban.repo.PredictionRepository;
import com.vanillai.nanban.repo.UserRepository;
import com.vanillai.nanban.repo.WeatherDataRepository;
import com.vanillai.nanban.security.AuthUser;
import com.vanillai.nanban.weather.WeatherModels.GeoResult;
import com.vanillai.nanban.weather.WeatherService;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

/** Location Module (report 5.2.2): city search plus the signed-in user's favourites. */
@RestController
@RequestMapping("/api/locations")
public class LocationController {

    private static final Logger log = LoggerFactory.getLogger(LocationController.class);
    private static final int MAX_FAVOURITES = 25;

    private final WeatherService weather;
    private final LocationRepository locations;
    private final UserRepository users;
    private final WeatherDataRepository weatherRepo;
    private final PredictionRepository predictionRepo;

    public LocationController(WeatherService weather, LocationRepository locations, UserRepository users,
                              WeatherDataRepository weatherRepo, PredictionRepository predictionRepo) {
        this.weather = weather;
        this.locations = locations;
        this.users = users;
        this.weatherRepo = weatherRepo;
        this.predictionRepo = predictionRepo;
    }

    /** Public: autocomplete for the search bar. */
    @GetMapping("/search")
    public List<GeoResult> search(@RequestParam String q) {
        if (q == null || q.trim().length() < 2) return List.of();
        return weather.search(q);
    }

    @GetMapping
    public List<LocationDto> mine(@AuthenticationPrincipal AuthUser auth) {
        return locations.findByUserIdOrderByCityNameAsc(auth.id()).stream().map(LocationController::dto).toList();
    }

    @PostMapping
    public ResponseEntity<LocationDto> save(@AuthenticationPrincipal AuthUser auth,
                                            @Valid @RequestBody SaveLocationRequest req) {
        String city = req.cityName().trim();
        if (locations.existsByUserIdAndCityNameIgnoreCase(auth.id(), city)) {
            throw new ApiException(HttpStatus.CONFLICT, "Already in your favourites");
        }
        if (locations.findByUserIdOrderByCityNameAsc(auth.id()).size() >= MAX_FAVOURITES) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "You can save up to " + MAX_FAVOURITES + " locations");
        }
        Location saved = locations.save(new Location(users.getReferenceById(auth.id()), city,
                req.latitude(), req.longitude()));
        try {
            int rows = weather.backfill(saved);   // so the AI has history from day one
            log.info("Saved '{}' and backfilled {} hourly readings", city, rows);
        } catch (RuntimeException e) {
            log.warn("Saved '{}' but backfill failed (will build history hourly): {}", city, e.getMessage());
        }
        return ResponseEntity.status(HttpStatus.CREATED).body(dto(saved));
    }

    @DeleteMapping("/{id}")
    @Transactional
    public ResponseEntity<Void> delete(@AuthenticationPrincipal AuthUser auth, @PathVariable UUID id) {
        Location loc = locations.findByIdAndUserId(id, auth.id())
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Location not found"));
        weatherRepo.deleteByLocationId(loc.getId());
        predictionRepo.deleteByLocationId(loc.getId());
        locations.delete(loc);
        return ResponseEntity.noContent().build();
    }

    private static LocationDto dto(Location l) {
        return new LocationDto(l.getId(), l.getCityName(), l.getLatitude(), l.getLongitude());
    }
}
