package com.fuelyn.common.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fuelyn.common.exception.ExternalApiException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientRequestException;
import org.springframework.web.reactive.function.client.WebClientResponseException;
import reactor.core.publisher.Mono;

import java.time.Duration;
import java.util.Map;

/**
 * Reactive (non-blocking) sibling of {@link SecureServiceClient} for callers
 * that live on the WebFlux stack — most importantly the gateway.
 *
 * <p>The servlet-stack {@link SecureServiceClient} blocks on every call,
 * which on a Netty event loop pins the thread for the full RTT and
 * starves the rest of the proxy. Code paths that originate inside the
 * gateway (or any other reactive service) should reach for this class
 * instead so the event loop stays free.</p>
 *
 * <p>Only registered as a Spring bean when {@link WebClient} is on the
 * classpath. Adding spring-boot-starter-webflux to the common module is
 * marked {@code <optional>true</optional>} in pom.xml — the dependency
 * is therefore <em>not</em> imposed on servlet-only services.</p>
 *
 * <h3>Usage</h3>
 * <pre>{@code
 * Mono<AIResponse> reply = secureWebClient.post(
 *     "http://ai-service:8082/api/v1/ai/advisor",
 *     advisorRequest,
 *     AIResponse.class
 * );
 * // …chain reactively, never .block() inside an event-loop handler
 * }</pre>
 *
 * @see SecureServiceClient for the blocking RestTemplate-based variant.
 */
@Component
@ConditionalOnClass(WebClient.class)
public class SecureWebClient {

    private static final Logger log = LoggerFactory.getLogger(SecureWebClient.class);

    /** Hard ceiling on a single inter-service call; matches RestTemplate timeouts. */
    private static final Duration DEFAULT_TIMEOUT = Duration.ofSeconds(10);

    private final WebClient webClient;
    private final JwtTokenProvider jwtTokenProvider;
    private final ObjectMapper objectMapper;
    private final String hmacSecret;
    private final String serviceId;

    public SecureWebClient(
            WebClient.Builder builder,
            JwtTokenProvider jwtTokenProvider,
            ObjectMapper objectMapper,
            @Value("${fuelyn.security.hmac-secret}") String hmacSecret,
            @Value("${fuelyn.security.service-id}") String serviceId
    ) {
        this.webClient = builder.build();
        this.jwtTokenProvider = jwtTokenProvider;
        this.objectMapper = objectMapper;
        this.hmacSecret = hmacSecret;
        this.serviceId = serviceId;
    }

    /**
     * Authenticated reactive GET. Returns a cold {@link Mono} — the
     * actual HTTP call only fires when something subscribes.
     */
    public <T> Mono<T> get(String url, Class<T> responseType) {
        Map<String, String> auth = ServiceAuthHeaders.build("", serviceId, hmacSecret, jwtTokenProvider);
        return webClient.get()
                .uri(url)
                .headers(h -> auth.forEach(h::set))
                .retrieve()
                .bodyToMono(responseType)
                .timeout(DEFAULT_TIMEOUT)
                .onErrorMap(SecureWebClient::translateError);
    }

    /**
     * Authenticated reactive POST. The body is serialised on the calling
     * thread (cheap, deterministic) so the HMAC over the byte payload
     * matches what the wire actually carries — Jackson's reactive encoder
     * could otherwise change spacing/ordering between the signed string
     * and the transmitted bytes.
     */
    public <T> Mono<T> post(String url, Object body, Class<T> responseType) {
        return Mono.fromCallable(() -> objectMapper.writeValueAsString(body))
                .flatMap(json -> {
                    Map<String, String> auth = ServiceAuthHeaders.build(
                            json, serviceId, hmacSecret, jwtTokenProvider);
                    return webClient.post()
                            .uri(url)
                            .contentType(MediaType.APPLICATION_JSON)
                            .headers(h -> auth.forEach(h::set))
                            .bodyValue(json)
                            .retrieve()
                            .bodyToMono(responseType);
                })
                .timeout(DEFAULT_TIMEOUT)
                .onErrorMap(SecureWebClient::translateError);
    }

    /**
     * Map WebClient's exception zoo onto our single
     * {@link ExternalApiException} so callers get a consistent type
     * regardless of whether the failure was upstream-status, network,
     * or serialisation. Also strips internal stack traces from the log
     * line — full stack stays attached as cause.
     */
    private static Throwable translateError(Throwable t) {
        if (t instanceof ExternalApiException already) {
            return already;
        }
        if (t instanceof WebClientResponseException upstream) {
            log.error("Upstream {} response on {}: {}",
                    upstream.getStatusCode().is4xxClientError() ? "client-error" : "server-error",
                    upstream.getRequest() != null ? upstream.getRequest().getURI() : "?",
                    upstream.getResponseBodyAsString());
            return new ExternalApiException(
                    "Service call failed: " + upstream.getStatusCode(), upstream);
        }
        if (t instanceof WebClientRequestException network) {
            log.error("Network failure to {}: {}", network.getUri(), network.getMessage());
            return new ExternalApiException("Service unreachable: " + network.getUri(), network);
        }
        log.error("Reactive client error: {}", t.getMessage());
        return new ExternalApiException("Service call failed", t);
    }
}
