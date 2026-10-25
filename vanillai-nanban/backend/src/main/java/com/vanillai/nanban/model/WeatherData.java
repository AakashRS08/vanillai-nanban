package com.vanillai.nanban.model;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

/** Table 8.3 - WEATHER_DATA (historical readings used to train the model) */
@Entity
@Table(name = "weather_data", indexes = @Index(columnList = "location_id,recorded_at"),
        uniqueConstraints = @UniqueConstraint(columnNames = {"location_id", "recorded_at"}))
public class WeatherData {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "location_id", nullable = false)
    private Location location;

    @Column(name = "recorded_at", nullable = false)
    private Instant recordedAt;

    /** Degrees Celsius */
    private Double temperature;

    /** Percent */
    private Double humidity;

    /** km/h */
    @Column(name = "wind_speed")
    private Double windSpeed;

    /** mm in the hour (extra column, helps the model; not in the report's minimal schema) */
    private Double precipitation;

    /** e.g. Rain, Clear, Cloudy. "condition" is a reserved word in MySQL, hence the quoting. */
    @Column(name = "`condition`", length = 50)
    private String condition;

    protected WeatherData() {}

    public WeatherData(Location location, Instant recordedAt, Double temperature, Double humidity,
                       Double windSpeed, Double precipitation, String condition) {
        this.location = location;
        this.recordedAt = recordedAt;
        this.temperature = temperature;
        this.humidity = humidity;
        this.windSpeed = windSpeed;
        this.precipitation = precipitation;
        this.condition = condition;
    }

    public UUID getId() { return id; }
    public Location getLocation() { return location; }
    public Instant getRecordedAt() { return recordedAt; }
    public Double getTemperature() { return temperature; }
    public Double getHumidity() { return humidity; }
    public Double getWindSpeed() { return windSpeed; }
    public Double getPrecipitation() { return precipitation; }
    public String getCondition() { return condition; }
}
