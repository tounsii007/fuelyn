package com.tankpilot.gateway.filter;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
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

import java.net.InetSocketAddress;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * IP-based rate limiter using a sliding window with Caffeine cache.
 * Returns 429 Too Many Requests when the limit is exceeded.
 */
@Component
public class RateLimitFilter implements GlobalFilter, Ordered {

    private static final Logger log = LoggerFactory.getLogger(RateLimitFilter.class);

    private final int burstCapacity;
    private final Cache<String, AtomicInteger> requestCounts;

    public RateLimitFilter(TankpilotProperties properties) {
        this.burstCapacity = properties.getGateway().getRateLimit().getBurstCapacity();
        this.requestCounts = Caffeine.newBuilder()
                .maximumSize(10_000)
                .expireAfterWrite(1, TimeUnit.SECONDS)
                .build();
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        String clientIp = extractClientIp(exchange);
        AtomicInteger counter = requestCounts.get(clientIp, k -> new AtomicInteger(0));

        int currentCount = counter.incrementAndGet();
        if (currentCount > burstCapacity) {
            log.warn("Rate limit exceeded for IP: {} ({} requests)", clientIp, currentCount);
            exchange.getResponse().setStatusCode(HttpStatus.TOO_MANY_REQUESTS);
            exchange.getResponse().getHeaders().add("Retry-After", "1");
            return exchange.getResponse().setComplete();
        }

        // Add rate limit headers
        exchange.getResponse().getHeaders().add("X-RateLimit-Limit", String.valueOf(burstCapacity));
        exchange.getResponse().getHeaders().add("X-RateLimit-Remaining",
                String.valueOf(Math.max(0, burstCapacity - currentCount)));

        return chain.filter(exchange);
    }

    private String extractClientIp(ServerWebExchange exchange) {
        // Check X-Forwarded-For first (behind reverse proxy)
        String forwarded = exchange.getRequest().getHeaders().getFirst("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.split(",")[0].trim();
        }

        InetSocketAddress remoteAddress = exchange.getRequest().getRemoteAddress();
        if (remoteAddress != null) {
            return remoteAddress.getAddress().getHostAddress();
        }
        return "unknown";
    }

    @Override
    public int getOrder() {
        return Ordered.HIGHEST_PRECEDENCE + 1;
    }
}
