package com.vanillai.nanban.prediction;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.vanillai.nanban.config.NanbanProperties;
import com.vanillai.nanban.weather.WeatherModels.Hourly;
import java.util.List;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/** Talks to the Python/scikit-learn prediction microservice (the report's "microservice" option). */
@Component
public class MlClient {

    public static class MlUnavailableException extends RuntimeException {
        public MlUnavailableException(String m, Throwable c) { super(m, c); }
    }

    public record HistoryPoint(String time, Double temperature, Double humidity,
                               @JsonProperty("wind_speed") Double windSpeed,
                               Double precipitation, String condition) {}

    public record Request(List<HistoryPoint> history, List<Integer> horizons) {}

    public record Model(String name, @JsonProperty("mae_temp") Double maeTemp,
                        @JsonProperty("training_samples") Integer trainingSamples) {}

    public record Prediction(@JsonProperty("hours_ahead") int hoursAhead,
                             @JsonProperty("predicted_for") String predictedFor,
                             @JsonProperty("predicted_temp") double predictedTemp,
                             @JsonProperty("predicted_condition") String predictedCondition,
                             @JsonProperty("confidence_score") double confidenceScore) {}

    public record Response(Model model, List<Prediction> predictions) {}

    private final RestClient http;
    private final List<Integer> horizons;

    public MlClient(NanbanProperties props) {
        SimpleClientHttpRequestFactory rf = new SimpleClientHttpRequestFactory();
        rf.setConnectTimeout(3000);
        rf.setReadTimeout(props.prediction().timeoutMs());
        this.http = RestClient.builder().baseUrl(props.prediction().mlUrl()).requestFactory(rf).build();
        this.horizons = props.prediction().horizons();
    }

    public Response predict(List<Hourly> history) {
        List<HistoryPoint> points = history.stream()
                .map(h -> new HistoryPoint(h.time().toString(), h.temperature(), h.humidity(),
                        h.windSpeed(), h.precipitation(), h.condition()))
                .toList();
        try {
            Response r = http.post().uri("/predict").contentType(MediaType.APPLICATION_JSON)
                    .body(new Request(points, horizons)).retrieve().body(Response.class);
            if (r == null || r.predictions() == null || r.predictions().isEmpty()) {
                throw new MlUnavailableException("Prediction service returned no predictions", null);
            }
            return r;
        } catch (RestClientException e) {
            throw new MlUnavailableException("Prediction service unavailable: " + e.getMessage(), e);
        }
    }
}
