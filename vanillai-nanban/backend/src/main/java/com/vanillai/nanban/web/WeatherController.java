package com.vanillai.nanban.web;

import com.vanillai.nanban.weather.WeatherModels.AirQuality;
import com.vanillai.nanban.weather.WeatherModels.Snapshot;
import com.vanillai.nanban.weather.WeatherService;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
@Validated
public class WeatherController {

    private final WeatherService weather;

    public WeatherController(WeatherService weather) {
        this.weather = weather;
    }

    /** Public: current conditions + the provider's own 48h forecast for any coordinate. */
    @GetMapping("/weather")
    public Snapshot current(@RequestParam @DecimalMin("-90") @DecimalMax("90") double lat,
                            @RequestParam @DecimalMin("-180") @DecimalMax("180") double lon) {
        return weather.snapshot(lat, lon);
    }

    /** Public: current air quality (US AQI, PM2.5, PM10, ozone, NO2). */
    @GetMapping("/air")
    public AirQuality air(@RequestParam @DecimalMin("-90") @DecimalMax("90") double lat,
                          @RequestParam @DecimalMin("-180") @DecimalMax("180") double lon) {
        return weather.air(lat, lon);
    }
}
