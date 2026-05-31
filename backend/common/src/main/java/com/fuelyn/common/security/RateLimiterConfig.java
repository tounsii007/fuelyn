package com.fuelyn.common.security;

import java.io.IOException;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicLong;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.filter.OncePerRequestFilter;

import com.fuelyn.common.config.SecurityProperties;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;

/**
 * Global rate limiter using a token bucket algorithm backed by Caffeine cache.
 *
 * <p>This filter enforces per-IP rate limiting to prevent abuse and protect downstream services
 * from excessive traffic. Each unique client IP address gets its own token bucket that refills over
 * time.
 *
 * <h3>Configuration Properties</h3>
 *
 * <ul>
 *   <li>{@code fuelyn.rate-limit.requests-per-minute} - maximum requests per minute per IP
 *       (default: 60)
 *   <li>{@code fuelyn.rate-limit.enabled} - enable/disable rate limiting (default: true)
 * </ul>
 *
 * <h3>Algorithm</h3>
 *
 * <p>Uses a sliding window counter stored in a Caffeine cache with a 1-minute TTL. Each IP's
 * request count is tracked per window. When the count exceeds the configured limit, requests are
 * rejected with HTTP 429 (Too Many Requests).
 *
 * <p>Response headers on every request:
 *
 * <ul>
 *   <li>{@code X-RateLimit-Limit} - the maximum number of requests per window
 *   <li>{@code X-RateLimit-Remaining} - remaining requests in the current window
 * </ul>
 *
 * @see com.fuelyn.common.exception.RateLimitExceededException
 */
@Configuration
public class RateLimiterConfig {

    private static final Logger log = LoggerFactory.getLogger(RateLimiterConfig.class);

    /**
     * Creates the per-IP rate limiting servlet filter.
     *
     * @param requestsPerMinute the maximum allowed requests per minute per IP
     * @param enabled whether rate limiting is active
     * @return the configured rate limiter filter
     */
    @Bean
    public RateLimiterFilter rateLimiterFilter(
            @Value("${fuelyn.rate-limit.requests-per-minute:60}") int requestsPerMinute,
            @Value("${fuelyn.rate-limit.enabled:true}") boolean enabled,
            TrustedProxyResolver trustedProxyResolver) {
        return new RateLimiterFilter(requestsPerMinute, enabled, trustedProxyResolver);
    }

    /**
     * Shared {@link TrustedProxyResolver} bean used by every IP-based filter across the backend.
     * Defining it here (a {@code @Configuration} that's already on every service's classpath via
     * {@code common}) means each service automatically picks up the same trusted-proxies list from
     * {@code fuelyn.security.trusted-proxies} without per-service wiring.
     */
    @Bean
    public TrustedProxyResolver trustedProxyResolver(SecurityProperties securityProperties) {
        return new TrustedProxyResolver(securityProperties.getTrustedProxies());
    }

    /**
     * Servlet filter implementing per-IP sliding window rate limiting.
     *
     * <p>Uses a Caffeine cache with automatic expiration to track request counts. Each entry
     * expires 1 minute after creation, effectively creating a sliding window for rate limit
     * enforcement.
     */
    public static class RateLimiterFilter extends OncePerRequestFilter {

        /** Header indicating the rate limit ceiling. */
        private static final String HEADER_RATE_LIMIT = "X-RateLimit-Limit";

        /** Header indicating remaining requests in the current window. */
        private static final String HEADER_RATE_REMAINING = "X-RateLimit-Remaining";

        /** Header indicating when the rate limit resets (seconds). */
        private static final String HEADER_RETRY_AFTER = "Retry-After";

        private final int maxRequestsPerMinute;
        private final boolean enabled;
        private final TrustedProxyResolver trustedProxyResolver;

        /**
         * Cache mapping client IP addresses to their request counters. Entries expire 1 minute
         * after creation (sliding window).
         */
        private final Cache<String, AtomicLong> requestCounts;

        public RateLimiterFilter(
                int maxRequestsPerMinute,
                boolean enabled,
                TrustedProxyResolver trustedProxyResolver) {
            this.maxRequestsPerMinute = maxRequestsPerMinute;
            this.enabled = enabled;
            this.trustedProxyResolver = trustedProxyResolver;
            this.requestCounts =
                    Caffeine.newBuilder()
                            .expireAfterWrite(Duration.ofMinutes(1))
                            .maximumSize(10_000) // Limit memory usage
                            .build();
        }

        @Override
        protected void doFilterInternal(
                HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
                throws ServletException, IOException {

            if (!enabled) {
                filterChain.doFilter(request, response);
                return;
            }

            String clientIp = resolveClientIp(request);
            AtomicLong counter = requestCounts.get(clientIp, key -> new AtomicLong(0));
            long currentCount = counter.incrementAndGet();

            // Always set rate limit headers for client visibility
            long remaining = Math.max(0, maxRequestsPerMinute - currentCount);
            response.setHeader(HEADER_RATE_LIMIT, String.valueOf(maxRequestsPerMinute));
            response.setHeader(HEADER_RATE_REMAINING, String.valueOf(remaining));

            if (currentCount > maxRequestsPerMinute) {
                log.warn(
                        "Rate limit exceeded for IP '{}': {}/{} requests/min",
                        clientIp,
                        currentCount,
                        maxRequestsPerMinute);
                response.setHeader(HEADER_RETRY_AFTER, "60");
                sendRateLimitResponse(response);
                return;
            }

            filterChain.doFilter(request, response);
        }

        /**
         * Resolves the real client IP via {@link TrustedProxyResolver}. X-Forwarded-For is now only
         * honoured when the immediate remote address is itself in the configured trusted-proxy CIDR
         * list, defeating header-spoof bypass of the rate limit.
         */
        private String resolveClientIp(HttpServletRequest request) {
            return trustedProxyResolver.resolve(
                    request.getRemoteAddr(), request.getHeader("X-Forwarded-For"));
        }

        /**
         * Writes a 429 Too Many Requests JSON response.
         *
         * @param response the HTTP servlet response
         * @throws IOException if writing the response fails
         */
        private void sendRateLimitResponse(HttpServletResponse response) throws IOException {
            response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.getWriter()
                    .write(
                            "{\"success\":false,\"error\":{\"code\":\"RATE_LIMIT_EXCEEDED\","
                                    + "\"message\":\"Too many requests. Please try again later.\"}}");
        }
    }
}
