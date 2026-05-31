package com.fuelyn.gateway.filter;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.HttpStatusCode;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;

import reactor.core.publisher.Mono;

/** Logs request/response details with timing information. */
@Component
public class LoggingFilter implements GlobalFilter, Ordered {

    private static final Logger log = LoggerFactory.getLogger(LoggingFilter.class);
    private static final String START_TIME = "gatewayStartTime";

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        exchange.getAttributes().put(START_TIME, System.currentTimeMillis());

        String requestId = exchange.getRequest().getHeaders().getFirst("X-Request-Id");
        String method = String.valueOf(exchange.getRequest().getMethod());
        String path = exchange.getRequest().getURI().getPath();

        log.info("[{}] >>> {} {}", requestId, method, path);

        return chain.filter(exchange)
                .then(
                        Mono.fromRunnable(
                                () -> {
                                    Long startTime = exchange.getAttribute(START_TIME);
                                    long duration =
                                            startTime != null
                                                    ? System.currentTimeMillis() - startTime
                                                    : -1;
                                    HttpStatusCode status = exchange.getResponse().getStatusCode();

                                    log.info(
                                            "[{}] <<< {} {} - {} ({}ms)",
                                            requestId,
                                            method,
                                            path,
                                            status != null ? status.value() : "?",
                                            duration);
                                }));
    }

    @Override
    public int getOrder() {
        return Ordered.HIGHEST_PRECEDENCE + 5;
    }
}
