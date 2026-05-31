package com.fuelyn.gateway.controller;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

/**
 * Unit tests for {@link FallbackController} — verifies each fallback route returns 503 with a
 * structured error envelope.
 */
class FallbackControllerTest {

    private final FallbackController controller = new FallbackController();

    @Test
    void priceServiceFallback_returns503WithErrorEnvelope() {
        ResponseEntity<Map<String, Object>> response = controller.priceServiceFallback();

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody()).containsEntry("success", false);
        assertThat(response.getBody()).containsEntry("service", "price-service");
        assertThat(response.getBody()).containsKey("error");
        assertThat(response.getBody()).containsKey("timestamp");
    }

    @Test
    void aiServiceFallback_returns503WithErrorEnvelope() {
        ResponseEntity<Map<String, Object>> response = controller.aiServiceFallback();

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody()).containsEntry("success", false);
        assertThat(response.getBody()).containsEntry("service", "ai-service");
        assertThat(response.getBody().get("error")).asString().contains("KI");
    }

    @Test
    void fallbackErrorMessages_areHumanReadableGerman() {
        String priceMsg = controller.priceServiceFallback().getBody().get("error").toString();
        String aiMsg = controller.aiServiceFallback().getBody().get("error").toString();

        assertThat(priceMsg).contains("Preisservice");
        assertThat(aiMsg).contains("KI-Service");
    }
}
