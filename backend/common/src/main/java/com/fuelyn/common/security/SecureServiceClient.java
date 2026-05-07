package com.fuelyn.common.security;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fuelyn.common.exception.ExternalApiException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.HttpServerErrorException;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestTemplate;

import java.util.UUID;

/**
 * HTTP client that automatically signs outgoing requests with HMAC
 * and adds JWT service tokens for authenticated inter-service communication.
 *
 * <p>Every outgoing request is enriched with the following headers:</p>
 * <ul>
 *   <li>{@code X-Service-Id} - identifies the calling service</li>
 *   <li>{@code X-Service-Token} - a short-lived JWT for token-based auth</li>
 *   <li>{@code X-Timestamp} - epoch millisecond timestamp for HMAC freshness</li>
 *   <li>{@code X-Signature} - HMAC-SHA256 signature over timestamp:body</li>
 *   <li>{@code X-Request-Id} - UUID for distributed tracing correlation</li>
 * </ul>
 *
 * <h3>Usage Examples</h3>
 * <pre>{@code
 * // GET request with authentication
 * PriceHistory history = secureClient.get(
 *     "http://price-service:8081/api/v1/prices/history?stationId=abc",
 *     PriceHistory.class
 * );
 *
 * // POST request with authentication and HMAC body signing
 * AIResponse response = secureClient.post(
 *     "http://ai-service:8082/api/v1/ai/advisor",
 *     advisorRequest,
 *     AIResponse.class
 * );
 * }</pre>
 *
 * @see HmacRequestSigner
 * @see JwtTokenProvider
 */
@Component
public class SecureServiceClient {

    private static final Logger log = LoggerFactory.getLogger(SecureServiceClient.class);

    private final RestTemplate restTemplate;
    private final JwtTokenProvider jwtTokenProvider;
    private final ObjectMapper objectMapper;
    private final String hmacSecret;
    private final String serviceId;

    /**
     * Constructs a new secure service client.
     *
     * @param restTemplate     the REST template for HTTP calls
     * @param jwtTokenProvider the JWT provider for generating service tokens
     * @param objectMapper     the Jackson object mapper for serializing request bodies
     * @param hmacSecret       the shared HMAC signing secret
     * @param serviceId        the identifier of this service (e.g., "price-service")
     */
    public SecureServiceClient(RestTemplate restTemplate,
                               JwtTokenProvider jwtTokenProvider,
                               ObjectMapper objectMapper,
                               @Value("${fuelyn.security.hmac-secret}") String hmacSecret,
                               @Value("${fuelyn.security.service-id}") String serviceId) {
        this.restTemplate = restTemplate;
        this.jwtTokenProvider = jwtTokenProvider;
        this.objectMapper = objectMapper;
        this.hmacSecret = hmacSecret;
        this.serviceId = serviceId;
    }

    /**
     * Performs an authenticated GET request to another microservice.
     *
     * <p>The request is signed with an empty body for HMAC purposes and
     * includes a JWT service token.</p>
     *
     * @param url          the target service URL
     * @param responseType the expected response class
     * @param <T>          the response type
     * @return the deserialized response body
     * @throws ExternalApiException if the remote service returns an error or is unreachable
     */
    public <T> T get(String url, Class<T> responseType) {
        try {
            HttpHeaders headers = createAuthHeaders("");
            HttpEntity<Void> entity = new HttpEntity<>(headers);

            log.debug("Secure GET {} as service '{}'", url, serviceId);
            ResponseEntity<T> response = restTemplate.exchange(url, HttpMethod.GET, entity, responseType);
            return response.getBody();

        } catch (HttpClientErrorException e) {
            log.error("Client error on GET {}: {} {}", url, e.getStatusCode(), e.getResponseBodyAsString());
            throw new ExternalApiException("Service call failed: " + e.getStatusCode(), e);
        } catch (HttpServerErrorException e) {
            log.error("Server error on GET {}: {} {}", url, e.getStatusCode(), e.getResponseBodyAsString());
            throw new ExternalApiException("Remote service error: " + e.getStatusCode(), e);
        } catch (ResourceAccessException e) {
            log.error("Connection failed on GET {}: {}", url, e.getMessage());
            throw new ExternalApiException("Service unreachable: " + url, e);
        }
    }

    /**
     * Performs an authenticated POST request to another microservice.
     *
     * <p>The request body is serialized to JSON, then signed with HMAC-SHA256.
     * Both the JWT service token and the HMAC signature are included in headers.</p>
     *
     * @param url          the target service URL
     * @param body         the request body object (will be serialized to JSON)
     * @param responseType the expected response class
     * @param <T>          the response type
     * @return the deserialized response body
     * @throws ExternalApiException if the remote service returns an error, is unreachable,
     *                              or if the request body cannot be serialized
     */
    public <T> T post(String url, Object body, Class<T> responseType) {
        try {
            String jsonBody = objectMapper.writeValueAsString(body);
            HttpHeaders headers = createAuthHeaders(jsonBody);
            headers.setContentType(MediaType.APPLICATION_JSON);
            HttpEntity<String> entity = new HttpEntity<>(jsonBody, headers);

            log.debug("Secure POST {} as service '{}'", url, serviceId);
            ResponseEntity<T> response = restTemplate.exchange(url, HttpMethod.POST, entity, responseType);
            return response.getBody();

        } catch (JsonProcessingException e) {
            log.error("Failed to serialize request body for POST {}: {}", url, e.getMessage());
            throw new ExternalApiException("Failed to serialize request body", e);
        } catch (HttpClientErrorException e) {
            log.error("Client error on POST {}: {} {}", url, e.getStatusCode(), e.getResponseBodyAsString());
            throw new ExternalApiException("Service call failed: " + e.getStatusCode(), e);
        } catch (HttpServerErrorException e) {
            log.error("Server error on POST {}: {} {}", url, e.getStatusCode(), e.getResponseBodyAsString());
            throw new ExternalApiException("Remote service error: " + e.getStatusCode(), e);
        } catch (ResourceAccessException e) {
            log.error("Connection failed on POST {}: {}", url, e.getMessage());
            throw new ExternalApiException("Service unreachable: " + url, e);
        }
    }

    /**
     * Creates HTTP headers with full service authentication credentials.
     *
     * <p>Includes both JWT token and HMAC signature for dual-layer authentication.
     * The request ID enables distributed tracing across the service mesh.</p>
     *
     * @param body the request body string (used for HMAC signing; empty string for GET)
     * @return headers populated with all authentication fields
     */
    private HttpHeaders createAuthHeaders(String body) {
        HttpHeaders headers = new HttpHeaders();
        String timestamp = String.valueOf(System.currentTimeMillis());
        String requestId = UUID.randomUUID().toString();

        headers.set(ServiceAuthFilter.HEADER_SERVICE_ID, serviceId);
        headers.set(ServiceAuthFilter.HEADER_SERVICE_TOKEN, jwtTokenProvider.generateServiceToken(serviceId));
        headers.set(ServiceAuthFilter.HEADER_TIMESTAMP, timestamp);
        headers.set(ServiceAuthFilter.HEADER_SIGNATURE, HmacRequestSigner.sign(body, timestamp, hmacSecret));
        headers.set(ServiceAuthFilter.HEADER_REQUEST_ID, requestId);

        return headers;
    }
}
