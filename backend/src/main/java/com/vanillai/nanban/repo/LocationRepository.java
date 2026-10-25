package com.vanillai.nanban.repo;

import com.vanillai.nanban.model.Location;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface LocationRepository extends JpaRepository<Location, UUID> {
    List<Location> findByUserIdOrderByCityNameAsc(UUID userId);
    Optional<Location> findByIdAndUserId(UUID id, UUID userId);
    boolean existsByUserIdAndCityNameIgnoreCase(UUID userId, String cityName);
}
