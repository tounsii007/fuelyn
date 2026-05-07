package com.tankpilot.gateway.filter;

import com.tankpilot.gateway.config.TankpilotProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.security.MessageDigest;
import java.util.List;

/**
 * Validates API keys for external client requests.
 *
 * <p>Clients must include an {@code X-API-Key} header. The key is compared
 * against the configured list using constant-time comparison to prevent
 * timing attacks.</p>
 *
 * <p>Actuator and fallback endpoints are excluded from API key validation.</p>
 */
@Component
public class ApiKeyValidationFilter implements GlobalFilter, Ordered {

    private static final Logger log = LoggerFactory.getLogger(ApiKeyValidationFilter.class);
    private static final String API_KEY_HEADER = "X-API-Key";

    private final List<String> validApiKeys;

    public ApiKeyValidationFilter(TankpilotProperties properties) {
        this.validApiKeys = properties.getSecurity().getApiKeys();
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        String path = exchange.getRequest().getURI().getPath();

        // Skip validation for actuator, health, and fallback endpoints
        if (path.startsWith("/actuator") || path.startsWith("/fallback")) {
            return chain.filter(exchange);
        }

        // Skip if no API keys are configured (dev mode)
        if (validApiKeys == null || validApiKeys.isEmpty()) {
            return chain.filter(exchange);
        }

        String providedKey = exchange.getRequest().getHeaders().getFirst(API_KEY_HEADER);
        if (providedKey == null || providedKey.isBlank()) {
            log.warn("Missing API key for request: {} {}", exchange.getRequest().getMethod(), path);
            exchange.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
            return exchange.getResponse().setComplete();
        }

        boolean valid = validApiKeys.stream()
                .anyMatch(key -> constantTimeEquals(key, providedKey));

        if (!valid) {
            log.warn("Invalid API key for request: {} {}", exchange.getRequest().getMethod(), path);
            exchange.getResponse().setStatusCode(HttpStatus.FORBIDDEN);
            return exchange.getResponse().setComplete();
        }

        return chain.filter(exchange);
    }

    /**
     * Constant-time string comparison to prevent timing attacks.
     */
    private boolean constantTimeEquals(String a, String b) {
        return MessageDigest.isEqual(
                a.getBytes(java.nio.charset.StandardCharsets.UTF_8),
                b.getBytes(java.nio.charset.StandardCharsets.UTF_8)
        );
    }

    @Override
    public int getOrder() {
        return Ordered.HIGHEST_PRECEDENCE + 2;
    }
}
