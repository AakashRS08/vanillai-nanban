package com.vanillai.nanban.admin;

import com.vanillai.nanban.dto.Dtos.AdminStats;
import com.vanillai.nanban.model.Prediction;
import com.vanillai.nanban.model.WeatherData;
import com.vanillai.nanban.repo.ChatMessageRepository;
import com.vanillai.nanban.repo.LocationRepository;
import com.vanillai.nanban.repo.PredictionRepository;
import com.vanillai.nanban.repo.UserRepository;
import com.vanillai.nanban.repo.WeatherDataRepository;
import java.time.Duration;
import java.time.Instant;
import org.springframework.data.domain.PageRequest;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Admin & Analytics Module (report 5.2.7): usage counts and model performance, measured by
 * comparing elapsed predictions with the reading actually recorded for that hour.
 */
@RestController
@RequestMapping("/api/admin")
public class AdminController {

    private final UserRepository users;
    private final LocationRepository locations;
    private final WeatherDataRepository weatherRepo;
    private final PredictionRepository predictionRepo;
    private final ChatMessageRepository chatRepo;

    public AdminController(UserRepository users, LocationRepository locations, WeatherDataRepository weatherRepo,
                           PredictionRepository predictionRepo, ChatMessageRepository chatRepo) {
        this.users = users;
        this.locations = locations;
        this.weatherRepo = weatherRepo;
        this.predictionRepo = predictionRepo;
        this.chatRepo = chatRepo;
    }

    @GetMapping("/stats")
    @Transactional(readOnly = true)
    public AdminStats stats() {
        double sumErr = 0;
        long n = 0;
        for (Prediction p : predictionRepo.findElapsed(Instant.now(), PageRequest.of(0, 500))) {
            WeatherData actual = weatherRepo.findByLocationIdAndRecordedAtBetweenOrderByRecordedAtAsc(
                            p.getLocation().getId(), p.getPredictedFor().minus(Duration.ofMinutes(30)),
                            p.getPredictedFor().plus(Duration.ofMinutes(30)))
                    .stream().findFirst().orElse(null);
            if (actual != null && actual.getTemperature() != null) {
                sumErr += Math.abs(actual.getTemperature() - p.getPredictedTemp());
                n++;
            }
        }
        Double mae = n == 0 ? null : Math.round(sumErr / n * 100.0) / 100.0;
        return new AdminStats(users.count(), locations.count(), weatherRepo.count(), predictionRepo.count(),
                chatRepo.count(), n, mae);
    }
}
