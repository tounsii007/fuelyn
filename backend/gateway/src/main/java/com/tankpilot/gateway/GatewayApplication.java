package com.tankpilot.gateway;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * TankPilot API Gateway.
 *
 * <p>Single entry point for all frontend requests. Routes traffic to
 * Price Service (8081) and AI Service (8082) with HMAC signing,
 * rate limiting, and circuit breaker fallbacks.</p>
 */
@SpringBootApplication
public class GatewayApplication {

    public static void main(String[] args) {
        SpringApplication.run(GatewayApplication.class, args);
    }
}
