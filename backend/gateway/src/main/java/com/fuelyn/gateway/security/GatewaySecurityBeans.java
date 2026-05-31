package com.fuelyn.gateway.security;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import com.fuelyn.gateway.config.FuelynProperties;

/**
 * Wires gateway-local security beans that don't fit on a single filter.
 *
 * <p>{@link GatewayTrustedProxyResolver} is shared across the gateway's IP-based filters (rate
 * limit, request logging, audit) so they all apply the same X-Forwarded-For trust policy.
 */
@Configuration
public class GatewaySecurityBeans {

    @Bean
    public GatewayTrustedProxyResolver gatewayTrustedProxyResolver(FuelynProperties properties) {
        return new GatewayTrustedProxyResolver(properties.getSecurity().getTrustedProxies());
    }
}
