package com.fuelyn.gateway.filter;

import com.fuelyn.gateway.config.FuelynProperties;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.reactivestreams.Publisher;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.core.io.buffer.DataBuffer;
import org.springframework.core.io.buffer.DataBufferLimitException;
import org.springframework.core.io.buffer.DataBufferUtils;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.http.server.reactive.ServerHttpRequestDecorator;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import javax.crypto.Mac;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Date;

/**
 * Signs outbound requests to downstream services with HMAC-SHA256 and JWT.
 *
 * <p>Adds the following headers to every proxied request:</p>
 * <ul>
 *   <li>{@code X-Signature} — HMAC-SHA256(timestamp:body)</li>
 *   <li>{@code X-Timestamp} — epoch millis when signed</li>
 *   <li>{@code X-Service-Id} — "gateway"</li>
 *   <li>{@code Authorization} — Bearer JWT for service auth</li>
 * </ul>
 */
@Component
public class HmacSigningFilter implements GlobalFilter, Ordered {

    private static final Logger log = LoggerFactory.getLogger(HmacSigningFilter.class);
    private static final String HMAC_ALGORITHM = "HmacSHA256";

    private final String hmacSecret;
    private final String serviceId;
    private final SecretKey jwtKey;
    /**
     * Hard ceiling on the size (bytes) of a request body we will buffer
     * for HMAC signing. Bodies above this limit are rejected with
     * 413 Payload Too Large rather than being read into memory — the
     * old code did an unbounded {@code DataBufferUtils.join}, which is
     * a soft DoS vector (one large upload pins gateway heap).
     */
    private final int maxSignedBodyBytes;

    public HmacSigningFilter(
            FuelynProperties properties,
            @Value("${fuelyn.gateway.max-signed-body-bytes:262144}") int maxSignedBodyBytes
    ) {
        this.hmacSecret = properties.getSecurity().getHmacSecret();
        this.serviceId = properties.getSecurity().getServiceId();
        this.jwtKey = Keys.hmacShaKeyFor(
                properties.getSecurity().getJwtSecret().getBytes(StandardCharsets.UTF_8));
        this.maxSignedBodyBytes = maxSignedBodyBytes;
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        String path = exchange.getRequest().getURI().getPath();

        // Only sign API requests to downstream services
        if (!path.startsWith("/api/")) {
            return chain.filter(exchange);
        }

        String timestamp = String.valueOf(System.currentTimeMillis());
        String jwt = generateServiceToken();

        // For requests with body (POST/PUT), read and sign the body
        if (exchange.getRequest().getMethod() != null &&
                (exchange.getRequest().getMethod().name().equals("POST") ||
                 exchange.getRequest().getMethod().name().equals("PUT"))) {
            // Bounded join — DataBufferUtils.join with maxByteCount aborts
            // the merge as soon as the limit is exceeded and emits a
            // DataBufferLimitException. We translate that into a clean
            // 413 instead of letting it bubble as a 500.
            return DataBufferUtils.join(exchange.getRequest().getBody(), maxSignedBodyBytes)
                    .onErrorMap(DataBufferLimitException.class, e -> {
                        log.warn("HMAC sign rejected: body exceeded {} bytes ({})",
                                maxSignedBodyBytes, e.getMessage());
                        return new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE,
                                "Request body too large for signing");
                    })
                    .defaultIfEmpty(exchange.getResponse().bufferFactory().wrap(new byte[0]))
                    .flatMap(dataBuffer -> {
                        byte[] bytes = new byte[dataBuffer.readableByteCount()];
                        dataBuffer.read(bytes);
                        DataBufferUtils.release(dataBuffer);
                        String body = new String(bytes, StandardCharsets.UTF_8);

                        String signature = sign(body, timestamp);

                        ServerHttpRequest mutatedRequest = exchange.getRequest().mutate()
                                .header("X-Signature", signature)
                                .header("X-Timestamp", timestamp)
                                .header("X-Service-Id", serviceId)
                                .header("Authorization", "Bearer " + jwt)
                                .build();

                        // Re-wrap body since we consumed it
                        DataBuffer newBuffer = exchange.getResponse().bufferFactory()
                                .wrap(bytes);
                        Flux<DataBuffer> newBody = Flux.just(newBuffer);

                        ServerHttpRequest decoratedRequest = new ServerHttpRequestDecorator(mutatedRequest) {
                            @Override
                            public Flux<DataBuffer> getBody() {
                                return newBody;
                            }
                        };

                        return chain.filter(exchange.mutate().request(decoratedRequest).build());
                    });
        }

        // For GET/DELETE — sign with empty body
        String signature = sign("", timestamp);
        ServerHttpRequest mutatedRequest = exchange.getRequest().mutate()
                .header("X-Signature", signature)
                .header("X-Timestamp", timestamp)
                .header("X-Service-Id", serviceId)
                .header("Authorization", "Bearer " + jwt)
                .build();

        return chain.filter(exchange.mutate().request(mutatedRequest).build());
    }

    private String sign(String body, String timestamp) {
        try {
            String payload = timestamp + ":" + body;
            Mac mac = Mac.getInstance(HMAC_ALGORITHM);
            SecretKeySpec keySpec = new SecretKeySpec(
                    hmacSecret.getBytes(StandardCharsets.UTF_8), HMAC_ALGORITHM);
            mac.init(keySpec);
            byte[] hash = mac.doFinal(payload.getBytes(StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(hash);
        } catch (Exception e) {
            log.error("HMAC signing failed: {}", e.getMessage());
            throw new RuntimeException("HMAC signing failed", e);
        }
    }

    private String generateServiceToken() {
        Date now = new Date();
        Date expiration = new Date(now.getTime() + 15L * 60L * 1000L);

        return Jwts.builder()
                .subject(serviceId)
                .claim("type", "service")
                .issuedAt(now)
                .expiration(expiration)
                .signWith(jwtKey)
                .compact();
    }

    @Override
    public int getOrder() {
        return Ordered.HIGHEST_PRECEDENCE + 10;
    }
}
