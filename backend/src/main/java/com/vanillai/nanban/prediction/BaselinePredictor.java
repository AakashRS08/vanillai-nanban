package com.vanillai.nanban.prediction;

import com.vanillai.nanban.weather.WeatherModels.Hourly;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Pure-Java fallback used when the ML service is down or the history is too short to train on.
 * It uses each location's own daily rhythm: the typical temperature and most common condition at
 * the target hour of day, nudged toward the latest observation (the nudge fades over ~12 hours).
 * Confidences are deliberately low so the UI never oversells it.
 */
public final class BaselinePredictor {
    private BaselinePredictor() {}

    public record Result(int hoursAhead, Instant predictedFor, double temp, String condition, double confidence) {}

    public static List<Result> predict(List<Hourly> history, List<Integer> horizons) {
        List<Hourly> h = history.stream().filter(p -> p.temperature() != null)
                .sorted(Comparator.comparing(Hourly::time)).toList();
        if (h.isEmpty()) return List.of();

        Hourly last = h.get(h.size() - 1);
        Instant anchor = last.time().truncatedTo(ChronoUnit.HOURS);

        Map<Integer, List<Double>> tempByHour = new HashMap<>();
        Map<Integer, Map<String, Integer>> condByHour = new HashMap<>();
        for (Hourly p : h) {
            int hod = hourOfDay(p.time());
            tempByHour.computeIfAbsent(hod, k -> new ArrayList<>()).add(p.temperature());
            if (p.condition() != null) {
                condByHour.computeIfAbsent(hod, k -> new HashMap<>()).merge(p.condition(), 1, Integer::sum);
            }
        }
        double lastAnomaly = last.temperature() - mean(tempByHour.get(hourOfDay(last.time())), last.temperature());
        double days = Math.max(1.0, ChronoUnit.HOURS.between(h.get(0).time(), last.time()) / 24.0);

        List<Result> out = new ArrayList<>();
        for (int ahead : horizons) {
            Instant target = anchor.plus(ahead, ChronoUnit.HOURS);
            int hod = hourOfDay(target);
            double typical = mean(tempByHour.get(hod), last.temperature());
            double temp = typical + lastAnomaly * Math.exp(-ahead / 12.0);
            String cond = topKey(condByHour.get(hod), last.condition() == null ? "Cloudy" : last.condition());
            double conf = Math.max(0.05, Math.min(0.35, 0.10 + 0.04 * Math.min(days, 6)) - ahead * 0.002);
            out.add(new Result(ahead, target, round1(temp), cond, Math.round(conf * 100) / 100.0));
        }
        return out;
    }

    private static int hourOfDay(Instant t) {
        return t.atOffset(ZoneOffset.UTC).getHour();
    }

    private static double mean(List<Double> xs, double fallback) {
        if (xs == null || xs.isEmpty()) return fallback;
        return xs.stream().mapToDouble(Double::doubleValue).average().orElse(fallback);
    }

    private static String topKey(Map<String, Integer> counts, String fallback) {
        if (counts == null || counts.isEmpty()) return fallback;
        return counts.entrySet().stream().max(Map.Entry.comparingByValue()).get().getKey();
    }

    private static double round1(double v) {
        return Math.round(v * 10.0) / 10.0;
    }
}
