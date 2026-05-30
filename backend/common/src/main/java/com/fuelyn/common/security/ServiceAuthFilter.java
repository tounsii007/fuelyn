package com.fuelyn.common.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Set;

/**
 * Servlet filter that validates inter-service requests using HMAC signatures.
 *
 * <p>For every incoming request (except public endpoints), this filter verifies
 * an <strong>HMAC Signature</strong> via the {@code X-Signature},
 * {@code X-Timestamp}, and {@code X-Service-Id} headers - confirming the request
 * body integrity and freshness.</p>
 *
 * <p>Public endpoints (health checks, actuator, Swagger) are excluded from
 * authentication to allow monitoring and documentation access.</p>
 *
 * <h3>Authentication Flow</h3>
 * <pre>
 * Request -> Check if public endpoint -> YES -> pass through
 *                                     -> NO  -> Check X-Signature (HMAC)
 *                                                -> valid -> pass through
 *                                                -> invalid -> 401 Unauthorized
 * </pre>
 *
 * @see HmacRequestSigner
 */
public class ServiceAuthFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(ServiceAuthFilter.class);

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

    /**
     * Hard ceiling on the body size we will buffer for HMAC verification.
     * Without this, a malicious upload sized in GB would OOM the JVM via
     * {@code getInputStream().readAllBytes()}. 256 KiB matches the gateway's
     * {@code fuelyn.gateway.max-signed-body-bytes} default and is more than
     * any legitimate inter-service JSON request needs.
     */
    private static final int DEFAULT_MAX_SIGNED_BODY_BYTES = 256 * 1024;

    private final String hmacSecret;
    private final int maxSignedBodyBytes;

    /**
     * Constructs a new service authentication filter with the default body cap.
     */
    public ServiceAuthFilter(String hmacSecret) {
        this(hmacSecret, DEFAULT_MAX_SIGNED_BODY_BYTES);
    }

    /**
     * Constructs a new service authentication filter with an explicit body cap.
     *
     * @param maxSignedBodyBytes maximum number of body bytes we will buffer
     *                           for HMAC verification; requests exceeding
     *                           this limit are rejected with 413.
     */
    public ServiceAuthFilter(String hmacSecret, int maxSignedBodyBytes) {
        this.hmacSecret = hmacSecret;
        this.maxSignedBodyBytes = maxSignedBodyBytes;
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

        // HMAC signature verification
        String signature = request.getHeader(HEADER_SIGNATURE);
        String timestamp = request.getHeader(HEADER_TIMESTAMP);
        String serviceId = request.getHeader(HEADER_SERVICE_ID);

        if (signature != null && timestamp != null && serviceId != null) {
            // Bounded read of the request body for HMAC verification. The
            // previous unbounded readAllBytes() was a soft-DoS vector — any
            // attacker that could reach the filter could pin the JVM heap
            // with a multi-GB upload before running out of memory.
            byte[] cached;
            try {
                cached = readBodyWithCap(request.getInputStream(), maxSignedBodyBytes);
            } catch (BodyTooLargeException tooBig) {
                log.warn("HMAC body exceeded {} bytes from service '{}' for {} {}",
                        maxSignedBodyBytes, serviceId, request.getMethod(), path);
                response.setStatus(HttpStatus.PAYLOAD_TOO_LARGE.value());
                response.setContentType(MediaType.APPLICATION_JSON_VALUE);
                response.getWriter().write(
                        "{\"success\":false,\"error\":{\"code\":\"PAYLOAD_TOO_LARGE\","
                                + "\"message\":\"Request body too large for HMAC verification\"}}"
                );
                return;
            }
            String body = new String(cached, StandardCharsets.UTF_8);

            if (HmacRequestSigner.verify(body, timestamp, signature, hmacSecret)) {
                log.debug("Authenticated service '{}' via HMAC for {} {}", serviceId, request.getMethod(), path);
                // Reading the body above consumed the single-pass servlet
                // stream. Replay those exact bytes downstream so the
                // controller's @RequestBody parsing still works.
                CachedBodyHttpServletRequest replayable =
                        new CachedBodyHttpServletRequest(request, cached);
                replayable.setAttribute("authenticatedServiceId", serviceId);
                filterChain.doFilter(replayable, response);
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
     * <p>Match anchors at a path-segment boundary so {@code /actuator-evil}
     * does NOT match {@code /actuator}. Without this anchor, an attacker
     * could craft any path that happens to start with a public prefix and
     * bypass authentication.</p>
     *
     * @param path the request URI path
     * @return {@code true} if the path matches a known public endpoint prefix
     */
    private boolean isPublicPath(String path) {
        return PUBLIC_PATHS.stream().anyMatch(p -> path.equals(p) || path.startsWith(p + "/"));
    }

    /** Marker exception for the bounded-body-read short-circuit. */
    private static final class BodyTooLargeException extends IOException {
        BodyTooLargeException(int cap) { super("body exceeds " + cap + " bytes"); }
    }

    /**
     * Read up to {@code cap} bytes from the input stream into a byte array.
     * Throws {@link BodyTooLargeException} as soon as the cap is exceeded —
     * we do NOT keep reading "to drain" because the goal is to fail fast
     * before allocating more memory than the cap allows.
     */
    private static byte[] readBodyWithCap(ServletInputStream in, int cap) throws IOException {
        ByteArrayOutputStream buf = new ByteArrayOutputStream();
        byte[] chunk = new byte[Math.min(8 * 1024, cap)];
        int total = 0;
        int read;
        while ((read = in.read(chunk)) != -1) {
            total += read;
            if (total > cap) {
                throw new BodyTooLargeException(cap);
            }
            buf.write(chunk, 0, read);
        }
        return buf.toByteArray();
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
