package com.tankpilot.gateway.controller;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Root + 404 catch-all for the gateway.
 *
 * <p>Without these, hitting {@code https://api.localhost:49443/}
 * fell through to Spring Security's deny path and triggered a
 * Basic-Auth browser dialog. Now both the root and any unmatched
 * path return a small, discoverable JSON document explaining how
 * the gateway is meant to be used.</p>
 */
@RestController
public class IndexController {

    @GetMapping("/")
    public ResponseEntity<Map<String, Object>> index() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("service", "tankpilot-gateway");
        body.put("status", "ok");
        body.put("authentication", "X-API-Key header required for /api/v1/**");
        body.put("routes", List.of(
                Map.of("path", "/api/v1/prices/**",  "target", "price-service"),
                Map.of("path", "/api/v1/stream/**",  "target", "price-service (Server-Sent Events)"),
                Map.of("path", "/api/v1/ai/**",      "target", "ai-service"),
                Map.of("path", "/actuator/health",   "target", "liveness probe (no auth)")
        ));
        body.put("docs", "https://github.com/tankpilot/tankpilot");
        body.put("timestamp", Instant.now().toString());
        return ResponseEntity.ok(body);
    }

    @GetMapping("/favicon.ico")
    public ResponseEntity<Void> favicon() {
        // Browsers always probe /favicon.ico — return 204 so the
        // request stays out of the 401 stream.
        return ResponseEntity.noContent().build();
    }
}
