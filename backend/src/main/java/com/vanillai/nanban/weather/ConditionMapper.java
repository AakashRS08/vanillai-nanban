package com.vanillai.nanban.weather;

import java.util.List;

/** Maps WMO weather codes (used by Open-Meteo) onto the small label set the ML model predicts. */
public final class ConditionMapper {
    private ConditionMapper() {}

    public static final List<String> LABELS =
            List.of("Clear", "Partly Cloudy", "Cloudy", "Fog", "Drizzle", "Rain", "Snow", "Thunderstorm");

    public static String fromWmo(Integer code) {
        if (code == null) return "Cloudy";
        int c = code;
        if (c == 0) return "Clear";
        if (c == 1 || c == 2) return "Partly Cloudy";
        if (c == 3) return "Cloudy";
        if (c == 45 || c == 48) return "Fog";
        if (c >= 51 && c <= 57) return "Drizzle";
        if ((c >= 61 && c <= 67) || (c >= 80 && c <= 82)) return "Rain";
        if ((c >= 71 && c <= 77) || c == 85 || c == 86) return "Snow";
        if (c >= 95) return "Thunderstorm";
        return "Cloudy";
    }

    public static boolean isWet(String condition) {
        return "Rain".equals(condition) || "Drizzle".equals(condition) || "Thunderstorm".equals(condition)
                || "Snow".equals(condition);
    }
}
