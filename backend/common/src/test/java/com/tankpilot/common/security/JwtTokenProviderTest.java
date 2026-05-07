package com.tankpilot.common.security;

import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.util.Base64;
import java.util.Date;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import com.tankpilot.common.config.SecurityProperties;

import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.Jwts;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class JwtTokenProviderTest {

    private static String publicPem;
    private static String privatePem;
    private static String otherPublicPem;

    @BeforeAll
    static void generateKeys() throws Exception {
        KeyPair primary = generateRsaKeyPair();
        publicPem = toPem(primary.getPublic().getEncoded(), "PUBLIC KEY");
        privatePem = toPem(primary.getPrivate().getEncoded(), "PRIVATE KEY");

        KeyPair other = generateRsaKeyPair();
        otherPublicPem = toPem(other.getPublic().getEncoded(), "PUBLIC KEY");
    }

    private static KeyPair generateRsaKeyPair() throws Exception {
        KeyPairGenerator kpg = KeyPairGenerator.getInstance("RSA");
        kpg.initialize(2048);
        return kpg.generateKeyPair();
    }

    private static String toPem(byte[] der, String label) {
        String b64 = Base64.getMimeEncoder(64, "\n".getBytes()).encodeToString(der);
        return "-----BEGIN " + label + "-----\n" + b64 + "\n-----END " + label + "-----\n";
    }

    private static SecurityProperties props(String pubPem, String privPem) {
        SecurityProperties p = new SecurityProperties();
        p.setHmacSecret("a-real-hmac-secret-that-is-at-least-32-chars");
        p.setJwtPublicKey(pubPem);
        p.setJwtPrivateKey(privPem);
        return p;
    }

    @Test
    void generateAndValidate_roundTrip() {
        JwtTokenProvider provider = new JwtTokenProvider(props(publicPem, privatePem));
        String token = provider.generateServiceToken("price-service");

        assertThat(token).isNotBlank();
        assertThat(provider.isValid(token)).isTrue();
        assertThat(provider.getServiceId(token)).isEqualTo("price-service");
        assertThat(provider.isServiceToken(token)).isTrue();
    }

    @Test
    void isValid_falseForTokenSignedWithDifferentKey() {
        JwtTokenProvider issuer = new JwtTokenProvider(props(publicPem, privatePem));
        JwtTokenProvider verifyOther = new JwtTokenProvider(props(otherPublicPem, null));

        String token = issuer.generateServiceToken("gateway");
        assertThat(verifyOther.isValid(token)).isFalse();
    }

    @Test
    void isValid_falseForExpiredToken() throws Exception {
        java.security.PrivateKey priv = java.security.KeyFactory.getInstance("RSA")
                .generatePrivate(new java.security.spec.PKCS8EncodedKeySpec(
                        Base64.getDecoder().decode(
                                privatePem
                                        .replace("-----BEGIN PRIVATE KEY-----", "")
                                        .replace("-----END PRIVATE KEY-----", "")
                                        .replaceAll("\\s+", ""))));

        String expired = Jwts.builder()
                .subject("gateway")
                .claim("type", "service")
                .issuedAt(new Date(System.currentTimeMillis() - 60_000L))
                .expiration(new Date(System.currentTimeMillis() - 30_000L))
                .signWith(priv, Jwts.SIG.RS256)
                .compact();

        JwtTokenProvider provider = new JwtTokenProvider(props(publicPem, privatePem));
        assertThat(provider.isValid(expired)).isFalse();
        assertThatThrownBy(() -> provider.validateToken(expired))
                .isInstanceOf(ExpiredJwtException.class);
    }

    @Test
    void isValid_falseForGarbageToken() {
        JwtTokenProvider provider = new JwtTokenProvider(props(publicPem, privatePem));
        assertThat(provider.isValid("not.a.jwt")).isFalse();
    }

    @Test
    void verifyOnlyMode_cannotIssue() {
        JwtTokenProvider verifyOnly = new JwtTokenProvider(props(publicPem, null));
        assertThatThrownBy(() -> verifyOnly.generateServiceToken("anyone"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("no private key");
    }
}
