package com.vanillai.nanban.config;

import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "nanban")
public record NanbanProperties(
        Jwt jwt,
        List<String> corsOrigins,
        List<String> adminEmails,
        Weather weather,
        Prediction prediction,
        Chat chat) {

    public record Jwt(String secret, long expiryMinutes) {}

    public record Weather(String geocodingUrl, String forecastUrl, String airUrl, long cacheTtlSeconds,
                          int historyDays, long collectIntervalMs) {}

    public record Prediction(String mlUrl, List<Integer> horizons, int timeoutMs) {}

    public record Chat(String apiKey, String model, String apiUrl, int maxHistoryTurns) {}
}
