package com.vanillai.nanban.repo;

import com.vanillai.nanban.model.WeatherData;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.transaction.annotation.Transactional;

public interface WeatherDataRepository extends JpaRepository<WeatherData, UUID> {

    List<WeatherData> findByLocationIdAndRecordedAtAfterOrderByRecordedAtAsc(UUID locationId, Instant after);

    List<WeatherData> findByLocationIdAndRecordedAtBetweenOrderByRecordedAtAsc(UUID locationId, Instant from, Instant to);

    boolean existsByLocationIdAndRecordedAt(UUID locationId, Instant recordedAt);

    Optional<WeatherData> findFirstByLocationIdOrderByRecordedAtDesc(UUID locationId);

    @Transactional
    @Modifying
    @Query("delete from WeatherData w where w.location.id = :locationId")
    void deleteByLocationId(UUID locationId);
}
