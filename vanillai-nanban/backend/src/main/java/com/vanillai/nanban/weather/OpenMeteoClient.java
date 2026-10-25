package com.vanillai.nanban.weather;

import com.fasterxml.jackson.databind.JsonNode;
import com.vanillai.nanban.config.NanbanProperties;
import com.vanillai.nanban.weather.WeatherModels.*;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * Weather provider adapter. Open-Meteo is used because it needs no API key; swapping to
 * OpenWeatherMap (named in the report) only means re-implementing this class.
 * All times are requested in GMT so they parse unambiguously as UTC.
 */
@Component
public class OpenMeteoClient {

    private static final String CURRENT_VARS =
            "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,surface_pressure,uv_index";
    private static final String DAILY_VARS =
            "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset,uv_index_max";
    private static final String HOURLY_FORECAST_VARS =
            "temperature_2m,relative_humidity_2m,precipitation,precipitation_probability,weather_code,wind_speed_10m";
    private static final String HOURLY_HISTORY_VARS =
            "temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m";

    private final RestClient geo;
    private final RestClient forecast;
    private final RestClient air;

    public OpenMeteoClient(NanbanProperties props) {
        SimpleClientHttpRequestFactory rf = new SimpleClientHttpRequestFactory();
        rf.setConnectTimeout(5000);
        rf.setReadTimeout(10000);
        this.geo = RestClient.builder().baseUrl(props.weather().geocodingUrl()).requestFactory(rf).build();
        this.forecast = RestClient.builder().baseUrl(props.weather().forecastUrl()).requestFactory(rf).build();
        this.air = RestClient.builder().baseUrl(props.weather().airUrl()).requestFactory(rf).build();
    }

    public List<GeoResult> search(String query) {
        try {
            JsonNode root = geo.get()
                    .uri(u -> u.path("/v1/search").queryParam("name", query).queryParam("count", 6)
                            .queryParam("language", "en").build())
                    .retrieve().body(JsonNode.class);
            List<GeoResult> out = new ArrayList<>();
            if (root != null && root.has("results")) {
                for (JsonNode r : root.get("results")) {
                    out.add(new GeoResult(r.path("name").asText(), text(r, "admin1"), text(r, "country"),
                            r.path("latitude").asDouble(), r.path("longitude").asDouble()));
                }
            }
            return out;
        } catch (RestClientException e) {
            throw new WeatherProviderException("City search is unavailable right now", e);
        }
    }

    /**
     * Current conditions, hourly outlook and 7-day forecast. Requested in the place's own time zone
     * ("auto") so day boundaries, sunrise and sunset are right for that city; every timestamp is converted to
     * a true instant using the reported UTC offset.
     */
    public Snapshot snapshot(double lat, double lon) {
        try {
            JsonNode root = forecast.get()
                    .uri(u -> u.path("/v1/forecast").queryParam("latitude", lat).queryParam("longitude", lon)
                            .queryParam("current", CURRENT_VARS).queryParam("hourly", HOURLY_FORECAST_VARS)
                            .queryParam("daily", DAILY_VARS)
                            .queryParam("forecast_days", 7).queryParam("timezone", "auto").build())
                    .retrieve().body(JsonNode.class);
            if (root == null || !root.has("current") || !root.has("hourly")) {
                throw new WeatherProviderException("Weather provider returned no data", null);
            }
            int offset = root.path("utc_offset_seconds").asInt(0);
            String zone = root.path("timezone").asText("UTC");
            JsonNode c = root.get("current");
            Instant now = parseTime(c.path("time").asText(), offset);
            Current current = new Current(now,
                    c.path("temperature_2m").asDouble(), c.path("apparent_temperature").asDouble(),
                    c.path("relative_humidity_2m").asDouble(), c.path("wind_speed_10m").asDouble(),
                    c.path("surface_pressure").asDouble(), c.path("precipitation").asDouble(),
                    ConditionMapper.fromWmo(c.path("weather_code").asInt(3)), c.path("uv_index").asDouble(0));

            List<Hourly> next = new ArrayList<>();
            for (Hourly h : hourly(root.get("hourly"), true, offset)) {
                if (h.time().isAfter(now) && next.size() < 48) next.add(h);
            }
            return new Snapshot(lat, lon, Instant.now(), offset, zone, current, next, daily(root.get("daily"), offset));
        } catch (RestClientException e) {
            throw new WeatherProviderException("Weather provider is unavailable right now", e);
        }
    }

    public AirQuality airQuality(double lat, double lon) {
        try {
            JsonNode root = air.get()
                    .uri(u -> u.path("/v1/air-quality").queryParam("latitude", lat).queryParam("longitude", lon)
                            .queryParam("current", "us_aqi,pm2_5,pm10,ozone,nitrogen_dioxide")
                            .queryParam("timezone", "GMT").build())
                    .retrieve().body(JsonNode.class);
            if (root == null || !root.has("current")) {
                throw new WeatherProviderException("Air quality provider returned no data", null);
            }
            JsonNode c = root.get("current");
            return new AirQuality(parseTime(c.path("time").asText(), 0), num(c, "us_aqi"), num(c, "pm2_5"),
                    num(c, "pm10"), num(c, "ozone"), num(c, "nitrogen_dioxide"));
        } catch (RestClientException e) {
            throw new WeatherProviderException("Air quality is unavailable right now", e);
        }
    }

    /** Hourly observations/analysis for the last {@code days} days, up to and including now. */
    public List<Hourly> history(double lat, double lon, int days) {
        try {
            JsonNode root = forecast.get()
                    .uri(u -> u.path("/v1/forecast").queryParam("latitude", lat).queryParam("longitude", lon)
                            .queryParam("hourly", HOURLY_HISTORY_VARS).queryParam("past_days", days)
                            .queryParam("forecast_days", 1).queryParam("timezone", "GMT").build())
                    .retrieve().body(JsonNode.class);
            if (root == null || !root.has("hourly")) return List.of();
            Instant now = Instant.now();
            List<Hourly> out = new ArrayList<>();
            for (Hourly h : hourly(root.get("hourly"), false, 0)) {
                if (!h.time().isAfter(now) && h.temperature() != null) out.add(h);
            }
            return out;
        } catch (RestClientException e) {
            throw new WeatherProviderException("Historical weather is unavailable right now", e);
        }
    }

    private static List<Hourly> hourly(JsonNode h, boolean withProbability, int offsetSeconds) {
        JsonNode time = h.get("time");
        List<Hourly> out = new ArrayList<>();
        for (int i = 0; i < time.size(); i++) {
            Integer code = intAt(h, "weather_code", i);
            out.add(new Hourly(parseTime(time.get(i).asText(), offsetSeconds),
                    dblAt(h, "temperature_2m", i), dblAt(h, "relative_humidity_2m", i),
                    dblAt(h, "wind_speed_10m", i), dblAt(h, "precipitation", i),
                    withProbability ? dblAt(h, "precipitation_probability", i) : null,
                    ConditionMapper.fromWmo(code)));
        }
        return out;
    }

    /** Provider times are local wall-clock strings; the UTC offset turns them into real instants. */
    private static Instant parseTime(String t, int offsetSeconds) {
        return LocalDateTime.parse(t).toInstant(ZoneOffset.ofTotalSeconds(offsetSeconds));
    }

    private static List<Daily> daily(JsonNode d, int offsetSeconds) {
        List<Daily> out = new ArrayList<>();
        if (d == null || !d.has("time")) return out;
        JsonNode time = d.get("time");
        for (int i = 0; i < time.size(); i++) {
            Double max = dblAt(d, "temperature_2m_max", i);
            Double min = dblAt(d, "temperature_2m_min", i);
            if (max == null || min == null) continue;
            JsonNode rise = d.path("sunrise").path(i);
            JsonNode set = d.path("sunset").path(i);
            out.add(new Daily(LocalDate.parse(time.get(i).asText()), max, min,
                    ConditionMapper.fromWmo(intAt(d, "weather_code", i)),
                    dblAt(d, "precipitation_probability_max", i),
                    rise.isTextual() ? parseTime(rise.asText(), offsetSeconds) : null,
                    set.isTextual() ? parseTime(set.asText(), offsetSeconds) : null,
                    dblAt(d, "uv_index_max", i)));
        }
        return out;
    }

    private static Double num(JsonNode n, String f) {
        return n.hasNonNull(f) ? n.get(f).asDouble() : null;
    }

    private static String text(JsonNode n, String f) {
        return n.hasNonNull(f) ? n.get(f).asText() : null;
    }

    private static Double dblAt(JsonNode h, String field, int i) {
        JsonNode a = h.get(field);
        return (a == null || i >= a.size() || a.get(i).isNull()) ? null : a.get(i).asDouble();
    }

    private static Integer intAt(JsonNode h, String field, int i) {
        JsonNode a = h.get(field);
        return (a == null || i >= a.size() || a.get(i).isNull()) ? null : a.get(i).asInt();
    }
}
