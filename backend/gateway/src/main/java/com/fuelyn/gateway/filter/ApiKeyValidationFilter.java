package com.fuelyn.gateway.filter;

import com.fuelyn.gateway.config.TankpilotProperties;
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

    private static final List<String> PUBLIC_PREFIXES = List.of("/actuator", "/fallback");

    private final List<String> validApiKeys;

    public ApiKeyValidationFilter(TankpilotProperties properties) {
        // Pre-filter to drop empty / blank entries that a misconfigured
        // env-var expansion might leave behind. Otherwise the loop below
        // would still iterate them (good for constant-time guarantees) but
        // every empty entry takes one constant-time comparison for nothing.
        this.validApiKeys = properties.getSecurity().getApiKeys() == null
                ? List.of()
                : properties.getSecurity().getApiKeys().stream()
                        .filter(k -> k != null && !k.isBlank())
                        .toList();
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        String path = exchange.getRequest().getURI().getPath();

        // Skip validation for actuator, health, and fallback endpoints.
        // Anchor the prefix at a path-segment boundary so /actuator-evil
        // doesn't match /actuator and bypass the auth check.
        if (isPublicPath(path)) {
            return chain.filter(exchange);
        }

        // Skip if no API keys are configured (dev mode)
        if (validApiKeys.isEmpty()) {
            return chain.filter(exchange);
        }

        String providedKey = exchange.getRequest().getHeaders().getFirst(API_KEY_HEADER);
        if (providedKey == null || providedKey.isBlank()) {
            log.warn("Missing API key for request: {} {}", exchange.getRequest().getMethod(), path);
            exchange.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
            return exchange.getResponse().setComplete();
        }

        // Iterate ALL configured keys with a non-short-circuiting OR. The
        // previous Stream.anyMatch returned at the first hit, leaking
        // information about WHICH key matched via response-time variance.
        // Now every accepted key incurs the same total compare cost.
        byte[] providedBytes = providedKey.getBytes(java.nio.charset.StandardCharsets.UTF_8);
        boolean valid = false;
        for (String key : validApiKeys) {
            byte[] keyBytes = key.getBytes(java.nio.charset.StandardCharsets.UTF_8);
            valid |= MessageDigest.isEqual(keyBytes, providedBytes);
        }

        if (!valid) {
            log.warn("Invalid API key for request: {} {}", exchange.getRequest().getMethod(), path);
            exchange.getResponse().setStatusCode(HttpStatus.FORBIDDEN);
            return exchange.getResponse().setComplete();
        }

        return chain.filter(exchange);
    }

    private static boolean isPublicPath(String path) {
        for (String p : PUBLIC_PREFIXES) {
            if (path.equals(p) || path.startsWith(p + "/")) {
                return true;
            }
        }
        return false;
    }

    @Override
    public int getOrder() {
        return Ordered.HIGHEST_PRECEDENCE + 2;
    }
}
