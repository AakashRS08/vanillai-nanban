package com.vanillai.nanban.repo;

import com.vanillai.nanban.model.Prediction;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.transaction.annotation.Transactional;

public interface PredictionRepository extends JpaRepository<Prediction, UUID> {

    /** Replace the still-future predictions of a location when a fresh set is generated. */
    @Transactional
    @Modifying
    @Query("delete from Prediction p where p.location.id = :locationId and p.predictedFor > :now")
    void deleteFutureByLocationId(UUID locationId, Instant now);

    @Transactional
    @Modifying
    @Query("delete from Prediction p where p.location.id = :locationId")
    void deleteByLocationId(UUID locationId);

    @Transactional
    @Modifying
    @Query("delete from Prediction p where p.createdAt < :cutoff")
    int deleteOlderThan(Instant cutoff);

    @Query("select p from Prediction p where p.predictedFor < :now order by p.predictedFor desc")
    List<Prediction> findElapsed(Instant now, Pageable pageable);
}
