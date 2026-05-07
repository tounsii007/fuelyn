package com.tankpilot.common.security;

import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;
import java.util.Date;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import com.tankpilot.common.config.SecurityProperties;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;

/**
 * JWT token provider for inter-service authentication, using RS256 (asymmetric).
 *
 * <p>Tokens are short-lived (15 minutes) and carry:
 *
 * <ul>
 *   <li>{@code sub} — the issuing service's identifier
 *   <li>{@code type} — always {@code "service"}
 *   <li>{@code iat}, {@code exp} — standard timestamps
 * </ul>
 *
 * <h3>Why RS256 and not HS256?</h3>
 *
 * <p>With a shared HMAC secret (HS256), a single compromised service can forge
 * tokens for any other service. With RS256, each issuing service holds its own
 * private key; everyone else only holds the public key and cannot issue tokens.
 * This dramatically reduces the blast radius of a compromise.
 *
 * <h3>Key format</h3>
 *
 * <p>Keys are accepted either as PEM strings (with or without {@code BEGIN/END}
 * markers) or as raw Base64. Private keys must be PKCS#8, public keys X.509
 * SPKI — i.e. the standard output of:
 *
 * <pre>
 *   openssl genpkey -algorithm RSA -out private.pem -pkeyopt rsa_keygen_bits:2048
 *   openssl rsa    -in private.pem -pubout -out public.pem
 * </pre>
 */
@Component
public class JwtTokenProvider {

    private static final Logger log = LoggerFactory.getLogger(JwtTokenProvider.class);

    /** Token validity duration: 15 minutes. */
    private static final long TOKEN_VALIDITY_MS = 15L * 60L * 1000L;

    private static final String CLAIM_TYPE = "type";
    private static final String TOKEN_TYPE_SERVICE = "service";

    private final PublicKey publicKey;
    private final PrivateKey privateKey;

    public JwtTokenProvider(SecurityProperties props) {
        this.publicKey = parsePublicKey(props.getJwtPublicKey());
        this.privateKey = parsePrivateKey(props.getJwtPrivateKey());
        if (privateKey == null) {
            log.info("JwtTokenProvider started in verify-only mode (no private key configured).");
        }
    }

    /**
     * Generates a short-lived service-to-service token.
     *
     * @throws IllegalStateException if this service has no private key (verify-only)
     */
    public String generateServiceToken(String serviceId) {
        if (privateKey == null) {
            throw new IllegalStateException(
                    "Cannot issue JWT: this service has no private key configured.");
        }
        Date now = new Date();
        Date expiration = new Date(now.getTime() + TOKEN_VALIDITY_MS);

        return Jwts.builder()
                .subject(serviceId)
                .claim(CLAIM_TYPE, TOKEN_TYPE_SERVICE)
                .issuedAt(now)
                .expiration(expiration)
                .signWith(privateKey, Jwts.SIG.RS256)
                .compact();
    }

    /**
     * Validates and parses a JWT token.
     *
     * @throws JwtException if invalid, tampered, or expired
     */
    public Claims validateToken(String token) {
        return Jwts.parser()
                .verifyWith(publicKey)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    public boolean isValid(String token) {
        try {
            validateToken(token);
            return true;
        } catch (ExpiredJwtException e) {
            log.debug("JWT token expired: {}", e.getMessage());
            return false;
        } catch (JwtException e) {
            log.warn("Invalid JWT token: {}", e.getMessage());
            return false;
        }
    }

    public String getServiceId(String token) {
        return validateToken(token).getSubject();
    }

    public boolean isServiceToken(String token) {
        try {
            Claims claims = validateToken(token);
            return TOKEN_TYPE_SERVICE.equals(claims.get(CLAIM_TYPE, String.class));
        } catch (JwtException e) {
            return false;
        }
    }

    // ─── PEM parsing ─────────────────────────────────────────────────

    private static PublicKey parsePublicKey(String raw) {
        if (raw == null || raw.isBlank()) {
            throw new IllegalStateException(
                    "tankpilot.security.jwt-public-key is required");
        }
        try {
            byte[] der = pemToDer(raw, "PUBLIC KEY");
            return KeyFactory.getInstance("RSA")
                    .generatePublic(new X509EncodedKeySpec(der));
        } catch (Exception e) {
            throw new IllegalStateException(
                    "Failed to parse JWT public key. Expected X.509 SPKI PEM.", e);
        }
    }

    private static PrivateKey parsePrivateKey(String raw) {
        if (raw == null || raw.isBlank()) {
            return null; // verify-only mode is allowed
        }
        try {
            byte[] der = pemToDer(raw, "PRIVATE KEY");
            return KeyFactory.getInstance("RSA")
                    .generatePrivate(new PKCS8EncodedKeySpec(der));
        } catch (Exception e) {
            throw new IllegalStateException(
                    "Failed to parse JWT private key. Expected PKCS#8 PEM.", e);
        }
    }

    /** Strips PEM armor and decodes Base64. Accepts CRLF, LF, and escaped "\n". */
    private static byte[] pemToDer(String pem, String label) {
        String cleaned = pem
                .replace("\\n", "\n")
                .replace("-----BEGIN " + label + "-----", "")
                .replace("-----END " + label + "-----", "")
                .replace("-----BEGIN RSA " + label + "-----", "")
                .replace("-----END RSA " + label + "-----", "")
                .replaceAll("\\s+", "");
        return Base64.getDecoder().decode(cleaned.getBytes(StandardCharsets.US_ASCII));
    }
}
