package com.fuelyn.common.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class SecretPolicyTest {

    @Test
    void rejects_null() {
        assertThatThrownBy(() -> SecretPolicy.requireStrong("secret", null))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("not set");
    }

    @Test
    void rejects_blank() {
        assertThatThrownBy(() -> SecretPolicy.requireStrong("secret", "   "))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void rejects_tooShort() {
        assertThatThrownBy(() -> SecretPolicy.requireStrong("secret", "short"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("at least");
    }

    @Test
    void rejects_dictionaryWordPlaceholder() {
        // "production" is a 10-char letter run → caught by the run heuristic.
        assertThatThrownBy(
                        () ->
                                SecretPolicy.requireStrong(
                                        "secret", "change-me-in-production-32chars!"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("letter run");
    }

    @Test
    void longestLetterRun_isCorrect() {
        assertThat(SecretPolicy.longestLetterRun("abc-1234-defghi")).isEqualTo(6);
        // Every letter sits between digits → longest run is 1.
        assertThat(SecretPolicy.longestLetterRun("9f3b1c7e2d4a8e")).isEqualTo(1);
        assertThat(SecretPolicy.longestLetterRun("change-me-in-production")).isEqualTo(10);
        assertThat(SecretPolicy.longestLetterRun("")).isZero();
    }

    @Test
    void rejects_repeatingChars() {
        // 32 'a' chars = entropy 0
        assertThatThrownBy(() -> SecretPolicy.requireStrong("secret", "a".repeat(32)))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("entropy");
    }

    @Test
    void accepts_opensslHexLikeSecret() {
        // 64 hex chars (= openssl rand -hex 32) — well above the entropy floor.
        String hex = "9f3b1c7e2d4a8e0f6b5c1d9e4f7a2c8b3d6e1f9c0a5b8e2d4f7c1a3b6e9d2c5f";
        SecretPolicy.requireStrong("secret", hex);
    }

    @Test
    void shannonEntropy_zeroForEmpty() {
        assertThat(SecretPolicy.shannonEntropyBitsPerChar("")).isZero();
        assertThat(SecretPolicy.shannonEntropyBitsPerChar(null)).isZero();
    }

    @Test
    void shannonEntropy_zeroForUniform() {
        assertThat(SecretPolicy.shannonEntropyBitsPerChar("aaaaaaaa")).isZero();
    }

    @Test
    void shannonEntropy_oneBitForBalancedBinary() {
        assertThat(SecretPolicy.shannonEntropyBitsPerChar("abababab")).isEqualTo(1.0);
    }
}
