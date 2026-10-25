package com.vanillai.nanban.chat;

import com.fasterxml.jackson.databind.JsonNode;
import com.vanillai.nanban.config.NanbanProperties;
import java.util.List;
import java.util.Map;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/** Thin wrapper over the LLM HTTP API (Anthropic Messages API). The key comes from the environment. */
@Component
public class LlmClient {

    public static class LlmException extends RuntimeException {
        public LlmException(String m, Throwable c) { super(m, c); }
    }

    public record Turn(String role, String content) {}

    private final NanbanProperties.Chat cfg;
    private final RestClient http;

    public LlmClient(NanbanProperties props) {
        this.cfg = props.chat();
        SimpleClientHttpRequestFactory rf = new SimpleClientHttpRequestFactory();
        rf.setConnectTimeout(5000);
        rf.setReadTimeout(30000);
        this.http = RestClient.builder().requestFactory(rf).build();
    }

    public boolean isConfigured() {
        return cfg.apiKey() != null && !cfg.apiKey().isBlank();
    }

    public String complete(String system, List<Turn> turns) {
        if (!isConfigured()) throw new LlmException("LLM API key not configured", null);
        Map<String, Object> body = Map.of(
                "model", cfg.model(),
                "max_tokens", 400,
                "system", system,
                "messages", turns.stream().map(t -> Map.of("role", t.role(), "content", t.content())).toList());
        try {
            JsonNode res = http.post().uri(cfg.apiUrl())
                    .header("x-api-key", cfg.apiKey())
                    .header("anthropic-version", "2023-06-01")
                    .header("content-type", "application/json")
                    .body(body).retrieve().body(JsonNode.class);
            StringBuilder sb = new StringBuilder();
            if (res != null && res.has("content")) {
                for (JsonNode block : res.get("content")) {
                    if ("text".equals(block.path("type").asText())) sb.append(block.path("text").asText());
                }
            }
            if (sb.isEmpty()) throw new LlmException("LLM returned an empty reply", null);
            return sb.toString().trim();
        } catch (RestClientException e) {
            throw new LlmException("LLM request failed: " + e.getMessage(), e);
        }
    }
}
