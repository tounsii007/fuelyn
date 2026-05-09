package com.fuelyn.common.security;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Tiny shared helper that builds the canonical service-to-service
 * authentication header set. Extracted so both the servlet-stack
 * {@link SecureServiceClient} and the reactive {@code SecureWebClient}
 * produce identical wire signatures — without one drifting from the
 * other on a refactor.
 *
 * <p>Returns a {@link LinkedHashMap} so the iteration order is stable
 * for tests and HMAC-debuggability. The map is mutable; callers are
 * expected to add their own {@code Content-Type} (or other) headers
 * after this call.</p>
 */
public final class ServiceAuthHeaders {

    private ServiceAuthHeaders() {}

    /**
     * Build the standard set of authentication headers for an outbound
     * inter-service call.
     *
     * @param body the request body that will be signed (empty string for GET/DELETE)
     * @param serviceId calling service identifier (e.g. {@code "price-service"})
     * @param hmacSecret shared HMAC secret
     * @param jwtTokenProvider JWT issuer for the service-to-service token
     * @return mutable insertion-ordered map of header name → value
     */
    public static Map<String, String> build(
            String body,
            String serviceId,
            String hmacSecret,
            JwtTokenProvider jwtTokenProvider
    ) {
        String timestamp = String.valueOf(System.currentTimeMillis());
        String requestId = UUID.randomUUID().toString();

        Map<String, String> headers = new LinkedHashMap<>();
        headers.put(ServiceAuthFilter.HEADER_SERVICE_ID, serviceId);
        headers.put(ServiceAuthFilter.HEADER_SERVICE_TOKEN,
                jwtTokenProvider.generateServiceToken(serviceId));
        headers.put(ServiceAuthFilter.HEADER_TIMESTAMP, timestamp);
        headers.put(ServiceAuthFilter.HEADER_SIGNATURE,
                HmacRequestSigner.sign(body, timestamp, hmacSecret));
        headers.put(ServiceAuthFilter.HEADER_REQUEST_ID, requestId);
        return headers;
    }
}
