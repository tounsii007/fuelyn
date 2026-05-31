package com.fuelyn.common.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

/**
 * Unit tests for {@link ServiceAuthFilter} — the auth gate every inter-service call passes through.
 *
 * <p>Uses Spring's MockHttp* + a manual {@code FilterChain} test double (no Mockito) so the test
 * stays compatible with Java 26 — current Byte Buddy doesn't support 26 yet. Manual stubs keep the
 * suite framework-version-agnostic.
 */
class ServiceAuthFilterTest {

    private static final String SECRET = "unit-test-secret-that-is-at-least-32-chars";
    private static final int MAX_BODY = 1024;

    private ServiceAuthFilter filter;

    @BeforeEach
    void setUp() {
        filter = new ServiceAuthFilter(SECRET, MAX_BODY);
    }

    private MockHttpServletRequest req(String method, String path) {
        MockHttpServletRequest r = new MockHttpServletRequest(method, path);
        r.setRemoteAddr("10.0.0.1");
        return r;
    }

    @Nested
    @DisplayName("Public path bypass — must NOT touch downstream auth")
    class PublicPaths {

        @Test
        void healthEndpoint_bypassesAuth() throws Exception {
            CountingFilterChain chain = new CountingFilterChain();
            MockHttpServletResponse response = new MockHttpServletResponse();

            filter.doFilter(req("GET", "/health"), response, chain);

            assertThat(chain.invocations).isEqualTo(1);
            assertThat(response.getStatus()).isEqualTo(200);
        }

        @ParameterizedTest
        @ValueSource(
                strings = {
                    "/actuator",
                    "/actuator/health",
                    "/actuator/prometheus",
                    "/health",
                    "/health/liveness",
                    "/swagger-ui",
                    "/swagger-ui/index.html",
                    "/v3/api-docs",
                    "/v3/api-docs/swagger-config",
                    "/error"
                })
        void allListedPublicPaths_bypassAuth(String path) throws Exception {
            CountingFilterChain chain = new CountingFilterChain();
            filter.doFilter(req("GET", path), new MockHttpServletResponse(), chain);
            assertThat(chain.invocations).isEqualTo(1);
        }

        @ParameterizedTest
        @ValueSource(
                strings = {
                    "/actuator-evil",
                    "/healthz-bypass", // not anchored
                    "/swagger-ui-fake",
                    "/v3/api-docs-evil",
                    "/errorz",
                    "/api/v1/secret"
                })
        void pathsThatLOOK_likePublic_butAreNot_requireAuth(String path) throws Exception {
            // The headline anchor-bug fix: prefix-only matching let
            // /actuator-evil sneak through. Now anchored to a path-segment
            // boundary, so any of these MUST be rejected.
            CountingFilterChain chain = new CountingFilterChain();
            MockHttpServletResponse response = new MockHttpServletResponse();

            filter.doFilter(req("GET", path), response, chain);

            assertThat(chain.invocations).isEqualTo(0);
            assertThat(response.getStatus()).isEqualTo(401);
        }
    }

    @Nested
    @DisplayName("HMAC auth path")
    class HmacAuth {

        @Test
        void validHmac_passesThrough() throws Exception {
            String body = "{\"hello\":\"world\"}";
            String ts = String.valueOf(System.currentTimeMillis());
            String sig = HmacRequestSigner.sign(body, ts, SECRET);

            MockHttpServletRequest request = req("POST", "/api/v1/internal/x");
            request.setContent(body.getBytes());
            request.addHeader(ServiceAuthFilter.HEADER_SIGNATURE, sig);
            request.addHeader(ServiceAuthFilter.HEADER_TIMESTAMP, ts);
            request.addHeader(ServiceAuthFilter.HEADER_SERVICE_ID, "price-service");

            CountingFilterChain chain = new CountingFilterChain();
            filter.doFilter(request, new MockHttpServletResponse(), chain);
            assertThat(chain.invocations).isEqualTo(1);
        }

        @Test
        void validHmac_bodyRemainsReadableDownstream() throws Exception {
            // Regression guard: the filter reads the (single-pass) body to
            // verify the HMAC, so it MUST replay those bytes downstream or
            // every signed POST would reach the controller with an empty
            // @RequestBody.
            String body = "{\"hello\":\"world\",\"n\":42}";
            String ts = String.valueOf(System.currentTimeMillis());
            String sig = HmacRequestSigner.sign(body, ts, SECRET);

            MockHttpServletRequest request = req("POST", "/api/v1/internal/x");
            request.setContent(body.getBytes(StandardCharsets.UTF_8));
            request.addHeader(ServiceAuthFilter.HEADER_SIGNATURE, sig);
            request.addHeader(ServiceAuthFilter.HEADER_TIMESTAMP, ts);
            request.addHeader(ServiceAuthFilter.HEADER_SERVICE_ID, "price-service");

            CapturingFilterChain chain = new CapturingFilterChain();
            filter.doFilter(request, new MockHttpServletResponse(), chain);

            assertThat(chain.captured).isNotNull();
            byte[] downstream = chain.captured.getInputStream().readAllBytes();
            assertThat(new String(downstream, StandardCharsets.UTF_8)).isEqualTo(body);
            // Re-readable: a second read returns the same bytes, not an
            // exhausted stream.
            byte[] secondRead = chain.captured.getInputStream().readAllBytes();
            assertThat(new String(secondRead, StandardCharsets.UTF_8)).isEqualTo(body);
        }

        @Test
        void tamperedBody_isRejected_with401() throws Exception {
            String original = "{\"a\":1}";
            String tampered = "{\"a\":2}";
            String ts = String.valueOf(System.currentTimeMillis());
            String sig = HmacRequestSigner.sign(original, ts, SECRET);

            MockHttpServletRequest request = req("POST", "/api/v1/internal/x");
            request.setContent(tampered.getBytes());
            request.addHeader(ServiceAuthFilter.HEADER_SIGNATURE, sig);
            request.addHeader(ServiceAuthFilter.HEADER_TIMESTAMP, ts);
            request.addHeader(ServiceAuthFilter.HEADER_SERVICE_ID, "price-service");

            MockHttpServletResponse response = new MockHttpServletResponse();
            CountingFilterChain chain = new CountingFilterChain();
            filter.doFilter(request, response, chain);

            assertThat(chain.invocations).isEqualTo(0);
            assertThat(response.getStatus()).isEqualTo(401);
        }

        @Test
        void staleTimestamp_isRejected_with401() throws Exception {
            String body = "{}";
            long sixMinutesAgo = System.currentTimeMillis() - (6L * 60L * 1000L);
            String ts = String.valueOf(sixMinutesAgo);
            String sig = HmacRequestSigner.sign(body, ts, SECRET);

            MockHttpServletRequest request = req("POST", "/api/v1/internal/x");
            request.setContent(body.getBytes());
            request.addHeader(ServiceAuthFilter.HEADER_SIGNATURE, sig);
            request.addHeader(ServiceAuthFilter.HEADER_TIMESTAMP, ts);
            request.addHeader(ServiceAuthFilter.HEADER_SERVICE_ID, "price-service");

            MockHttpServletResponse response = new MockHttpServletResponse();
            filter.doFilter(request, response, new CountingFilterChain());
            assertThat(response.getStatus()).isEqualTo(401);
        }

        @Test
        void missingSignatureHeader_returns401() throws Exception {
            MockHttpServletRequest request = req("POST", "/api/v1/internal/x");
            request.setContent("{}".getBytes());
            request.addHeader(ServiceAuthFilter.HEADER_TIMESTAMP, "1");
            request.addHeader(ServiceAuthFilter.HEADER_SERVICE_ID, "price-service");

            MockHttpServletResponse response = new MockHttpServletResponse();
            filter.doFilter(request, response, new CountingFilterChain());
            assertThat(response.getStatus()).isEqualTo(401);
        }

        @Test
        void missingServiceIdHeader_returns401() throws Exception {
            String ts = String.valueOf(System.currentTimeMillis());
            String sig = HmacRequestSigner.sign("body", ts, SECRET);
            MockHttpServletRequest request = req("POST", "/api/v1/internal/x");
            request.setContent("body".getBytes());
            request.addHeader(ServiceAuthFilter.HEADER_SIGNATURE, sig);
            request.addHeader(ServiceAuthFilter.HEADER_TIMESTAMP, ts);

            MockHttpServletResponse response = new MockHttpServletResponse();
            filter.doFilter(request, response, new CountingFilterChain());
            assertThat(response.getStatus()).isEqualTo(401);
        }
    }

    @Nested
    @DisplayName("Body-size cap (P0 fix from iter 15)")
    class BodyCap {

        @Test
        void bodyAtCap_isAccepted() throws Exception {
            byte[] body = new byte[MAX_BODY];
            for (int i = 0; i < body.length; i++) body[i] = (byte) ('a' + (i % 26));
            String ts = String.valueOf(System.currentTimeMillis());
            String sig = HmacRequestSigner.sign(new String(body), ts, SECRET);

            MockHttpServletRequest request = req("POST", "/api/v1/internal/x");
            request.setContent(body);
            request.addHeader(ServiceAuthFilter.HEADER_SIGNATURE, sig);
            request.addHeader(ServiceAuthFilter.HEADER_TIMESTAMP, ts);
            request.addHeader(ServiceAuthFilter.HEADER_SERVICE_ID, "price-service");

            CountingFilterChain chain = new CountingFilterChain();
            filter.doFilter(request, new MockHttpServletResponse(), chain);
            assertThat(chain.invocations).isEqualTo(1);
        }

        @Test
        void bodyOverCap_isRejected_with413() throws Exception {
            byte[] body = new byte[MAX_BODY + 1];
            String ts = String.valueOf(System.currentTimeMillis());
            String sig = "ignored";

            MockHttpServletRequest request = req("POST", "/api/v1/internal/x");
            request.setContent(body);
            request.addHeader(ServiceAuthFilter.HEADER_SIGNATURE, sig);
            request.addHeader(ServiceAuthFilter.HEADER_TIMESTAMP, ts);
            request.addHeader(ServiceAuthFilter.HEADER_SERVICE_ID, "price-service");

            MockHttpServletResponse response = new MockHttpServletResponse();
            CountingFilterChain chain = new CountingFilterChain();
            filter.doFilter(request, response, chain);

            assertThat(chain.invocations).isEqualTo(0);
            assertThat(response.getStatus()).isEqualTo(413);
            assertThat(response.getContentAsString()).contains("PAYLOAD_TOO_LARGE");
        }

        @Test
        void hugeBody_doesNotOOM_andRejects413() throws Exception {
            // Wrap the request to expose a 50 MiB ServletInputStream — the
            // filter MUST abort the buffered read at MAX_BODY rather than
            // pinning heap with the full payload.
            int hugeSize = 50 * 1024 * 1024;
            MockHttpServletRequest base = req("POST", "/api/v1/internal/x");
            base.addHeader(ServiceAuthFilter.HEADER_SIGNATURE, "any");
            base.addHeader(
                    ServiceAuthFilter.HEADER_TIMESTAMP, String.valueOf(System.currentTimeMillis()));
            base.addHeader(ServiceAuthFilter.HEADER_SERVICE_ID, "price-service");

            HttpServletRequestWrapper wrapped =
                    new HttpServletRequestWrapper(base) {
                        private final ByteArrayInputStream src =
                                new ByteArrayInputStream(new byte[hugeSize]);

                        @Override
                        public ServletInputStream getInputStream() {
                            return new ServletInputStream() {
                                @Override
                                public int read() {
                                    return src.read();
                                }

                                @Override
                                public int read(byte[] b, int off, int len) {
                                    return src.read(b, off, len);
                                }

                                @Override
                                public boolean isFinished() {
                                    return src.available() == 0;
                                }

                                @Override
                                public boolean isReady() {
                                    return true;
                                }

                                @Override
                                public void setReadListener(ReadListener l) {}
                            };
                        }
                    };

            MockHttpServletResponse response = new MockHttpServletResponse();
            CountingFilterChain chain = new CountingFilterChain();

            long before = System.nanoTime();
            filter.doFilter(wrapped, response, chain);
            long elapsedMs = (System.nanoTime() - before) / 1_000_000;

            assertThat(chain.invocations).isEqualTo(0);
            assertThat(response.getStatus()).isEqualTo(413);
            // Streaming abort should be near-instant. 1s is generous.
            assertThat(elapsedMs).isLessThan(1000);
        }
    }

    // ─── Test doubles ──────────────────────────────────────────────

    /** Counts how many times {@link #doFilter} is invoked downstream. */
    private static final class CountingFilterChain implements FilterChain {
        int invocations = 0;

        @Override
        public void doFilter(ServletRequest req, ServletResponse res) {
            invocations++;
        }
    }

    /** Captures the request handed downstream so the test can re-read its body. */
    private static final class CapturingFilterChain implements FilterChain {
        HttpServletRequest captured;

        @Override
        public void doFilter(ServletRequest req, ServletResponse res) {
            captured = (HttpServletRequest) req;
        }
    }
}
