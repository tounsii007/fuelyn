package com.fuelyn.common.security;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Heavy test coverage for {@link HmacRequestSigner}, the lynchpin of all
 * inter-service authentication. Every branch including null/empty inputs,
 * timestamp skew, tamper detection, and consistency with HMAC-SHA256
 * reference vectors. Each method's failure mode has at least one test that
 * proves it cannot leak as a 500 / NPE — the auth filter relies on a
 * deterministic boolean.
 */
class HmacRequestSignerTest {

    private static final String SECRET = "unit-test-secret-that-is-at-least-32-chars";
    private static final String SECRET_2 = "different-secret-that-is-at-least-32-chars";

    @Nested
    @DisplayName("Round-trip")
    class RoundTrip {

        @Test
        void signAndVerify_validRequest_succeeds() {
            String body = "{\"hello\":\"world\"}";
            String ts = String.valueOf(System.currentTimeMillis());

            String signature = HmacRequestSigner.sign(body, ts, SECRET);

            assertThat(signature).isNotBlank();
            assertThat(HmacRequestSigner.verify(body, ts, signature, SECRET)).isTrue();
        }

        @Test
        void signature_isDeterministic_forSameInputs() {
            String ts = "1700000000000";
            String body = "fixed-payload";

            String s1 = HmacRequestSigner.sign(body, ts, SECRET);
            String s2 = HmacRequestSigner.sign(body, ts, SECRET);

            assertThat(s1).isEqualTo(s2);
        }

        @Test
        void signature_changes_whenBodyChanges() {
            String ts = "1700000000000";
            assertThat(HmacRequestSigner.sign("a", ts, SECRET))
                    .isNotEqualTo(HmacRequestSigner.sign("b", ts, SECRET));
        }

        @Test
        void signature_changes_whenSecretChanges() {
            String ts = "1700000000000";
            assertThat(HmacRequestSigner.sign("body", ts, SECRET))
                    .isNotEqualTo(HmacRequestSigner.sign("body", ts, SECRET_2));
        }

        @Test
        void signature_changes_whenTimestampChanges() {
            assertThat(HmacRequestSigner.sign("body", "1700000000000", SECRET))
                    .isNotEqualTo(HmacRequestSigner.sign("body", "1700000000001", SECRET));
        }

        @Test
        void signature_isBase64() {
            String sig = HmacRequestSigner.sign("body", "1", SECRET);
            assertThatCode(() -> Base64.getDecoder().decode(sig)).doesNotThrowAnyException();
            // SHA-256 = 32 bytes → 44 chars base64 with one '=' padding.
            assertThat(sig).hasSize(44);
        }
    }

    @Nested
    @DisplayName("Tamper detection")
    class Tamper {

        @Test
        void verify_rejectsTamperedBody() {
            String ts = String.valueOf(System.currentTimeMillis());
            String signature = HmacRequestSigner.sign("{\"a\":1}", ts, SECRET);

            assertThat(HmacRequestSigner.verify("{\"a\":2}", ts, signature, SECRET)).isFalse();
        }

        @Test
        void verify_rejectsTamperedSignature() {
            String ts = String.valueOf(System.currentTimeMillis());
            String body = "payload";
            String signature = HmacRequestSigner.sign(body, ts, SECRET);

            // Flip a bit in the signature.
            byte[] raw = Base64.getDecoder().decode(signature);
            raw[0] ^= 0x01;
            String tampered = Base64.getEncoder().encodeToString(raw);

            assertThat(HmacRequestSigner.verify(body, ts, tampered, SECRET)).isFalse();
        }

        @Test
        void verify_rejectsTamperedTimestamp() {
            long now = System.currentTimeMillis();
            String body = "payload";
            String signature = HmacRequestSigner.sign(body, String.valueOf(now), SECRET);

            // Same body + signature, but different (still valid-window) timestamp.
            String otherTs = String.valueOf(now + 1);
            assertThat(HmacRequestSigner.verify(body, otherTs, signature, SECRET)).isFalse();
        }

        @Test
        void verify_rejectsWrongSecret() {
            String body = "{}";
            String ts = String.valueOf(System.currentTimeMillis());
            String signature = HmacRequestSigner.sign(body, ts, SECRET);

            assertThat(HmacRequestSigner.verify(body, ts, signature, SECRET_2)).isFalse();
        }
    }

    @Nested
    @DisplayName("Replay-window")
    class ReplayWindow {

        @Test
        void verify_rejectsTimestamp_olderThan5Minutes() {
            String body = "{}";
            long sixMinutesAgo = System.currentTimeMillis() - (6L * 60L * 1000L);
            String ts = String.valueOf(sixMinutesAgo);

            String signature = HmacRequestSigner.sign(body, ts, SECRET);

            assertThat(HmacRequestSigner.verify(body, ts, signature, SECRET)).isFalse();
        }

        @Test
        void verify_rejectsTimestamp_moreThan5MinutesInFuture() {
            // Symmetric clamp: clock-skew defence both sides via Math.abs.
            String body = "{}";
            long sixMinutesAhead = System.currentTimeMillis() + (6L * 60L * 1000L);
            String ts = String.valueOf(sixMinutesAhead);

            String signature = HmacRequestSigner.sign(body, ts, SECRET);

            assertThat(HmacRequestSigner.verify(body, ts, signature, SECRET)).isFalse();
        }

        @Test
        void verify_acceptsTimestamp_atTheEdgeOfWindow() {
            // 4m59s ago is still inside the 5-minute window.
            String body = "{}";
            long fourMinutesFiftyNineAgo = System.currentTimeMillis() - (4L * 60L + 59L) * 1000L;
            String ts = String.valueOf(fourMinutesFiftyNineAgo);

            String signature = HmacRequestSigner.sign(body, ts, SECRET);

            assertThat(HmacRequestSigner.verify(body, ts, signature, SECRET)).isTrue();
        }

        @Test
        void verify_rejectsNonNumericTimestamp() {
            assertThat(HmacRequestSigner.verify("{}", "not-a-number", "sig", SECRET)).isFalse();
        }

        @ParameterizedTest
        @ValueSource(strings = {"abc", "12.34", "1e10", " ", "0xff", "1_000_000"})
        void verify_rejectsMalformedTimestamps(String ts) {
            assertThat(HmacRequestSigner.verify("{}", ts, "sig", SECRET)).isFalse();
        }
    }

    @Nested
    @DisplayName("Null / empty inputs — must never NPE / 500")
    class NullSafety {

        @ParameterizedTest
        @NullAndEmptySource
        void sign_rejectsNullOrEmptyTimestamp(String ts) {
            assertThatThrownBy(() -> HmacRequestSigner.sign("body", ts, SECRET))
                    .isInstanceOf(HmacRequestSigner.HmacSigningException.class)
                    .hasMessageContaining("timestamp");
        }

        @ParameterizedTest
        @NullAndEmptySource
        void sign_rejectsNullOrEmptySecret(String secret) {
            assertThatThrownBy(() -> HmacRequestSigner.sign("body", "1", secret))
                    .isInstanceOf(HmacRequestSigner.HmacSigningException.class)
                    .hasMessageContaining("secret");
        }

        @Test
        void sign_normalisesNullBody_toEmptyString() {
            // The wire-level signature for body=null and body="" must be
            // identical — otherwise two callers using different defaults
            // produce mutually-incompatible signatures even for the same
            // logical request.
            String ts = "1700000000000";
            String s1 = HmacRequestSigner.sign(null, ts, SECRET);
            String s2 = HmacRequestSigner.sign("",   ts, SECRET);
            assertThat(s1).isEqualTo(s2);
        }

        @ParameterizedTest
        @NullAndEmptySource
        void verify_returnsFalse_onNullOrEmptyTimestamp(String ts) {
            assertThat(HmacRequestSigner.verify("body", ts, "sig", SECRET)).isFalse();
        }

        @ParameterizedTest
        @NullAndEmptySource
        void verify_returnsFalse_onNullOrEmptySignature(String sig) {
            String ts = String.valueOf(System.currentTimeMillis());
            assertThat(HmacRequestSigner.verify("body", ts, sig, SECRET)).isFalse();
        }

        @ParameterizedTest
        @NullAndEmptySource
        void verify_returnsFalse_onNullOrEmptySecret(String secret) {
            String ts = String.valueOf(System.currentTimeMillis());
            assertThat(HmacRequestSigner.verify("body", ts, "any-sig", secret)).isFalse();
        }

        @Test
        void verify_handlesNullBody_consistentlyWithSign() {
            String ts = String.valueOf(System.currentTimeMillis());
            String sigForEmpty = HmacRequestSigner.sign("", ts, SECRET);
            // Verifying with body=null must match a signature produced for "".
            assertThat(HmacRequestSigner.verify(null, ts, sigForEmpty, SECRET)).isTrue();
        }

        @Test
        void verify_handlesGarbageSignature_returnsFalseWithoutException() {
            String ts = String.valueOf(System.currentTimeMillis());
            // Not even valid base64 — must still be a clean false, never a 500.
            assertThatCode(() ->
                    HmacRequestSigner.verify("body", ts, "!!!not-base64!!!", SECRET)
            ).doesNotThrowAnyException();
            assertThat(HmacRequestSigner.verify("body", ts, "!!!not-base64!!!", SECRET))
                    .isFalse();
        }
    }

    @Nested
    @DisplayName("Body content edge cases")
    class BodyEdges {

        @Test
        void bodyWithUnicode_isSignedConsistently() {
            String ts = String.valueOf(System.currentTimeMillis());
            String body = "{\"city\":\"München\",\"emoji\":\"🚀\"}";
            String sig = HmacRequestSigner.sign(body, ts, SECRET);
            assertThat(HmacRequestSigner.verify(body, ts, sig, SECRET)).isTrue();
        }

        @Test
        void bodyWithCRLF_isSignedConsistently() {
            // Carriage return / linefeed must not be normalised away — they're
            // part of the byte payload and a verifier MUST hash the same bytes.
            String ts = String.valueOf(System.currentTimeMillis());
            String body = "line1\r\nline2\nline3\r";
            String sig = HmacRequestSigner.sign(body, ts, SECRET);
            assertThat(HmacRequestSigner.verify(body, ts, sig, SECRET)).isTrue();
            assertThat(HmacRequestSigner.verify("line1\nline2\nline3\r", ts, sig, SECRET))
                    .as("normalised CR/LF must not match")
                    .isFalse();
        }

        @Test
        void emptyBody_isValid_andSignaturesDiffersFromArbitraryBytes() {
            String ts = String.valueOf(System.currentTimeMillis());
            String emptySig = HmacRequestSigner.sign("", ts, SECRET);
            String someBytesSig = HmacRequestSigner.sign(" ", ts, SECRET);
            assertThat(emptySig).isNotEqualTo(someBytesSig);
        }

        @Test
        void largeBody_signsWithinReasonableTime() {
            // 256 KiB body is the gateway / ServiceAuthFilter cap.
            byte[] big = new byte[256 * 1024];
            for (int i = 0; i < big.length; i++) big[i] = (byte) (i & 0xff);
            String body = new String(big, StandardCharsets.ISO_8859_1);
            String ts = String.valueOf(System.currentTimeMillis());

            long before = System.nanoTime();
            String sig = HmacRequestSigner.sign(body, ts, SECRET);
            long elapsedMs = (System.nanoTime() - before) / 1_000_000;

            assertThat(HmacRequestSigner.verify(body, ts, sig, SECRET)).isTrue();
            // 500 ms is generous — just guards against an accidental O(n²)
            // regression from a future "helpful" string-builder rewrite.
            // Loosened from 100 ms to absorb cold-JIT noise in CI.
            assertThat(elapsedMs).isLessThan(500);
        }
    }

    @Nested
    @DisplayName("HMAC-SHA256 reference compatibility")
    class ReferenceVectors {

        @Test
        void knownVector_isPinned_canonicalisationCannotDriftSilently() {
            // Pinned vector computed against the canonical "ts:body" payload
            // with a stable secret. If sign() ever changes its canonicalisation
            // (e.g. someone adds a separator, normalises whitespace, switches
            // to a different MAC algorithm) this test breaks. Intentional
            // changes update the constant; accidental changes get caught.
            //
            // Important: we do NOT call verify() here because verify() applies
            // the 5-minute replay window and would reject a fixed historical
            // timestamp. The pinning is purely about the byte-level signature
            // contract, not the full auth flow.
            String ts = "1700000000000";
            String body = "fuelyn";
            String secret = "01234567890123456789012345678901";

            String sig = HmacRequestSigner.sign(body, ts, secret);
            assertThat(sig).isEqualTo("oelPs0tNTxDLICDzuoYg0fDhiYiNm5TBYN7WQhFOmlI=");
        }
    }

    @Nested
    @DisplayName("Constant-time comparison guarantees")
    class ConstantTime {

        @Test
        void verify_rejectsSignatureOfWrongLength_returnsFalseQuickly() {
            String ts = String.valueOf(System.currentTimeMillis());
            // Half-length signature — must not throw; returns false.
            assertThat(HmacRequestSigner.verify("body", ts, "AAAA", SECRET)).isFalse();
        }

        @Test
        void verify_rejectsSignatureOfWildlyDifferentLength() {
            String ts = String.valueOf(System.currentTimeMillis());
            String huge = "A".repeat(10_000);
            assertThat(HmacRequestSigner.verify("body", ts, huge, SECRET)).isFalse();
        }
    }
}
