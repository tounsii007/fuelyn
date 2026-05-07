package com.tankpilot.common.observability;

import java.io.IOException;
import java.util.UUID;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Populates SLF4J MDC with a stable {@code requestId} for every request so that
 * log lines (and the structured JSON encoder) can be correlated across services.
 *
 * <p>If the caller supplies an {@code X-Request-Id} header (e.g. from the BFF or a
 * service mesh), that value is reused; otherwise a UUID is generated. The value
 * is echoed back in the response header so the client can quote it in bug reports.
 *
 * <p>Filter order is the highest precedence so the MDC is populated before any
 * other filter logs.
 */
@Component("tankpilotRequestContextFilter")
@Order(Ordered.HIGHEST_PRECEDENCE)
public class RequestContextFilter extends OncePerRequestFilter {

    public static final String HEADER_REQUEST_ID = "X-Request-Id";
    public static final String MDC_REQUEST_ID = "requestId";
    public static final String MDC_SERVICE_ID = "serviceId";

    private final String serviceId;

    public RequestContextFilter(
            @org.springframework.beans.factory.annotation.Value("${spring.application.name:unknown}")
                    String serviceId) {
        this.serviceId = serviceId;
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String requestId = request.getHeader(HEADER_REQUEST_ID);
        if (requestId == null || requestId.isBlank() || requestId.length() > 128) {
            requestId = UUID.randomUUID().toString();
        }
        MDC.put(MDC_REQUEST_ID, requestId);
        MDC.put(MDC_SERVICE_ID, serviceId);
        response.setHeader(HEADER_REQUEST_ID, requestId);
        try {
            chain.doFilter(request, response);
        } finally {
            MDC.remove(MDC_REQUEST_ID);
            MDC.remove(MDC_SERVICE_ID);
        }
    }
}
