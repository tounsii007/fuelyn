package com.fuelyn.common.config;

import java.util.List;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SecurityPropertiesTest {

    private static SecurityProperties valid() {
        SecurityProperties props = new SecurityProperties();
        props.setHmacSecret(
                "a-real-hmac-secret-that-is-at-least-32-chars-and-has-entropy-1234567890abcdef");
        return props;
    }

    @Test
    void accepts_strongConfiguration() {
        SecurityProperties props = valid();
        props.setApiKeys(List.of(
                "9f3b1c7e2d4a8e0f6b5c1d9e4f7a2c8b3d6e1f9c0a5b8e2d4f7c1a3b6e9d2c5f"));

        props.validateSecrets();

        assertThat(props.getHmacSecret()).hasSizeGreaterThanOrEqualTo(32);
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
    void rejects_lowEntropyApiKey() {
        SecurityProperties props = valid();
        props.setApiKeys(List.of("dev-api-key-change-in-production"));

        assertThatThrownBy(props::validateSecrets)
                .isInstanceOf(IllegalStateException.class);
    }
}
