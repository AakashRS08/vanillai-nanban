package com.vanillai.nanban.web;

import com.vanillai.nanban.dto.Dtos.ForecastDto;
import com.vanillai.nanban.model.Location;
import com.vanillai.nanban.prediction.PredictionService;
import com.vanillai.nanban.repo.LocationRepository;
import com.vanillai.nanban.security.AuthUser;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/forecast")
@Validated
public class ForecastController {

    private final PredictionService predictions;
    private final LocationRepository locations;

    public ForecastController(PredictionService predictions, LocationRepository locations) {
        this.predictions = predictions;
        this.locations = locations;
    }

    /** AI-enhanced forecast for one of the signed-in user's saved locations (report 8.2.2). */
    @GetMapping("/{locationId}")
    public ForecastDto forLocation(@AuthenticationPrincipal AuthUser auth, @PathVariable UUID locationId) {
        Location loc = locations.findByIdAndUserId(locationId, auth.id())
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Location not found"));
        return predictions.forecastForLocation(loc);
    }

    /** Public: AI-enhanced forecast for any coordinate (guests / search results). Nothing is stored. */
    @GetMapping
    public ForecastDto forCoordinates(@RequestParam @DecimalMin("-90") @DecimalMax("90") double lat,
                                      @RequestParam @DecimalMin("-180") @DecimalMax("180") double lon,
                                      @RequestParam(required = false) String city) {
        String label = (city == null || city.isBlank()) ? "Selected location" : city.trim();
        return predictions.forecastForCoordinates(lat, lon, label);
    }
}
