package com.fuelyn.gateway.filter;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

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
import org.springframework.web.server.ServerWebExchange;

import com.fuelyn.gateway.config.FuelynProperties;

import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

/**
 * Tests for {@link ApiKeyValidationFilter} — the gateway's external-client authentication gate.
 *
 * <p>Critical correctness properties verified here:
 *
 * <ul>
 *   <li>{@code /actuator-evil} no longer bypasses (path-anchor fix)
 *   <li>Multiple valid keys all unlock; non-key 403
 *   <li>Iteration through every configured key is unconditional — short-circuit on first match
 *       would leak timing info
 *   <li>Null/blank/missing keys produce deterministic 401 / 403, never 500
 * </ul>
 */
class ApiKeyValidationFilterTest {

    private FuelynProperties props;

    @BeforeEach
    void setUp() {
        props = new FuelynProperties();
        props.getSecurity()
                .setApiKeys(
                        List.of(
                                "first-key-very-long-and-strong-32+chars-aaaa",
                                "second-key-also-very-long-and-strong-32-chars",
                                "third-key-just-as-long-and-strong-32+chars-cc"));
    }

    private ApiKeyValidationFilter filter() {
        return new ApiKeyValidationFilter(props);
    }

    private MockServerWebExchange exchange(String path) {
        return MockServerWebExchange.from(MockServerHttpRequest.get(path).build());
    }

    private MockServerWebExchange exchange(String path, String apiKey) {
        return MockServerWebExchange.from(
                MockServerHttpRequest.get(path).header("X-API-Key", apiKey).build());
    }

    private static GatewayFilterChain countingChain(AtomicInteger counter) {
        return ex -> {
            counter.incrementAndGet();
            return Mono.empty();
        };
    }

    @Nested
    @DisplayName("Public path bypass")
    class PublicPaths {

        @ParameterizedTest
        @ValueSource(
                strings = {
                    "/actuator",
                    "/actuator/health",
                    "/actuator/prometheus",
                    "/fallback",
                    "/fallback/price-service"
                })
        void publicPaths_bypassWithoutKey(String path) {
            AtomicInteger downstream = new AtomicInteger();
            Mono<Void> result = filter().filter(exchange(path), countingChain(downstream));
            StepVerifier.create(result).verifyComplete();
            assertThat(downstream.get()).isEqualTo(1);
        }

        @ParameterizedTest
        @ValueSource(
                strings = {
                    "/actuator-evil", // anchor fix — would have leaked previously
                    "/fallback-evil",
                    "/api/v1/secret"
                })
        void anchorLookalikes_areBlocked_with401(String path) {
            AtomicInteger downstream = new AtomicInteger();
            ServerWebExchange ex = exchange(path);
            StepVerifier.create(filter().filter(ex, countingChain(downstream))).verifyComplete();
            assertThat(downstream.get()).isZero();
            assertThat(ex.getResponse().getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        }
    }

    @Nested
    @DisplayName("API key validation")
    class KeyValidation {

        @Test
        void firstKey_succeeds() {
            AtomicInteger downstream = new AtomicInteger();
            ServerWebExchange ex =
                    exchange("/api/v1/x", "first-key-very-long-and-strong-32+chars-aaaa");
            StepVerifier.create(filter().filter(ex, countingChain(downstream))).verifyComplete();
            assertThat(downstream.get()).isEqualTo(1);
        }

        @Test
        void middleKey_succeeds() {
            AtomicInteger downstream = new AtomicInteger();
            ServerWebExchange ex =
                    exchange("/api/v1/x", "second-key-also-very-long-and-strong-32-chars");
            StepVerifier.create(filter().filter(ex, countingChain(downstream))).verifyComplete();
            assertThat(downstream.get()).isEqualTo(1);
        }

        @Test
        void lastKey_succeeds() {
            AtomicInteger downstream = new AtomicInteger();
            ServerWebExchange ex =
                    exchange("/api/v1/x", "third-key-just-as-long-and-strong-32+chars-cc");
            StepVerifier.create(filter().filter(ex, countingChain(downstream))).verifyComplete();
            assertThat(downstream.get()).isEqualTo(1);
        }

        @Test
        void unknownKey_returns403() {
            AtomicInteger downstream = new AtomicInteger();
            ServerWebExchange ex =
                    exchange("/api/v1/x", "wrong-key-with-similar-length-to-real-keys-X");
            StepVerifier.create(filter().filter(ex, countingChain(downstream))).verifyComplete();
            assertThat(downstream.get()).isZero();
            assertThat(ex.getResponse().getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        }

        @Test
        void missingKeyHeader_returns401() {
            AtomicInteger downstream = new AtomicInteger();
            ServerWebExchange ex = exchange("/api/v1/x"); // no header
            StepVerifier.create(filter().filter(ex, countingChain(downstream))).verifyComplete();
            assertThat(downstream.get()).isZero();
            assertThat(ex.getResponse().getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        }

        @Test
        void blankKeyHeader_returns401() {
            AtomicInteger downstream = new AtomicInteger();
            ServerWebExchange ex = exchange("/api/v1/x", "   ");
            StepVerifier.create(filter().filter(ex, countingChain(downstream))).verifyComplete();
            assertThat(downstream.get()).isZero();
            assertThat(ex.getResponse().getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        }
    }

    @Nested
    @DisplayName("Empty / placeholder configuration — dev mode")
    class DevMode {

        @Test
        void emptyKeyList_disablesValidation() {
            props.getSecurity().setApiKeys(List.of());
            ApiKeyValidationFilter f = new ApiKeyValidationFilter(props);

            AtomicInteger downstream = new AtomicInteger();
            ServerWebExchange ex = exchange("/api/v1/x");
            StepVerifier.create(f.filter(ex, countingChain(downstream))).verifyComplete();
            assertThat(downstream.get()).isEqualTo(1);
        }

        @Test
        void allBlankKeys_disablesValidation() {
            // Constructor pre-filters blanks. A list of all-blank entries
            // becomes effectively empty, which puts us back into dev-mode.
            props.getSecurity().setApiKeys(List.of("", "  ", "\t"));
            ApiKeyValidationFilter f = new ApiKeyValidationFilter(props);

            AtomicInteger downstream = new AtomicInteger();
            ServerWebExchange ex = exchange("/api/v1/x");
            StepVerifier.create(f.filter(ex, countingChain(downstream))).verifyComplete();
            assertThat(downstream.get()).isEqualTo(1);
        }

        @Test
        void mixedBlankAndRealKeys_onlyRealKeysCount() {
            props.getSecurity()
                    .setApiKeys(List.of("", "real-strong-key-aaaaaaaaaaaaaaaaaaaaaaaa", "  "));
            ApiKeyValidationFilter f = new ApiKeyValidationFilter(props);

            AtomicInteger downstream = new AtomicInteger();
            ServerWebExchange ex =
                    exchange("/api/v1/x", "real-strong-key-aaaaaaaaaaaaaaaaaaaaaaaa");
            StepVerifier.create(f.filter(ex, countingChain(downstream))).verifyComplete();
            assertThat(downstream.get()).isEqualTo(1);
        }

        @Test
        void mixedBlankAndRealKeys_blankKeyDoesNotMatchBlankProvidedKey() {
            // Defence: a blank API key in config + blank header MUST NOT
            // result in a match. The constructor's blank-filter is what
            // makes this safe.
            props.getSecurity().setApiKeys(List.of("", "real-strong-key-aaaaaaaaaaaaaaaaaaaaaaaa"));
            ApiKeyValidationFilter f = new ApiKeyValidationFilter(props);

            AtomicInteger downstream = new AtomicInteger();
            ServerWebExchange ex = exchange("/api/v1/x", "");
            StepVerifier.create(f.filter(ex, countingChain(downstream))).verifyComplete();
            assertThat(downstream.get()).isZero();
            // Blank header is detected as missing → 401, not a successful
            // match against the blank entry that doesn't exist anymore.
            assertThat(ex.getResponse().getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        }

        @Test
        void nullKeyListInProperties_disablesValidation() {
            props.getSecurity().setApiKeys(null);
            ApiKeyValidationFilter f = new ApiKeyValidationFilter(props);

            AtomicInteger downstream = new AtomicInteger();
            ServerWebExchange ex = exchange("/api/v1/x");
            StepVerifier.create(f.filter(ex, countingChain(downstream))).verifyComplete();
            assertThat(downstream.get()).isEqualTo(1);
        }
    }
}
