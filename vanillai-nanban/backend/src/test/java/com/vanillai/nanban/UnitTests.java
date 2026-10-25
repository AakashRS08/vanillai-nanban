package com.vanillai.nanban;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.vanillai.nanban.config.NanbanProperties;
import com.vanillai.nanban.model.User;
import com.vanillai.nanban.prediction.BaselinePredictor;
import com.vanillai.nanban.security.AdminPolicy;
import com.vanillai.nanban.security.JwtService;
import com.vanillai.nanban.weather.ConditionMapper;
import com.vanillai.nanban.weather.WeatherModels.Hourly;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class UnitTests {

    private static NanbanProperties props(String secret, List<String> admins) {
        return new NanbanProperties(new NanbanProperties.Jwt(secret, 60), List.of("http://localhost"), admins,
                null, null, null);
    }

    // ---- JWT

    @Test
    void jwtRoundTripAndTamperDetection() {
        JwtService jwt = new JwtService(props("0123456789012345678901234567890123456789", List.of()));
        User u = new User("A", "a@example.com", "hash");
        // id is generated on save; the token subject needs one, so give the entity one by reflection
        setId(u, java.util.UUID.randomUUID());

        String token = jwt.issue(u);
        assertThat(jwt.parse(token)).isPresent();
        assertThat(jwt.parse(token).get().email()).isEqualTo("a@example.com");
        assertThat(jwt.parse(token + "x")).isEmpty();
        assertThat(jwt.parse("not.a.jwt")).isEmpty();

        JwtService other = new JwtService(props("ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ", List.of()));
        assertThat(other.parse(token)).isEmpty();   // signed with a different secret
    }

    @Test
    void shortJwtSecretIsRejectedAtStartup() {
        assertThatThrownBy(() -> new JwtService(props("too-short", List.of()))).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void adminPolicyIsCaseInsensitiveAndIgnoresBlanks() {
        AdminPolicy p = new AdminPolicy(props("0123456789012345678901234567890123456789", List.of(" Boss@Example.com ", "")));
        assertThat(p.isAdmin("boss@example.com")).isTrue();
        assertThat(p.isAdmin("BOSS@EXAMPLE.COM")).isTrue();
        assertThat(p.isAdmin("")).isFalse();
        assertThat(p.isAdmin(null)).isFalse();
    }

    // ---- WMO code mapping

    @Test
    void wmoCodesMapToTheLabelsTheModelUses() {
        assertThat(ConditionMapper.fromWmo(0)).isEqualTo("Clear");
        assertThat(ConditionMapper.fromWmo(2)).isEqualTo("Partly Cloudy");
        assertThat(ConditionMapper.fromWmo(3)).isEqualTo("Cloudy");
        assertThat(ConditionMapper.fromWmo(45)).isEqualTo("Fog");
        assertThat(ConditionMapper.fromWmo(53)).isEqualTo("Drizzle");
        assertThat(ConditionMapper.fromWmo(63)).isEqualTo("Rain");
        assertThat(ConditionMapper.fromWmo(81)).isEqualTo("Rain");
        assertThat(ConditionMapper.fromWmo(73)).isEqualTo("Snow");
        assertThat(ConditionMapper.fromWmo(95)).isEqualTo("Thunderstorm");
        assertThat(ConditionMapper.fromWmo(null)).isEqualTo("Cloudy");
        assertThat(ConditionMapper.LABELS).contains(ConditionMapper.fromWmo(61), ConditionMapper.fromWmo(99));
        assertThat(ConditionMapper.isWet("Rain")).isTrue();
        assertThat(ConditionMapper.isWet("Clear")).isFalse();
    }

    // ---- baseline predictor

    @Test
    void baselineRepeatsTheDailyRhythm() {
        List<Hourly> hist = sine(96);
        List<BaselinePredictor.Result> out = BaselinePredictor.predict(hist, List.of(6, 24));
        assertThat(out).hasSize(2);
        for (BaselinePredictor.Result r : out) {
            double truth = trueTemp(r.predictedFor());
            assertThat(Math.abs(r.temp() - truth)).isLessThan(2.0);
            assertThat(r.confidence()).isBetween(0.05, 0.35);   // never oversells itself
        }
    }

    @Test
    void baselineHandlesEmptyAndNullGaps() {
        assertThat(BaselinePredictor.predict(List.of(), List.of(3))).isEmpty();
        List<Hourly> hist = new ArrayList<>(sine(30));
        hist.add(new Hourly(Instant.now(), null, null, null, null, null, null));   // unusable row is ignored
        assertThat(BaselinePredictor.predict(hist, List.of(3))).hasSize(1);
    }

    private static List<Hourly> sine(int hours) {
        Instant end = Instant.now().truncatedTo(ChronoUnit.HOURS);
        List<Hourly> out = new ArrayList<>();
        for (int i = hours - 1; i >= 0; i--) {
            Instant t = end.minus(i, ChronoUnit.HOURS);
            out.add(new Hourly(t, trueTemp(t), 60.0, 10.0, 0.0, null, "Clear"));
        }
        return out;
    }

    private static double trueTemp(Instant t) {
        return 28 + 5 * Math.sin(2 * Math.PI * (t.atOffset(ZoneOffset.UTC).getHour() - 9) / 24.0);
    }

    private static void setId(User u, java.util.UUID id) {
        try {
            var f = User.class.getDeclaredField("id");
            f.setAccessible(true);
            f.set(u, id);
        } catch (ReflectiveOperationException e) {
            throw new AssertionError(e);
        }
    }
}
