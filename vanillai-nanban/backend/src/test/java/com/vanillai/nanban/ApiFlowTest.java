package com.vanillai.nanban;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vanillai.nanban.prediction.MlClient;
import com.vanillai.nanban.repo.PredictionRepository;
import com.vanillai.nanban.repo.WeatherDataRepository;
import com.vanillai.nanban.weather.OpenMeteoClient;
import com.vanillai.nanban.weather.WeatherModels.AirQuality;
import com.vanillai.nanban.weather.WeatherModels.Current;
import com.vanillai.nanban.weather.WeatherModels.Daily;
import com.vanillai.nanban.weather.WeatherModels.GeoResult;
import com.vanillai.nanban.weather.WeatherModels.Hourly;
import com.vanillai.nanban.weather.WeatherModels.Snapshot;
import com.vanillai.nanban.weather.WeatherProviderException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

/** End-to-end API behaviour with the two network edges (weather provider, ML service) mocked. */
@SpringBootTest
@AutoConfigureMockMvc
class ApiFlowTest {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired WeatherDataRepository weatherRepo;
    @Autowired PredictionRepository predictionRepo;

    @MockBean OpenMeteoClient provider;
    @MockBean MlClient ml;

    @BeforeEach
    void stubNetwork() {
        when(provider.snapshot(anyDouble(), anyDouble())).thenReturn(snapshot(20));
        when(provider.history(anyDouble(), anyDouble(), anyInt())).thenReturn(history(168));
        when(provider.search(anyString())).thenReturn(List.of(
                new GeoResult("Chennai", "Tamil Nadu", "India", 13.0827, 80.2707)));
        when(provider.airQuality(anyDouble(), anyDouble())).thenReturn(
                new AirQuality(Instant.now(), 85.0, 28.4, 40.1, 60.0, 12.0));
        when(ml.predict(any())).thenReturn(mlResponse());
    }

    // ------------------------------------------------------------------ auth

    @Test
    void registerLoginAndValidation() throws Exception {
        String email = unique() + "@example.com";
        register("Asha K", email, "password123").andExpect(status().isCreated())
                .andExpect(jsonPath("$.token").isNotEmpty())
                .andExpect(jsonPath("$.user.email").value(email))
                .andExpect(jsonPath("$.user.admin").value(false))
                .andExpect(jsonPath("$.user.passwordHash").doesNotExist());

        register("Asha K", email.toUpperCase(), "password123").andExpect(status().isConflict());
        register("Asha K", unique() + "@example.com", "short").andExpect(status().isBadRequest());
        register("Asha K", "not-an-email", "password123").andExpect(status().isBadRequest());

        login(email, "password123").andExpect(status().isOk()).andExpect(jsonPath("$.token").isNotEmpty());
        login(email, "wrong-password").andExpect(status().isUnauthorized());
        login("nobody@example.com", "password123").andExpect(status().isUnauthorized()); // same answer: no user enumeration
    }

    @Test
    void protectedEndpointsNeedAToken() throws Exception {
        mvc.perform(get("/api/locations")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/locations").header("Authorization", "Bearer garbage")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/chat/history")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/auth/me")).andExpect(status().isUnauthorized());
    }

    // ------------------------------------------------------------------ locations + forecast

    @Test
    void savingALocationBackfillsHistoryAndForecastUsesTheModel() throws Exception {
        String token = newUser();
        String id = saveLocation(token, "Chennai, Tamil Nadu, India");

        assertThat(weatherRepo.findByLocationIdAndRecordedAtAfterOrderByRecordedAtAsc(
                UUID.fromString(id), Instant.now().minus(30, ChronoUnit.DAYS))).hasSizeGreaterThan(100);

        mvc.perform(get("/api/forecast/" + id).header("Authorization", bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.source").value("ml"))
                .andExpect(jsonPath("$.model.maeTemp").value(0.8))
                .andExpect(jsonPath("$.predictions[0].confidenceScore").isNumber())
                .andExpect(jsonPath("$.predictions[0].providerTemp").isNumber()); // shown beside the provider's value

        assertThat(predictionRepo.count()).isGreaterThan(0); // predictions are stored (Table 8.4)
    }

    @Test
    void forecastFallsBackToBaselineWhenTheModelServiceIsDown() throws Exception {
        when(ml.predict(any())).thenThrow(new MlClient.MlUnavailableException("down", null));
        String token = newUser();
        String id = saveLocation(token, "Madurai, Tamil Nadu, India");

        mvc.perform(get("/api/forecast/" + id).header("Authorization", bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.source").value("baseline"))
                .andExpect(jsonPath("$.note").isNotEmpty())
                .andExpect(jsonPath("$.predictions").isNotEmpty());
    }

    @Test
    void usersCannotSeeOrDeleteEachOthersLocations() throws Exception {
        String owner = newUser();
        String intruder = newUser();
        String id = saveLocation(owner, "Coimbatore, Tamil Nadu, India");

        mvc.perform(get("/api/forecast/" + id).header("Authorization", bearer(intruder))).andExpect(status().isNotFound());
        mvc.perform(delete("/api/locations/" + id).header("Authorization", bearer(intruder))).andExpect(status().isNotFound());
        mvc.perform(get("/api/locations").header("Authorization", bearer(intruder))).andExpect(jsonPath("$").isEmpty());
        mvc.perform(get("/api/locations").header("Authorization", bearer(owner))).andExpect(jsonPath("$.length()").value(1));
    }

    @Test
    void duplicateAndDeletedLocations() throws Exception {
        String token = newUser();
        String id = saveLocation(token, "Salem, Tamil Nadu, India");
        mvc.perform(post("/api/locations").header("Authorization", bearer(token)).contentType(MediaType.APPLICATION_JSON)
                .content(locationJson("salem, tamil nadu, india"))).andExpect(status().isConflict());

        mvc.perform(delete("/api/locations/" + id).header("Authorization", bearer(token))).andExpect(status().isNoContent());
        mvc.perform(get("/api/locations").header("Authorization", bearer(token))).andExpect(jsonPath("$").isEmpty());
    }

    @Test
    void guestsGetAForecastForAnyCoordinateAndBadInputIsRejected() throws Exception {
        mvc.perform(get("/api/forecast").param("lat", "13.08").param("lon", "80.27").param("city", "Chennai"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.predictions").isNotEmpty())
                .andExpect(jsonPath("$.locationId").doesNotExist());
        mvc.perform(get("/api/forecast").param("lat", "999").param("lon", "80")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/weather").param("lat", "abc").param("lon", "80")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/locations/search").param("q", "chen")).andExpect(status().isOk())
                .andExpect(jsonPath("$[0].name").value("Chennai"));
        mvc.perform(get("/api/locations/search").param("q", "c")).andExpect(jsonPath("$").isEmpty());
    }

    @Test
    void weatherResponseCarriesDailyForecastUvAndTheLocalTimeZone() throws Exception {
        mvc.perform(get("/api/weather").param("lat", "13.08").param("lon", "80.27"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.utcOffsetSeconds").value(19800))
                .andExpect(jsonPath("$.timezone").value("Asia/Kolkata"))
                .andExpect(jsonPath("$.current.uvIndex").value(6.0))
                .andExpect(jsonPath("$.daily.length()").value(7))
                .andExpect(jsonPath("$.daily[0].tempMax").isNumber())
                .andExpect(jsonPath("$.daily[0].sunrise").isNotEmpty());
    }

    @Test
    void airQualityIsPublicAndValidated() throws Exception {
        mvc.perform(get("/api/air").param("lat", "13.08").param("lon", "80.27"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.usAqi").value(85.0))
                .andExpect(jsonPath("$.pm25").value(28.4));
        mvc.perform(get("/api/air").param("lat", "200").param("lon", "80")).andExpect(status().isBadRequest());
        when(provider.airQuality(7.7, 7.7)).thenThrow(new WeatherProviderException("Air quality is unavailable right now", null));
        mvc.perform(get("/api/air").param("lat", "7.7").param("lon", "7.7")).andExpect(status().isBadGateway());
    }

    @Test
    void providerOutageIsAGatewayErrorNotACrash() throws Exception {
        when(provider.snapshot(1.5, 2.5)).thenThrow(new WeatherProviderException("Weather provider is unavailable right now", null));
        mvc.perform(get("/api/weather").param("lat", "1.5").param("lon", "2.5"))
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.error").value("Weather provider is unavailable right now"));
    }

    // ------------------------------------------------------------------ chat

    @Test
    void chatAnswersFromWeatherDataWhenNoLlmIsConfigured() throws Exception {
        when(provider.snapshot(13.0, 80.2)).thenReturn(snapshot(80));   // a clearly wet day
        mvc.perform(post("/api/chat").contentType(MediaType.APPLICATION_JSON).content(chatJson("Should I carry an umbrella?", 13.0, 80.2)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.source").value("rules"))
                .andExpect(jsonPath("$.reply").value(org.hamcrest.Matchers.containsStringIgnoringCase("umbrella")));
    }

    @Test
    void chatNeedsALocationAndAMessage() throws Exception {
        mvc.perform(post("/api/chat").contentType(MediaType.APPLICATION_JSON).content("{\"message\":\"hi\"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/chat").contentType(MediaType.APPLICATION_JSON).content(chatJson("  ", 13.0, 80.2)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void signedInChatIsStoredAndReturnedInHistory() throws Exception {
        String token = newUser();
        mvc.perform(post("/api/chat").header("Authorization", bearer(token)).contentType(MediaType.APPLICATION_JSON)
                .content(chatJson("Is it windy?", 13.0, 80.2))).andExpect(status().isOk());

        mvc.perform(get("/api/chat/history").header("Authorization", bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].senderType").value("user"))
                .andExpect(jsonPath("$[1].senderType").value("bot"));

        String other = newUser();   // another user's history stays empty
        mvc.perform(get("/api/chat/history").header("Authorization", bearer(other))).andExpect(jsonPath("$").isEmpty());
    }

    @Test
    void chatAboutASavedLocationRequiresOwningIt() throws Exception {
        String owner = newUser();
        String id = saveLocation(owner, "Trichy, Tamil Nadu, India");
        String body = "{\"message\":\"rain?\",\"locationId\":\"" + id + "\"}";

        mvc.perform(post("/api/chat").contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/chat").header("Authorization", bearer(newUser())).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isNotFound());
        mvc.perform(post("/api/chat").header("Authorization", bearer(owner)).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk());
    }

    // ------------------------------------------------------------------ admin

    @Test
    void adminStatsAreAdminOnly() throws Exception {
        mvc.perform(get("/api/admin/stats")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/admin/stats").header("Authorization", bearer(newUser()))).andExpect(status().isForbidden());

        String adminToken = token(register("Admin", "admin@example.com", "password123"));
        mvc.perform(get("/api/admin/stats").header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.users").isNumber())
                .andExpect(jsonPath("$.evaluatedPredictions").isNumber());
    }

    // ------------------------------------------------------------------ helpers

    private ResultActions register(String name, String email, String password) throws Exception {
        return mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("name", name, "email", email, "password", password))));
    }

    private ResultActions login(String email, String password) throws Exception {
        return mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("email", email, "password", password))));
    }

    private String newUser() throws Exception {
        return token(register("Test User", unique() + "@example.com", "password123"));
    }

    private String token(ResultActions r) throws Exception {
        JsonNode n = json.readTree(r.andReturn().getResponse().getContentAsString());
        return n.get("token").asText();
    }

    private String saveLocation(String token, String city) throws Exception {
        String res = mvc.perform(post("/api/locations").header("Authorization", bearer(token))
                        .contentType(MediaType.APPLICATION_JSON).content(locationJson(city)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return json.readTree(res).get("id").asText();
    }

    private static String locationJson(String city) {
        return "{\"cityName\":\"" + city + "\",\"latitude\":13.08,\"longitude\":80.27}";
    }

    private static String chatJson(String msg, double lat, double lon) {
        return "{\"message\":\"" + msg + "\",\"latitude\":" + lat + ",\"longitude\":" + lon + ",\"cityName\":\"Chennai\"}";
    }

    private static String bearer(String token) { return "Bearer " + token; }

    private static String unique() { return "u" + UUID.randomUUID().toString().substring(0, 8); }

    // ---- fixtures

    static Snapshot snapshot(double rainChance) {
        Instant hour = Instant.now().truncatedTo(ChronoUnit.HOURS);
        List<Hourly> next = new ArrayList<>();
        for (int i = 1; i <= 48; i++) {
            // provider hours sit on :30 like India (UTC+5:30) - matching to the AI's whole hours must still work
            next.add(new Hourly(hour.plus(i, ChronoUnit.HOURS).plus(30, ChronoUnit.MINUTES), 28.0 + (i % 6), 70.0, 12.0,
                    0.0, rainChance, "Cloudy"));
        }
        List<Daily> daily = new ArrayList<>();
        for (int d = 0; d < 7; d++) {
            daily.add(new Daily(LocalDate.now().plusDays(d), 32.0 - d, 26.0, d == 2 ? "Rain" : "Partly Cloudy", 30.0,
                    hour.minus(5, ChronoUnit.HOURS), hour.plus(7, ChronoUnit.HOURS), 9.0));
        }
        return new Snapshot(13.08, 80.27, Instant.now(), 19800, "Asia/Kolkata",
                new Current(hour, 30.0, 34.0, 70, 12, 1006, 0, "Partly Cloudy", 6.0), next, daily);
    }

    static List<Hourly> history(int hours) {
        Instant end = Instant.now().truncatedTo(ChronoUnit.HOURS);
        List<Hourly> out = new ArrayList<>();
        for (int i = hours - 1; i >= 0; i--) {
            Instant t = end.minus(i, ChronoUnit.HOURS);
            double phase = Math.sin(2 * Math.PI * (t.atZone(java.time.ZoneOffset.UTC).getHour() - 9) / 24.0);
            out.add(new Hourly(t, 28 + 5 * phase, 70 - 15 * phase, 12.0, 0.0, null, phase > 0.3 ? "Clear" : "Cloudy"));
        }
        return out;
    }

    static MlClient.Response mlResponse() {
        Instant hour = Instant.now().truncatedTo(ChronoUnit.HOURS);
        List<MlClient.Prediction> ps = new ArrayList<>();
        for (int h : new int[] {3, 6, 12, 24}) {
            ps.add(new MlClient.Prediction(h, hour.plus(h, ChronoUnit.HOURS).toString(), 29.0 + h / 10.0, "Cloudy", 0.9 - h * 0.01));
        }
        return new MlClient.Response(new MlClient.Model("test-model", 0.8, 143), ps);
    }
}
