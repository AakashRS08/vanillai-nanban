package com.vanillai.nanban.weather;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/** Internal, provider-independent weather schema (the "normalized" form from report 5.2.3). */
public final class WeatherModels {
    private WeatherModels() {}

    public record GeoResult(String name, String region, String country, double latitude, double longitude) {
        public String label() {
            StringBuilder sb = new StringBuilder(name);
            if (region != null && !region.isBlank() && !region.equals(name)) sb.append(", ").append(region);
            if (country != null && !country.isBlank()) sb.append(", ").append(country);
            return sb.toString();
        }
    }

    public record Current(Instant observedAt, double temperature, double feelsLike, double humidity,
                          double windSpeed, double pressure, double precipitation, String condition,
                          double uvIndex) {}

    /** One hour of weather. Used for history rows and for the provider's own forecast. */
    public record Hourly(Instant time, Double temperature, Double humidity, Double windSpeed,
                         Double precipitation, Double precipProbability, String condition) {}

    /** One calendar day (in the place's own time zone). */
    public record Daily(LocalDate date, double tempMax, double tempMin, String condition,
                        Double precipProbabilityMax, Instant sunrise, Instant sunset, Double uvMax) {}

    /**
     * @param utcOffsetSeconds the place's offset from UTC, so the UI can show the place's local clock
     * @param timezone IANA name, e.g. Asia/Kolkata
     */
    public record Snapshot(double latitude, double longitude, Instant fetchedAt, int utcOffsetSeconds,
                           String timezone, Current current, List<Hourly> next48h, List<Daily> daily) {}

    public record AirQuality(Instant time, Double usAqi, Double pm25, Double pm10, Double ozone, Double no2) {}
}
