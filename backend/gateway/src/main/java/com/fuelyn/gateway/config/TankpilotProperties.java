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
public class TankpilotProperties {

    private final Security security = new Security();
    private final Gateway gateway = new Gateway();

    public Security getSecurity() {
        return security;
    }

    public Gateway getGateway() {
        return gateway;
    }

    public static class Security {
        private String hmacSecret = "change-me-in-production-32chars!";
        private String jwtSecret = "change-this-jwt-secret-in-production-min-32-chars!!";
        private String serviceId = "gateway";
        private List<String> apiKeys = new ArrayList<>();

        public String getHmacSecret() { return hmacSecret; }
        public void setHmacSecret(String hmacSecret) { this.hmacSecret = hmacSecret; }
        public String getJwtSecret() { return jwtSecret; }
        public void setJwtSecret(String jwtSecret) { this.jwtSecret = jwtSecret; }
        public String getServiceId() { return serviceId; }
        public void setServiceId(String serviceId) { this.serviceId = serviceId; }
        public List<String> getApiKeys() { return apiKeys; }
        public void setApiKeys(List<String> apiKeys) { this.apiKeys = apiKeys; }
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
