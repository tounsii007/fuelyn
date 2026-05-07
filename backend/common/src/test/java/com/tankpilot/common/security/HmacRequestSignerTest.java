package com.tankpilot.common.security;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class HmacRequestSignerTest {

    private static final String SECRET = "unit-test-secret-that-is-at-least-32-chars";

    @Test
    void signAndVerify_roundTrip() {
        String body = "{\"hello\":\"world\"}";
        String ts = String.valueOf(System.currentTimeMillis());

        String signature = HmacRequestSigner.sign(body, ts, SECRET);

        assertThat(signature).isNotBlank();
        assertThat(HmacRequestSigner.verify(body, ts, signature, SECRET)).isTrue();
    }

    @Test
    void verify_rejectsTamperedBody() {
        String ts = String.valueOf(System.currentTimeMillis());
        String signature = HmacRequestSigner.sign("{\"a\":1}", ts, SECRET);

        assertThat(HmacRequestSigner.verify("{\"a\":2}", ts, signature, SECRET)).isFalse();
    }

    @Test
    void verify_rejectsStaleTimestamp() {
        String body = "{}";
        long tenMinutesAgo = System.currentTimeMillis() - (10L * 60L * 1000L);
        String ts = String.valueOf(tenMinutesAgo);

        String signature = HmacRequestSigner.sign(body, ts, SECRET);

        assertThat(HmacRequestSigner.verify(body, ts, signature, SECRET)).isFalse();
    }

    @Test
    void verify_rejectsNonNumericTimestamp() {
        assertThat(HmacRequestSigner.verify("{}", "not-a-number", "sig", SECRET)).isFalse();
    }

    @Test
    void verify_rejectsWrongSecret() {
        String body = "{}";
        String ts = String.valueOf(System.currentTimeMillis());
        String signature = HmacRequestSigner.sign(body, ts, SECRET);

        assertThat(
                HmacRequestSigner.verify(body, ts, signature, "different-secret-that-is-at-least-32-chars")
        ).isFalse();
    }
}
