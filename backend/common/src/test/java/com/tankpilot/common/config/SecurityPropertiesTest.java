package com.tankpilot.common.config;

import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.util.Base64;
import java.util.List;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SecurityPropertiesTest {

    private static String publicPem;
    private static String privatePem;

    @BeforeAll
    static void keys() throws Exception {
        KeyPairGenerator kpg = KeyPairGenerator.getInstance("RSA");
        kpg.initialize(2048);
        KeyPair kp = kpg.generateKeyPair();
        publicPem = toPem(kp.getPublic().getEncoded(), "PUBLIC KEY");
        privatePem = toPem(kp.getPrivate().getEncoded(), "PRIVATE KEY");
    }

    private static String toPem(byte[] der, String label) {
        String b64 = Base64.getMimeEncoder(64, "\n".getBytes()).encodeToString(der);
        return "-----BEGIN " + label + "-----\n" + b64 + "\n-----END " + label + "-----\n";
    }

    private static SecurityProperties valid() {
        SecurityProperties props = new SecurityProperties();
        props.setHmacSecret(
                "a-real-hmac-secret-that-is-at-least-32-chars-and-has-entropy-1234567890abcdef");
        props.setJwtPublicKey(publicPem);
        props.setJwtPrivateKey(privatePem);
        return props;
    }

    @Test
    void accepts_strongConfiguration() {
        SecurityProperties props = valid();
        props.setApiKeys(List.of(
                "9f3b1c7e2d4a8e0f6b5c1d9e4f7a2c8b3d6e1f9c0a5b8e2d4f7c1a3b6e9d2c5f"));

        props.validateSecrets();

        assertThat(props.getHmacSecret()).hasSizeGreaterThanOrEqualTo(32);
        assertThat(props.getJwtPublicKey()).contains("PUBLIC KEY");
    }

    @Test
    void rejects_dictionaryWordHmacSecret() {
        SecurityProperties props = valid();
        props.setHmacSecret("change-me-in-production-32chars!");

        assertThatThrownBy(props::validateSecrets)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("letter run");
    }

    @Test
    void rejects_missingPublicKey() {
        SecurityProperties props = valid();
        props.setJwtPublicKey("");

        assertThatThrownBy(props::validateSecrets)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("jwt-public-key");
    }

    @Test
    void rejects_lowEntropyApiKey() {
        SecurityProperties props = valid();
        props.setApiKeys(List.of("dev-api-key-change-in-production"));

        assertThatThrownBy(props::validateSecrets)
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void allows_verifyOnlyConfig() {
        // No private key — service can verify but not issue.
        SecurityProperties props = valid();
        props.setJwtPrivateKey(null);

        props.validateSecrets();
        assertThat(props.getJwtPrivateKey()).isNull();
    }
}
