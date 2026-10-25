package com.vanillai.nanban.model;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

/** Table 8.4 - PREDICTIONS */
@Entity
@Table(name = "predictions", indexes = @Index(columnList = "location_id,predicted_for"))
public class Prediction {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "location_id", nullable = false)
    private Location location;

    /** Target forecast time */
    @Column(name = "predicted_for", nullable = false)
    private Instant predictedFor;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "predicted_temp")
    private double predictedTemp;

    @Column(name = "predicted_condition", length = 50)
    private String predictedCondition;

    /** Model confidence 0-1 */
    @Column(name = "confidence_score")
    private double confidenceScore;

    protected Prediction() {}

    public Prediction(Location location, Instant predictedFor, double predictedTemp,
                      String predictedCondition, double confidenceScore) {
        this.location = location;
        this.predictedFor = predictedFor;
        this.predictedTemp = predictedTemp;
        this.predictedCondition = predictedCondition;
        this.confidenceScore = confidenceScore;
    }

    public UUID getId() { return id; }
    public Location getLocation() { return location; }
    public Instant getPredictedFor() { return predictedFor; }
    public Instant getCreatedAt() { return createdAt; }
    public double getPredictedTemp() { return predictedTemp; }
    public String getPredictedCondition() { return predictedCondition; }
    public double getConfidenceScore() { return confidenceScore; }
}
