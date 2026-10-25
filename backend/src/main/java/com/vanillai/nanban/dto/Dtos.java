package com.vanillai.nanban.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class Dtos {
    private Dtos() {}

    // ---- auth ----
    public record RegisterRequest(
            @NotBlank @Size(max = 100) String name,
            @NotBlank @Email @Size(max = 190) String email,
            @NotBlank @Size(min = 8, max = 72, message = "password must be 8-72 characters") String password) {}

    public record LoginRequest(@NotBlank @Email String email, @NotBlank String password) {}

    public record UserDto(UUID id, String name, String email, boolean admin) {}

    public record AuthResponse(String token, UserDto user) {}

    // ---- locations ----
    public record SaveLocationRequest(
            @NotBlank @Size(max = 190) String cityName,
            @DecimalMin("-90") @DecimalMax("90") double latitude,
            @DecimalMin("-180") @DecimalMax("180") double longitude) {}

    public record LocationDto(UUID id, String cityName, double latitude, double longitude) {}

    // ---- forecast ----
    public record PredictionDto(Instant predictedFor, int hoursAhead, double predictedTemp,
                                String predictedCondition, double confidenceScore,
                                Double providerTemp, String providerCondition) {}

    public record ModelInfo(String name, Double maeTemp, Integer trainingSamples) {}

    public record ForecastDto(UUID locationId, String cityName, double latitude, double longitude,
                              Instant generatedAt, String source, ModelInfo model,
                              int historyPoints, String note, List<PredictionDto> predictions) {}

    // ---- chat ----
    public record ChatRequest(
            @NotBlank @Size(max = 1000) String message,
            UUID locationId,
            String cityName,
            @DecimalMin("-90") @DecimalMax("90") Double latitude,
            @DecimalMin("-180") @DecimalMax("180") Double longitude) {}

    public record ChatReply(String reply, String source, Instant at) {}

    public record ChatLine(String senderType, String message, Instant sentAt) {}

    // ---- admin ----
    public record AdminStats(long users, long locations, long weatherReadings, long predictions,
                             long chatMessages, long evaluatedPredictions, Double meanAbsErrorTemp) {}
}
