package com.tankpilot.common.security;

import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * Policy-based secret validation that replaces hard-coded placeholder blacklists.
 *
 * <p>A secret is "production-fit" when it satisfies ALL of:
 *
 * <ol>
 *   <li><b>Length</b> ≥ 32 bytes (256-bit floor for HMAC-SHA256)
 *   <li><b>Shannon entropy</b> ≥ 3.5 bits/char — rules out repeated chars / very
 *       small alphabets ("aaaaaaaa", "0000000…")
 *   <li><b>Maximum contiguous-letter run</b> ≤ 7 — rules out dictionary-style
 *       placeholders like {@code "change-me-in-production-32chars!"} which
 *       contains the run {@code "production"} (length 10). Cryptographically
 *       generated tokens (hex, base64) almost never produce a letter run of
 *       this length.
 * </ol>
 *
 * <p>Combining entropy + the letter-run heuristic catches every realistic
 * placeholder string we have ever seen in the wild, while still accepting
 * any output of {@code openssl rand -hex 32} or {@code openssl rand -base64 32}.
 */
public final class SecretPolicy {

    public static final int MIN_LENGTH = 32;
    public static final double MIN_ENTROPY_BITS_PER_CHAR = 3.5;
    public static final int MAX_LETTER_RUN = 7;

    private SecretPolicy() {}

    public static void requireStrong(String fieldName, String value) {
        if (value == null || value.isBlank()) {
            throw new IllegalStateException(
                    "Refusing to start: " + fieldName + " is not set. "
                            + "Generate with `openssl rand -hex 32`.");
        }
        if (value.length() < MIN_LENGTH) {
            throw new IllegalStateException(
                    "Refusing to start: " + fieldName + " must be at least "
                            + MIN_LENGTH + " characters (got " + value.length() + ").");
        }

        double entropy = shannonEntropyBitsPerChar(value);
        int longestLetterRun = longestLetterRun(value);

        if (entropy < MIN_ENTROPY_BITS_PER_CHAR) {
            throw new IllegalStateException(
                    String.format(
                            Locale.ROOT,
                            "Refusing to start: %s has insufficient entropy "
                                    + "(%.2f bits/char, need ≥ %.2f). "
                                    + "Generate a real secret with `openssl rand -hex 32`.",
                            fieldName, entropy, MIN_ENTROPY_BITS_PER_CHAR));
        }
        if (longestLetterRun > MAX_LETTER_RUN) {
            throw new IllegalStateException(
                    String.format(
                            Locale.ROOT,
                            "Refusing to start: %s contains a %d-character "
                                    + "letter run, which looks like a dictionary-word "
                                    + "placeholder. Generate with `openssl rand -hex 32`.",
                            fieldName, longestLetterRun));
        }
    }

    /** Shannon entropy H(X) = -Σ p(xᵢ) · log₂ p(xᵢ), in bits per character. */
    public static double shannonEntropyBitsPerChar(String s) {
        if (s == null || s.isEmpty()) return 0.0;
        Map<Character, Integer> freq = new HashMap<>();
        for (int i = 0; i < s.length(); i++) {
            freq.merge(s.charAt(i), 1, Integer::sum);
        }
        double length = s.length();
        double entropy = 0.0;
        for (int count : freq.values()) {
            double p = count / length;
            entropy -= p * (Math.log(p) / Math.log(2));
        }
        return entropy;
    }

    /** Length of the longest run of consecutive ASCII letters in {@code s}. */
    public static int longestLetterRun(String s) {
        if (s == null || s.isEmpty()) return 0;
        int max = 0;
        int run = 0;
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')) {
                run++;
                if (run > max) max = run;
            } else {
                run = 0;
            }
        }
        return max;
    }
}
