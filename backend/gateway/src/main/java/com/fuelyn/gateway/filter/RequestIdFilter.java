package com.fuelyn.gateway.filter;

import java.util.UUID;
import java.util.regex.Pattern;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;

import reactor.core.publisher.Mono;

/**
 * Assigns a unique X-Request-Id to every request for tracing across services. Runs first in the
 * filter chain (highest priority).
 */
@Component
public class RequestIdFilter implements GlobalFilter, Ordered {

    private static final Logger log = LoggerFactory.getLogger(RequestIdFilter.class);
    private static final String REQUEST_ID_HEADER = "X-Request-Id";

    /**
     * Allow-list for caller-supplied request IDs. Matches the common-module RequestContextFilter
     * pattern. Anything outside the safe character set (hex / dash / underscore / dot, 1..128
     * chars) is replaced with a fresh UUID — defends downstream log lines and the response header
     * against CRLF / control-char injection.
     */
    private static final Pattern SAFE_REQUEST_ID = Pattern.compile("[A-Za-z0-9._\\-]{1,128}");

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        String requestId = exchange.getRequest().getHeaders().getFirst(REQUEST_ID_HEADER);
        if (requestId == null || !SAFE_REQUEST_ID.matcher(requestId).matches()) {
            requestId = UUID.randomUUID().toString().substring(0, 8);
        }

        ServerHttpRequest mutatedRequest =
                exchange.getRequest().mutate().header(REQUEST_ID_HEADER, requestId).build();

        ServerWebExchange mutatedExchange = exchange.mutate().request(mutatedRequest).build();

        // Also add to response
        String finalRequestId = requestId;
        mutatedExchange.getResponse().getHeaders().add(REQUEST_ID_HEADER, finalRequestId);

        log.debug(
                "[{}] {} {}",
                requestId,
                exchange.getRequest().getMethod(),
                exchange.getRequest().getURI().getPath());

        return chain.filter(mutatedExchange);
    }

    @Override
    public int getOrder() {
        return Ordered.HIGHEST_PRECEDENCE;
    }
}
