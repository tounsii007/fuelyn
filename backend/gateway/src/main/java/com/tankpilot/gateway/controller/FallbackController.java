package com.tankpilot.gateway.controller;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDateTime;
import java.util.Map;

/**
 * Circuit breaker fallback controller.
 *
 * <p>When a downstream service is unavailable and the circuit breaker opens,
 * Spring Cloud Gateway routes to these fallback endpoints instead of
 * returning a raw 503 error.</p>
 */
@RestController
@RequestMapping("/fallback")
public class FallbackController {

    private static final Logger log = LoggerFactory.getLogger(FallbackController.class);

    @GetMapping("/price-service")
    @PostMapping("/price-service")
    public ResponseEntity<Map<String, Object>> priceServiceFallback() {
        log.warn("Price Service fallback triggered — circuit breaker is open");
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .body(Map.of(
                        "success", false,
                        "error", "Der Preisservice ist voruebergehend nicht erreichbar. Bitte versuche es in wenigen Sekunden erneut.",
                        "service", "price-service",
                        "timestamp", LocalDateTime.now().toString()
                ));
    }

    @GetMapping("/ai-service")
    @PostMapping("/ai-service")
    public ResponseEntity<Map<String, Object>> aiServiceFallback() {
        log.warn("AI Service fallback triggered — circuit breaker is open");
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .body(Map.of(
                        "success", false,
                        "error", "Der KI-Service ist voruebergehend nicht erreichbar. Lokale Heuristik wird verwendet.",
                        "service", "ai-service",
                        "timestamp", LocalDateTime.now().toString()
                ));
    }
}
