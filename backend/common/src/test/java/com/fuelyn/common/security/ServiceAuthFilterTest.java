package com.fuelyn.common.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.http.HttpServletRequestWrapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.io.ByteArrayInputStream;
import java.io.IOException;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit tests for {@link ServiceAuthFilter} — the auth gate every
 * inter-service call passes through.
 *
 * <p>Uses Spring's MockHttp* + manual test doubles (no Mockito for the
 * filter chain or JwtTokenProvider) so the test stays compatible with
 * Java 26 — current Byte Buddy doesn't support 26 yet, and
 * {@code Mockito.mock(JwtTokenProvider.class)} fails to instantiate.
 * Manual stubs keep the suite framework-version-agnostic.</p>
 */
class ServiceAuthFilterTest {

    private static final String SECRET = "unit-test-secret-that-is-at-least-32-chars";
    private static final int MAX_BODY = 1024;

    private StubJwtTokenProvider jwt;
    private ServiceAuthFilter filter;

    @BeforeEach
    void setUp() {
        jwt = new StubJwtTokenProvider();
        filter = new ServiceAuthFilter(jwt, SECRET, MAX_BODY);
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
        @ValueSource(strings = {
                "/actuator", "/actuator/health", "/actuator/prometheus",
                "/health", "/health/liveness",
                "/swagger-ui", "/swagger-ui/index.html",
                "/v3/api-docs", "/v3/api-docs/swagger-config",
                "/error"
        })
        void allListedPublicPaths_bypassAuth(String path) throws Exception {
            CountingFilterChain chain = new CountingFilterChain();
            filter.doFilter(req("GET", path), new MockHttpServletResponse(), chain);
            assertThat(chain.invocations).isEqualTo(1);
        }

        @ParameterizedTest
        @ValueSource(strings = {
                "/actuator-evil",
                "/healthz-bypass",     // not anchored
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
    @DisplayName("JWT auth path")
    class JwtAuth {

        @Test
        void validJwt_passesThrough_andRecordsServiceId() throws Exception {
            jwt.accept("good-token", "price-service");

            MockHttpServletRequest request = req("GET", "/api/v1/internal/x");
            request.addHeader(ServiceAuthFilter.HEADER_SERVICE_TOKEN, "good-token");
            CountingFilterChain chain = new CountingFilterChain();

            filter.doFilter(request, new MockHttpServletResponse(), chain);

            assertThat(chain.invocations).isEqualTo(1);
            assertThat(request.getAttribute("authenticatedServiceId")).isEqualTo("price-service");
        }

        @Test
        void invalidJwt_andNoHmac_returns401() throws Exception {
            // jwt is empty stub → isValid() returns false for everything.
            MockHttpServletRequest request = req("GET", "/api/v1/internal/x");
            request.addHeader(ServiceAuthFilter.HEADER_SERVICE_TOKEN, "bad-token");
            MockHttpServletResponse response = new MockHttpServletResponse();
            CountingFilterChain chain = new CountingFilterChain();

            filter.doFilter(request, response, chain);

            assertThat(chain.invocations).isEqualTo(0);
            assertThat(response.getStatus()).isEqualTo(401);
        }

        @Test
        void invalidJwt_butValidHmac_passesViaHmacFallback() throws Exception {
            String body = "{\"a\":1}";
            String ts = String.valueOf(System.currentTimeMillis());
            String sig = HmacRequestSigner.sign(body, ts, SECRET);

            MockHttpServletRequest request = req("POST", "/api/v1/internal/x");
            request.setContent(body.getBytes());
            request.addHeader(ServiceAuthFilter.HEADER_SERVICE_TOKEN, "bad-token");
            request.addHeader(ServiceAuthFilter.HEADER_SIGNATURE, sig);
            request.addHeader(ServiceAuthFilter.HEADER_TIMESTAMP, ts);
            request.addHeader(ServiceAuthFilter.HEADER_SERVICE_ID, "price-service");

            CountingFilterChain chain = new CountingFilterChain();
            filter.doFilter(request, new MockHttpServletResponse(), chain);

            assertThat(chain.invocations).isEqualTo(1);
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
            base.addHeader(ServiceAuthFilter.HEADER_TIMESTAMP,
                    String.valueOf(System.currentTimeMillis()));
            base.addHeader(ServiceAuthFilter.HEADER_SERVICE_ID, "price-service");

            HttpServletRequestWrapper wrapped = new HttpServletRequestWrapper(base) {
                private final ByteArrayInputStream src = new ByteArrayInputStream(new byte[hugeSize]);
                @Override
                public ServletInputStream getInputStream() {
                    return new ServletInputStream() {
                        @Override public int read() { return src.read(); }
                        @Override public int read(byte[] b, int off, int len) {
                            return src.read(b, off, len);
                        }
                        @Override public boolean isFinished() { return src.available() == 0; }
                        @Override public boolean isReady() { return true; }
                        @Override public void setReadListener(ReadListener l) {}
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

    /**
     * Manual stub instead of Mockito.mock — Java 26 + Byte Buddy 1.x are
     * incompatible at the time of writing. Sufficient for our needs because
     * we only consult {@code isValid} and {@code getServiceId} from the
     * filter, both of which we drive deterministically.
     */
    private static final class StubJwtTokenProvider extends JwtTokenProvider {
        private String acceptedToken;
        private String acceptedServiceId;

        StubJwtTokenProvider() {
            super(buildPropsForStub());
        }

        void accept(String token, String serviceId) {
            this.acceptedToken = token;
            this.acceptedServiceId = serviceId;
        }

        @Override
        public boolean isValid(String token) {
            return acceptedToken != null && acceptedToken.equals(token);
        }

        @Override
        public String getServiceId(String token) {
            return acceptedServiceId;
        }

        private static com.fuelyn.common.config.SecurityProperties buildPropsForStub() {
            com.fuelyn.common.config.SecurityProperties p =
                    new com.fuelyn.common.config.SecurityProperties();
            p.setHmacSecret("unit-test-secret-that-is-at-least-32-chars-long");
            // A real RSA public key is required by JwtTokenProvider's
            // constructor. We use a fixed throwaway 2048-bit key generated
            // once with `openssl genrsa | openssl rsa -pubout`. The stub
            // never actually verifies anything — its overrides short-circuit
            // before the real parser runs.
            p.setJwtPublicKey(STUB_PUBLIC_KEY_PEM);
            p.setServiceId("test-service");
            return p;
        }
    }

    /**
     * Throwaway 2048-bit RSA SPKI for the stub. Fixed so the test is
     * deterministic; safe because nothing here ever actually signs or
     * verifies — the stub overrides the relevant methods.
     */
    private static final String STUB_PUBLIC_KEY_PEM =
            "-----BEGIN PUBLIC KEY-----\n"
            + "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtVTCDbOJxNZN9P5Z2v0J\n"
            + "RGk8d9Ns2BB4o2H+w0bhzWzkSbW6h0pPEqZxImVZ20S0pXr8sEmXr4r9Iom79hdr\n"
            + "tZ5J+zE2OIdJ1m5VjukNkjBpvxbIzd2+sP8AeqKxA6N+LD+v3MxHsbo/HvNGm/95\n"
            + "g5wD/yPq3lFvB1aR0BZL8wkNwkyiqYmxC+YWqZJpVuXaA5ZukExf1ItM8VRwUSWk\n"
            + "0iKwHYmEm6n/UfSzpyRhVvrNmFlQ6uAv6Z/AeKrNnz2Vhqcu3rjRr7NvN9z+yz0E\n"
            + "yNcLbFPlPRTRr8EBKD13RGjZkb9phSOSphoVwa9sJjYmpZNX7wXaxVECBdYfYFV+\n"
            + "0wIDAQAB\n"
            + "-----END PUBLIC KEY-----\n";
}
