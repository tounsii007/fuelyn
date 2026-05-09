package com.fuelyn.gateway.filter;

import org.springframework.beans.factory.annotation.Value;
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

    /**
     * Whether to emit Strict-Transport-Security. Off by default — HSTS on
     * a plain-HTTP local dev setup pins browsers into HTTPS-only that
     * doesn't exist yet. Production deployments behind TLS termination
     * should set fuelyn.gateway.security.hsts-enabled=true.
     */
    private final boolean hstsEnabled;
    private final String hstsValue;

    public SecurityHeadersFilter(
            @Value("${fuelyn.gateway.security.hsts-enabled:false}") boolean hstsEnabled,
            @Value("${fuelyn.gateway.security.hsts-max-age:31536000}") long hstsMaxAge,
            @Value("${fuelyn.gateway.security.hsts-include-subdomains:true}") boolean includeSub
    ) {
        this.hstsEnabled = hstsEnabled;
        this.hstsValue = "max-age=" + hstsMaxAge
                + (includeSub ? "; includeSubDomains" : "");
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        return chain.filter(exchange).then(Mono.fromRunnable(() -> {
            HttpHeaders headers = exchange.getResponse().getHeaders();
            headers.addIfAbsent("X-Content-Type-Options", "nosniff");
            headers.addIfAbsent("X-Frame-Options", "DENY");
            // X-XSS-Protection is deprecated/disabled in modern browsers,
            // but legacy ones (older Safari, IE) still honour it; cheap to
            // keep until traffic share drops to noise.
            headers.addIfAbsent("X-XSS-Protection", "1; mode=block");
            headers.addIfAbsent("Referrer-Policy", "strict-origin-when-cross-origin");
            headers.addIfAbsent("Permissions-Policy",
                    "camera=(), microphone=(), geolocation=(self)");
            headers.addIfAbsent("Cache-Control", "no-store, no-cache, must-revalidate");
            // Block legacy Flash / Silverlight cross-domain XML lookups.
            headers.addIfAbsent("X-Permitted-Cross-Domain-Policies", "none");
            if (hstsEnabled) {
                headers.addIfAbsent("Strict-Transport-Security", hstsValue);
            }
            // Remove server header to avoid leaking tech stack
            headers.remove("Server");
        }));
    }

    @Override
    public int getOrder() {
        return Ordered.LOWEST_PRECEDENCE;
    }
}
