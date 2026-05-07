package com.fuelyn.common.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.util.ContentCachingRequestWrapper;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Set;

/**
 * Servlet filter that validates inter-service requests using JWT tokens or HMAC signatures.
 *
 * <p>For every incoming request (except public endpoints), this filter checks for
 * one of two authentication mechanisms:</p>
 * <ol>
 *   <li><strong>JWT Token</strong> via {@code X-Service-Token} header - verifies the
 *       token is valid and not expired.</li>
 *   <li><strong>HMAC Signature</strong> via {@code X-Signature}, {@code X-Timestamp},
 *       and {@code X-Service-Id} headers - verifies the request body integrity and
 *       freshness.</li>
 * </ol>
 *
 * <p>Public endpoints (health checks, actuator, Swagger) are excluded from
 * authentication to allow monitoring and documentation access.</p>
 *
 * <h3>Authentication Flow</h3>
 * <pre>
 * Request -> Check if public endpoint -> YES -> pass through
 *                                     -> NO  -> Check X-Service-Token (JWT)
 *                                                -> valid -> pass through
 *                                                -> missing/invalid -> Check X-Signature (HMAC)
 *                                                                      -> valid -> pass through
 *                                                                      -> invalid -> 401 Unauthorized
 * </pre>
 *
 * @see JwtTokenProvider
 * @see HmacRequestSigner
 */
public class ServiceAuthFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(ServiceAuthFilter.class);

    /** Header containing the JWT service token. */
    public static final String HEADER_SERVICE_TOKEN = "X-Service-Token";

    /** Header containing the HMAC signature. */
    public static final String HEADER_SIGNATURE = "X-Signature";

    /** Header containing the request timestamp for HMAC verification. */
    public static final String HEADER_TIMESTAMP = "X-Timestamp";

    /** Header identifying the calling service. */
    public static final String HEADER_SERVICE_ID = "X-Service-Id";

    /** Header for distributed tracing request correlation. */
    public static final String HEADER_REQUEST_ID = "X-Request-Id";

    /** Public endpoint path prefixes excluded from authentication. */
    private static final Set<String> PUBLIC_PATHS = Set.of(
            "/actuator",
            "/health",
            "/swagger-ui",
            "/v3/api-docs",
            "/error"
    );

    private final JwtTokenProvider jwtTokenProvider;
    private final String hmacSecret;

    /**
     * Constructs a new service authentication filter.
     *
     * @param jwtTokenProvider the JWT token provider for token verification
     * @param hmacSecret       the shared HMAC secret for signature verification
     */
    public ServiceAuthFilter(JwtTokenProvider jwtTokenProvider, String hmacSecret) {
        this.jwtTokenProvider = jwtTokenProvider;
        this.hmacSecret = hmacSecret;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {

        String path = request.getRequestURI();

        // Allow public endpoints without authentication
        if (isPublicPath(path)) {
            filterChain.doFilter(request, response);
            return;
        }

        // Try JWT authentication first
        String serviceToken = request.getHeader(HEADER_SERVICE_TOKEN);
        if (serviceToken != null && !serviceToken.isBlank()) {
            if (jwtTokenProvider.isValid(serviceToken)) {
                String serviceId = jwtTokenProvider.getServiceId(serviceToken);
                log.debug("Authenticated service '{}' via JWT for {} {}", serviceId, request.getMethod(), path);
                request.setAttribute("authenticatedServiceId", serviceId);
                filterChain.doFilter(request, response);
                return;
            }
            log.warn("Invalid JWT token received for {} {}", request.getMethod(), path);
        }

        // Fall back to HMAC signature verification
        String signature = request.getHeader(HEADER_SIGNATURE);
        String timestamp = request.getHeader(HEADER_TIMESTAMP);
        String serviceId = request.getHeader(HEADER_SERVICE_ID);

        if (signature != null && timestamp != null && serviceId != null) {
            // Wrap request to allow reading the body multiple times
            ContentCachingRequestWrapper wrappedRequest =
                    (request instanceof ContentCachingRequestWrapper)
                            ? (ContentCachingRequestWrapper) request
                            : new ContentCachingRequestWrapper(request);

            // Read the request body for HMAC verification
            // Force the body to be cached by reading the input stream
            wrappedRequest.getInputStream().readAllBytes();
            String body = new String(wrappedRequest.getContentAsByteArray(), StandardCharsets.UTF_8);

            if (HmacRequestSigner.verify(body, timestamp, signature, hmacSecret)) {
                log.debug("Authenticated service '{}' via HMAC for {} {}", serviceId, request.getMethod(), path);
                wrappedRequest.setAttribute("authenticatedServiceId", serviceId);
                filterChain.doFilter(wrappedRequest, response);
                return;
            }
            log.warn("Invalid HMAC signature from service '{}' for {} {}", serviceId, request.getMethod(), path);
        }

        // No valid authentication found
        log.warn("Unauthorized request rejected: {} {} from {}",
                request.getMethod(), path, request.getRemoteAddr());
        sendUnauthorizedResponse(response, "Missing or invalid service credentials");
    }

    /**
     * Checks whether the given request path is a public endpoint.
     *
     * @param path the request URI path
     * @return {@code true} if the path matches a known public endpoint prefix
     */
    private boolean isPublicPath(String path) {
        return PUBLIC_PATHS.stream().anyMatch(path::startsWith);
    }

    /**
     * Writes a 401 Unauthorized JSON response.
     *
     * @param response the HTTP response
     * @param message  the error message to include
     * @throws IOException if writing the response fails
     */
    private void sendUnauthorizedResponse(HttpServletResponse response, String message) throws IOException {
        response.setStatus(HttpStatus.UNAUTHORIZED.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.getWriter().write(
                "{\"success\":false,\"error\":{\"code\":\"UNAUTHORIZED\",\"message\":\"%s\"}}"
                        .formatted(message)
        );
    }
}
