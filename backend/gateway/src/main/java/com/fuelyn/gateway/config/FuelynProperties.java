package com.fuelyn.gateway.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * Gateway-specific configuration properties.
 */
@Component
@ConfigurationProperties(prefix = "fuelyn")
public class FuelynProperties {

    private final Security security = new Security();
    private final Gateway gateway = new Gateway();

    public Security getSecurity() {
        return security;
    }

    public Gateway getGateway() {
        return gateway;
    }

    public static class Security {
        // No committed secret default: the real value is injected from
        // FUELYN_HMAC_SECRET via application.yml's ${FUELYN_*:} binding
        // (see docker-compose.yml, which maps the shared HMAC_SECRET).
        // Empty here means "not configured" rather than a guessable
        // placeholder in source.
        private String hmacSecret = "";
        private String serviceId = "gateway";
        private List<String> apiKeys = new ArrayList<>();
        /**
         * CIDRs from which X-Forwarded-For will be honoured. Empty by
         * default — direct callers cannot spoof their source IP for
         * rate-limit purposes. Configure with the upstream LB / CDN
         * ranges when running behind one.
         */
        private List<String> trustedProxies = new ArrayList<>();

        public String getHmacSecret() { return hmacSecret; }
        public void setHmacSecret(String hmacSecret) { this.hmacSecret = hmacSecret; }
        public String getServiceId() { return serviceId; }
        public void setServiceId(String serviceId) { this.serviceId = serviceId; }
        public List<String> getApiKeys() { return apiKeys; }
        public void setApiKeys(List<String> apiKeys) { this.apiKeys = apiKeys; }
        public List<String> getTrustedProxies() { return trustedProxies; }
        public void setTrustedProxies(List<String> trustedProxies) { this.trustedProxies = trustedProxies; }
    }

    public static class Gateway {
        private final RateLimit rateLimit = new RateLimit();
        public RateLimit getRateLimit() { return rateLimit; }

        public static class RateLimit {
            private int requestsPerSecond = 10;
            private int burstCapacity = 20;
            public int getRequestsPerSecond() { return requestsPerSecond; }
            public void setRequestsPerSecond(int r) { this.requestsPerSecond = r; }
            public int getBurstCapacity() { return burstCapacity; }
            public void setBurstCapacity(int b) { this.burstCapacity = b; }
        }
    }
}
