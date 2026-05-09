package com.fuelyn.common.security;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.InvalidKeyException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Base64;

/**
 * Signs and verifies HTTP requests between microservices using HMAC-SHA256.
 *
 * <p>Each service shares a secret key. When Service A calls Service B:</p>
 * <ol>
 *   <li>Service A signs the request body + timestamp with HMAC</li>
 *   <li>Adds headers: {@code X-Signature}, {@code X-Timestamp}, {@code X-Service-Id}</li>
 *   <li>Service B verifies the signature before processing</li>
 *   <li>Rejects requests older than 5 minutes (replay attack prevention)</li>
 * </ol>
 *
 * <p>The signing payload format is {@code timestamp:body}, ensuring that both
 * the request body and the time of signing are bound to the signature. This
 * prevents an attacker from replaying a captured request at a later time.</p>
 *
 * @see ServiceAuthFilter
 * @see SecureServiceClient
 */
public final class HmacRequestSigner {

    /** Algorithm used for HMAC signing. */
    private static final String HMAC_ALGORITHM = "HmacSHA256";

    /** Maximum age of a signed request before it is considered stale (5 minutes). */
    private static final long MAX_AGE_MS = 5L * 60L * 1000L;

    private HmacRequestSigner() {
        // Utility class - prevent instantiation
    }

    /**
     * Signs a request payload using HMAC-SHA256.
     *
     * <p>The signature is computed over {@code timestamp:body} to bind the request
     * content and the time of signing together. The result is Base64-encoded.</p>
     *
     * @param body      the HTTP request body (use empty string for bodyless requests)
     * @param timestamp the epoch millisecond timestamp as a string
     * @param secret    the shared HMAC secret key
     * @return Base64-encoded HMAC-SHA256 signature
     * @throws HmacSigningException if the HMAC computation fails
     */
    public static String sign(String body, String timestamp, String secret) {
        if (timestamp == null || timestamp.isEmpty()) {
            throw new HmacSigningException("timestamp must not be null/empty", null);
        }
        if (secret == null || secret.isEmpty()) {
            throw new HmacSigningException("secret must not be null/empty", null);
        }
        // Null body → empty string. Without this, "ts:null" is signed, and a
        // caller passing null gets a different signature than one passing ""
        // even though the wire request looks identical. Normalising on the
        // signing side keeps both sides of the boundary consistent.
        String safeBody = body == null ? "" : body;
        try {
            String payload = timestamp + ":" + safeBody;
            Mac mac = Mac.getInstance(HMAC_ALGORITHM);
            SecretKeySpec keySpec = new SecretKeySpec(
                    secret.getBytes(StandardCharsets.UTF_8), HMAC_ALGORITHM
            );
            mac.init(keySpec);
            byte[] hash = mac.doFinal(payload.getBytes(StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(hash);
        } catch (NoSuchAlgorithmException | InvalidKeyException e) {
            throw new HmacSigningException("Failed to compute HMAC-SHA256 signature", e);
        }
    }

    /**
     * Verifies an HMAC-SHA256 signature against a request payload.
     *
     * <p>Performs two checks:</p>
     * <ol>
     *   <li><strong>Timestamp freshness</strong> - rejects requests older than 5 minutes
     *       to prevent replay attacks.</li>
     *   <li><strong>Signature validity</strong> - uses constant-time comparison via
     *       {@link MessageDigest#isEqual} to prevent timing attacks.</li>
     * </ol>
     *
     * @param body      the HTTP request body
     * @param timestamp the epoch millisecond timestamp as a string
     * @param signature the Base64-encoded HMAC signature to verify
     * @param secret    the shared HMAC secret key
     * @return {@code true} if the signature is valid and the request is fresh
     */
    public static boolean verify(String body, String timestamp, String signature, String secret) {
        // Null/empty timestamp or signature → reject without computing anything.
        // The previous code NPE'd on signature.getBytes() and bubbled to the
        // catch-all 500 instead of the deterministic "401 unauthorized" the
        // caller expects.
        if (timestamp == null || timestamp.isEmpty()
                || signature == null || signature.isEmpty()
                || secret == null || secret.isEmpty()) {
            return false;
        }

        // 1. Parse and validate timestamp
        long requestTime;
        try {
            requestTime = Long.parseLong(timestamp);
        } catch (NumberFormatException e) {
            return false;
        }

        // 2. Check timestamp freshness (prevent replay attacks)
        long age = Math.abs(System.currentTimeMillis() - requestTime);
        if (age > MAX_AGE_MS) {
            return false;
        }

        // 3. Compute expected signature and compare in constant time.
        // Wrapping in try/catch so that a malformed secret on this side
        // (sign throws HmacSigningException) becomes "verification failed"
        // instead of a leaked 500.
        String expected;
        try {
            expected = sign(body, timestamp, secret);
        } catch (HmacSigningException e) {
            return false;
        }
        byte[] expectedBytes = expected.getBytes(StandardCharsets.UTF_8);
        byte[] suppliedBytes = signature.getBytes(StandardCharsets.UTF_8);
        // MessageDigest.isEqual short-circuits on length mismatch BEFORE the
        // constant-time loop in the JDK implementation, which technically
        // leaks length info — fine here since signature length is fixed by
        // the algorithm (SHA-256 = 32 bytes → 44 base64 chars).
        return MessageDigest.isEqual(expectedBytes, suppliedBytes);
    }

    /**
     * Runtime exception indicating HMAC signature computation failure.
     * This typically means the JVM does not support HmacSHA256 or the key is invalid.
     */
    public static class HmacSigningException extends RuntimeException {
        public HmacSigningException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
