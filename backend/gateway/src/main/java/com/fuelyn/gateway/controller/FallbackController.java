package com.fuelyn.gateway.controller;

import java.time.LocalDateTime;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RestController;

/**
 * Circuit breaker fallback controller.
 *
 * <p>When a downstream service is unavailable and the circuit breaker opens, Spring Cloud Gateway
 * routes to these fallback endpoints instead of returning a raw 503 error.
 */
@RestController
@RequestMapping("/fallback")
public class FallbackController {

    private static final Logger log = LoggerFactory.getLogger(FallbackController.class);

    @RequestMapping(
            path = "/price-service",
            method = {RequestMethod.GET, RequestMethod.POST})
    public ResponseEntity<Map<String, Object>> priceServiceFallback() {
        log.warn("Price Service fallback triggered — circuit breaker is open");
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .body(
                        Map.of(
                                "success",
                                false,
                                "error",
                                "Der Preisservice ist voruebergehend nicht erreichbar. Bitte versuche es in wenigen Sekunden erneut.",
                                "service",
                                "price-service",
                                "timestamp",
                                LocalDateTime.now().toString()));
    }

    @RequestMapping(
            path = "/ai-service",
            method = {RequestMethod.GET, RequestMethod.POST})
    public ResponseEntity<Map<String, Object>> aiServiceFallback() {
        log.warn("AI Service fallback triggered — circuit breaker is open");
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .body(
                        Map.of(
                                "success",
                                false,
                                "error",
                                "Der KI-Service ist voruebergehend nicht erreichbar. Lokale Heuristik wird verwendet.",
                                "service",
                                "ai-service",
                                "timestamp",
                                LocalDateTime.now().toString()));
    }
}
