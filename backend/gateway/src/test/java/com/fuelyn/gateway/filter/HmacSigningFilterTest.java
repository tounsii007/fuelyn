package com.fuelyn.gateway.filter;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.http.HttpStatus;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.server.ServerWebExchange;

import com.fuelyn.gateway.config.FuelynProperties;

import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

/**
 * Tests for {@link HmacSigningFilter} — the gateway-side body cap from iter 7 + the existing
 * path/method routing.
 */
class HmacSigningFilterTest {

    private FuelynProperties props;

    @BeforeEach
    void setUp() {
        props = new FuelynProperties();
        props.getSecurity().setHmacSecret("unit-test-secret-32+chars-for-hmac-signing");
        props.getSecurity().setServiceId("gateway-test");
    }

    private HmacSigningFilter filter(int maxBody) {
        return new HmacSigningFilter(props, maxBody);
    }

    private static GatewayFilterChain capturingChain(AtomicReference<ServerWebExchange> sink) {
        return ex -> {
            sink.set(ex);
            return Mono.empty();
        };
    }

    @Nested
    @DisplayName("Path filter — non-/api/ requests pass through unsigned")
    class PathFilter {

        @ParameterizedTest
        @ValueSource(strings = {"/actuator/health", "/fallback/x", "/swagger-ui/index.html", "/"})
        void nonApiPaths_areNotSigned(String path) {
            HmacSigningFilter f = filter(1024);
            ServerWebExchange ex =
                    MockServerWebExchange.from(MockServerHttpRequest.get(path).build());
            AtomicReference<ServerWebExchange> downstream = new AtomicReference<>();

            StepVerifier.create(f.filter(ex, capturingChain(downstream))).verifyComplete();

            assertThat(downstream.get()).isNotNull();
            assertThat(downstream.get().getRequest().getHeaders().getFirst("X-Signature")).isNull();
        }

        @Test
        void apiPaths_areSigned() {
            HmacSigningFilter f = filter(1024);
            ServerWebExchange ex =
                    MockServerWebExchange.from(MockServerHttpRequest.get("/api/v1/x").build());
            AtomicReference<ServerWebExchange> downstream = new AtomicReference<>();

            StepVerifier.create(f.filter(ex, capturingChain(downstream))).verifyComplete();

            assertThat(downstream.get().getRequest().getHeaders().getFirst("X-Signature"))
                    .isNotNull()
                    .isNotBlank();
            assertThat(downstream.get().getRequest().getHeaders().getFirst("X-Timestamp"))
                    .isNotNull()
                    .matches("[0-9]+");
            assertThat(downstream.get().getRequest().getHeaders().getFirst("X-Service-Id"))
                    .isEqualTo("gateway-test");
        }
    }

    @Nested
    @DisplayName("Body cap — POST / PUT")
    class BodyCap {

        @Test
        void postBody_underCap_isSigned() {
            HmacSigningFilter f = filter(1024);
            byte[] body = "{\"hello\":\"world\"}".getBytes();
            ServerWebExchange ex =
                    MockServerWebExchange.from(
                            MockServerHttpRequest.post("/api/v1/x").body(new String(body)));
            AtomicReference<ServerWebExchange> downstream = new AtomicReference<>();

            StepVerifier.create(f.filter(ex, capturingChain(downstream))).verifyComplete();

            assertThat(downstream.get().getRequest().getHeaders().getFirst("X-Signature"))
                    .isNotNull();
        }

        @Test
        void postBody_overCap_emits413() {
            HmacSigningFilter f = filter(64);
            // 65 bytes — over the cap.
            byte[] body = new byte[65];
            for (int i = 0; i < body.length; i++) body[i] = 'a';

            ServerWebExchange ex =
                    MockServerWebExchange.from(
                            MockServerHttpRequest.post("/api/v1/x").body(new String(body)));
            AtomicReference<ServerWebExchange> downstream = new AtomicReference<>();

            // The filter signals 413 via ResponseStatusException reactive error.
            StepVerifier.create(f.filter(ex, capturingChain(downstream)))
                    .expectErrorSatisfies(
                            t -> {
                                assertThat(t).isInstanceOf(ResponseStatusException.class);
                                ResponseStatusException rse = (ResponseStatusException) t;
                                assertThat(rse.getStatusCode())
                                        .isEqualTo(HttpStatus.PAYLOAD_TOO_LARGE);
                            })
                    .verify();

            // Downstream chain MUST NOT have been called.
            assertThat(downstream.get()).isNull();
        }

        @Test
        void emptyPostBody_isSignedWithEmptyPayload() {
            HmacSigningFilter f = filter(1024);
            ServerWebExchange ex =
                    MockServerWebExchange.from(MockServerHttpRequest.post("/api/v1/x").body(""));
            AtomicReference<ServerWebExchange> downstream = new AtomicReference<>();

            StepVerifier.create(f.filter(ex, capturingChain(downstream))).verifyComplete();

            assertThat(downstream.get().getRequest().getHeaders().getFirst("X-Signature"))
                    .isNotNull();
        }
    }

    @Nested
    @DisplayName("GET / DELETE — empty-body sign path")
    class NoBodyPath {

        @Test
        void getRequest_signedWithEmptyBody() {
            HmacSigningFilter f = filter(1024);
            ServerWebExchange ex =
                    MockServerWebExchange.from(MockServerHttpRequest.get("/api/v1/x").build());
            AtomicReference<ServerWebExchange> downstream = new AtomicReference<>();

            StepVerifier.create(f.filter(ex, capturingChain(downstream))).verifyComplete();

            assertThat(downstream.get().getRequest().getHeaders().getFirst("X-Signature"))
                    .isNotNull()
                    .isNotBlank();
        }

        @Test
        void deleteRequest_signedWithEmptyBody() {
            HmacSigningFilter f = filter(1024);
            ServerWebExchange ex =
                    MockServerWebExchange.from(MockServerHttpRequest.delete("/api/v1/x").build());
            AtomicReference<ServerWebExchange> downstream = new AtomicReference<>();

            StepVerifier.create(f.filter(ex, capturingChain(downstream))).verifyComplete();

            assertThat(downstream.get().getRequest().getHeaders().getFirst("X-Signature"))
                    .isNotNull();
        }
    }

    @Nested
    @DisplayName("Filter ordering")
    class Ordering {

        @Test
        void runsEarly_aboveDefaultPriority() {
            // Higher precedence (smaller number) than the default. Critical
            // because we need the body to be signed BEFORE any retry filter
            // potentially replays it.
            assertThat(filter(1024).getOrder()).isLessThan(0);
        }
    }
}
