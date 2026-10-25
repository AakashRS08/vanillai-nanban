package com.vanillai.nanban.chat;

import com.vanillai.nanban.dto.Dtos.ForecastDto;
import com.vanillai.nanban.dto.Dtos.PredictionDto;
import com.vanillai.nanban.weather.ConditionMapper;
import com.vanillai.nanban.weather.WeatherModels.Current;
import com.vanillai.nanban.weather.WeatherModels.Hourly;
import com.vanillai.nanban.weather.WeatherModels.Snapshot;
import java.util.List;
import java.util.Locale;

/**
 * Fallback when no LLM is configured or the LLM call fails (report 5.3: "handling of unsupported or
 * ambiguous questions"). Answers common questions straight from the weather data, and says so.
 */
final class RuleBasedAnswerer {
    private RuleBasedAnswerer() {}

    static String answer(String question, String place, Snapshot snap, ForecastDto forecast) {
        String q = question.toLowerCase(Locale.ROOT);
        Current c = snap.current();
        List<Hourly> next24 = snap.next48h().stream().limit(24).toList();
        double maxProb = next24.stream().map(Hourly::precipProbability).filter(p -> p != null)
                .mapToDouble(Double::doubleValue).max().orElse(0);
        boolean aiWet = forecast != null && forecast.predictions().stream()
                .filter(p -> p.hoursAhead() <= 24).anyMatch(p -> ConditionMapper.isWet(p.predictedCondition()));
        double minT = next24.stream().map(Hourly::temperature).filter(t -> t != null)
                .mapToDouble(Double::doubleValue).min().orElse(c.temperature());
        double maxT = next24.stream().map(Hourly::temperature).filter(t -> t != null)
                .mapToDouble(Double::doubleValue).max().orElse(c.temperature());

        if (has(q, "rain", "umbrella", "shower", "wet", "drizzle", "storm")) {
            if (maxProb >= 60 || aiWet && maxProb >= 30) {
                return String.format(Locale.ROOT,
                        "Yes, take an umbrella. The chance of rain in %s peaks around %.0f%% in the next 24 hours%s.",
                        place, maxProb, aiWet ? ", and the AI forecast also leans wet" : "");
            }
            if (maxProb >= 30) {
                return String.format(Locale.ROOT,
                        "Rain is possible in %s (up to %.0f%% in the next 24 hours). A small umbrella wouldn't hurt.",
                        place, maxProb);
            }
            return String.format(Locale.ROOT,
                    "Rain looks unlikely in %s - the highest chance in the next 24 hours is about %.0f%%.", place, maxProb);
        }
        if (has(q, "hot", "cold", "warm", "temperature", "jacket", "sweater", "wear", "degrees")) {
            return String.format(Locale.ROOT,
                    "It's %.1f°C in %s now (feels like %.1f°C). Over the next 24 hours expect %.0f-%.0f°C.",
                    c.temperature(), place, c.feelsLike(), minT, maxT);
        }
        if (has(q, "wind", "breeze", "windy")) {
            return String.format(Locale.ROOT, "Wind in %s is about %.0f km/h right now.", place, c.windSpeed());
        }
        if (has(q, "humid", "sticky", "muggy")) {
            return String.format(Locale.ROOT, "Humidity in %s is %.0f%% right now.", place, c.humidity());
        }
        return String.format(Locale.ROOT,
                "Right now in %s: %s, %.1f°C (feels like %.1f°C), humidity %.0f%%, wind %.0f km/h. "
                        + "Highest rain chance in the next 24 hours: %.0f%%.",
                place, c.condition().toLowerCase(Locale.ROOT), c.temperature(), c.feelsLike(),
                c.humidity(), c.windSpeed(), maxProb);
    }

    private static boolean has(String q, String... words) {
        for (String w : words) if (q.contains(w)) return true;
        return false;
    }

    /** Compact text block describing the data the answer is allowed to rely on. */
    static String contextBlock(String place, Snapshot snap, ForecastDto forecast) {
        Current c = snap.current();
        StringBuilder sb = new StringBuilder();
        sb.append(String.format(Locale.ROOT,
                "Location: %s%nNow: %s, %.1f°C (feels like %.1f°C), humidity %.0f%%, wind %.0f km/h, pressure %.0f hPa, precipitation %.1f mm%n",
                place, c.condition(), c.temperature(), c.feelsLike(), c.humidity(), c.windSpeed(), c.pressure(), c.precipitation()));
        sb.append("Provider forecast (UTC, next hours):\n");
        java.util.stream.IntStream.range(0, snap.next48h().size()).filter(i -> i % 3 == 2).limit(10)
                .mapToObj(i -> snap.next48h().get(i)).forEach(h ->
                sb.append(String.format(Locale.ROOT, "  %s  %s, %s°C, rain chance %s%%%n", h.time(), h.condition(),
                        h.temperature() == null ? "?" : String.format(Locale.ROOT, "%.1f", h.temperature()),
                        h.precipProbability() == null ? "?" : String.format(Locale.ROOT, "%.0f", h.precipProbability()))));
        sb.append(String.format(Locale.ROOT, "UV index now: %.0f%n", c.uvIndex()));
        if (snap.daily() != null && !snap.daily().isEmpty()) {
            sb.append("Daily outlook (place's local dates):\n");
            snap.daily().stream().limit(7).forEach(d -> sb.append(String.format(Locale.ROOT,
                    "  %s  %s, %.0f/%.0f°C, rain chance %s%%%n", d.date(), d.condition(), d.tempMax(), d.tempMin(),
                    d.precipProbabilityMax() == null ? "?" : String.format(Locale.ROOT, "%.0f", d.precipProbabilityMax()))));
        }
        if (forecast != null && !forecast.predictions().isEmpty()) {
            sb.append("AI prediction (source: ").append(forecast.source()).append("; supplementary, confidence 0-1):\n");
            for (PredictionDto p : forecast.predictions()) {
                sb.append(String.format(Locale.ROOT, "  %s  %s, %.1f°C, confidence %.2f%n",
                        p.predictedFor(), p.predictedCondition(), p.predictedTemp(), p.confidenceScore()));
            }
        }
        return sb.toString();
    }
}
