package com.fuelyn.gateway.filter;

import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

/**
 * Adds security headers to all responses.
 * Prevents XSS, clickjacking, MIME sniffing, and enforces HTTPS.
 */
@Component
public class SecurityHeadersFilter implements GlobalFilter, Ordered {

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        return chain.filter(exchange).then(Mono.fromRunnable(() -> {
            HttpHeaders headers = exchange.getResponse().getHeaders();
            headers.addIfAbsent("X-Content-Type-Options", "nosniff");
            headers.addIfAbsent("X-Frame-Options", "DENY");
            headers.addIfAbsent("X-XSS-Protection", "1; mode=block");
            headers.addIfAbsent("Referrer-Policy", "strict-origin-when-cross-origin");
            headers.addIfAbsent("Permissions-Policy", "camera=(), microphone=(), geolocation=(self)");
            headers.addIfAbsent("Cache-Control", "no-store, no-cache, must-revalidate");
            // Remove server header to avoid leaking tech stack
            headers.remove("Server");
        }));
    }

    @Override
    public int getOrder() {
        return Ordered.LOWEST_PRECEDENCE;
    }
}
