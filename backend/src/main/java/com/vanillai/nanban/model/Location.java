package com.vanillai.nanban.model;

import jakarta.persistence.*;
import java.util.UUID;

/** Table 8.2 - LOCATIONS (a user's saved/favourite place) */
@Entity
@Table(name = "locations", uniqueConstraints =
        @UniqueConstraint(columnNames = {"user_id", "city_name"}))
public class Location {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "city_name", nullable = false, length = 190)
    private String cityName;

    @Column(nullable = false)
    private double latitude;

    @Column(nullable = false)
    private double longitude;

    protected Location() {}

    public Location(User user, String cityName, double latitude, double longitude) {
        this.user = user;
        this.cityName = cityName;
        this.latitude = latitude;
        this.longitude = longitude;
    }

    public UUID getId() { return id; }
    public User getUser() { return user; }
    public String getCityName() { return cityName; }
    public double getLatitude() { return latitude; }
    public double getLongitude() { return longitude; }
}
