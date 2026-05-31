package com.fuelyn.common.config;

import java.util.ArrayList;
import java.util.List;

import jakarta.annotation.PostConstruct;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;
import org.springframework.validation.annotation.Validated;

import com.fuelyn.common.security.SecretPolicy;

/**
 * Externalized security configuration properties shared across Fuelyn services.
 *
 * <p>Bound to the {@code fuelyn.security} prefix in {@code application.yml}. Provides the HMAC
 * shared secret, service identity, and API key lists.
 *
 * <p>All secrets MUST be provided via environment variables. {@link SecretPolicy} rejects weak or
 * placeholder values at startup.
 */
@Component
@ConfigurationProperties(prefix = "fuelyn.security")
@Validated
public class SecurityProperties {

    /** Shared HMAC secret for request-body signing (service-to-service). */
    @NotBlank(message = "fuelyn.security.hmac-secret must be set")
    @Size(min = SecretPolicy.MIN_LENGTH, message = "HMAC secret must be at least 32 characters")
    private String hmacSecret;

    /** Identifier of the current microservice (used in signed headers). */
    @NotBlank private String serviceId = "unknown-service";

    /** Optional list of API keys for external-client authentication. */
    private List<String> apiKeys = new ArrayList<>();

    /**
     * CIDRs from which the {@code X-Forwarded-For} header may be trusted. Empty by default — direct
     * callers cannot spoof their source IP for rate-limiting purposes. Configure with the upstream
     * LB / CDN ranges when running behind one (e.g. {@code 10.0.0.0/8, 192.168.0.0/16}).
     */
    private List<String> trustedProxies = new ArrayList<>();

    @PostConstruct
    void validateSecrets() {
        SecretPolicy.requireStrong("fuelyn.security.hmac-secret", hmacSecret);

        for (int i = 0; i < apiKeys.size(); i++) {
            String key = apiKeys.get(i);
            if (key != null && !key.isBlank()) {
                SecretPolicy.requireStrong("fuelyn.security.api-keys[" + i + "]", key);
            }
        }
    }

    public String getHmacSecret() {
        return hmacSecret;
    }

    public void setHmacSecret(String hmacSecret) {
        this.hmacSecret = hmacSecret;
    }

    public String getServiceId() {
        return serviceId;
    }

    public void setServiceId(String serviceId) {
        this.serviceId = serviceId;
    }

    public List<String> getApiKeys() {
        return apiKeys;
    }

    public void setApiKeys(List<String> apiKeys) {
        this.apiKeys = apiKeys;
    }

    public List<String> getTrustedProxies() {
        return trustedProxies;
    }

    public void setTrustedProxies(List<String> trustedProxies) {
        this.trustedProxies = trustedProxies;
    }
}
