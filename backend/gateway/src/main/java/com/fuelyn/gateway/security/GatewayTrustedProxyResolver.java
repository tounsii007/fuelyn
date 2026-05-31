package com.fuelyn.gateway.security;

import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.Collections;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Local sibling of {@code com.fuelyn.common.security.TrustedProxyResolver}.
 *
 * <p>The gateway runs on Spring WebFlux, while {@code fuelyn-common} pulls in {@code
 * spring-boot-starter-web} (servlet) — both starters on the same classpath would refuse to boot.
 * Until / unless the resolver is extracted into a Spring-free utility module, this gateway-local
 * copy keeps the X-Forwarded-For trust logic identical to the servlet-stack version.
 *
 * <p><b>Drift discipline:</b> any change here MUST mirror the commit in {@code
 * TrustedProxyResolver.java}. The class is intentionally tiny so the diff stays trivial.
 */
public final class GatewayTrustedProxyResolver {

    private static final Logger log = LoggerFactory.getLogger(GatewayTrustedProxyResolver.class);

    private final List<Cidr> trustedCidrs;

    public GatewayTrustedProxyResolver(List<String> trustedProxyCidrs) {
        this.trustedCidrs =
                (trustedProxyCidrs == null || trustedProxyCidrs.isEmpty())
                        ? Collections.emptyList()
                        : trustedProxyCidrs.stream()
                                .map(GatewayTrustedProxyResolver::parseCidr)
                                .filter(java.util.Objects::nonNull)
                                .toList();
    }

    public String resolve(String remoteAddr, String xForwardedFor) {
        if (remoteAddr == null || remoteAddr.isBlank()) {
            return "unknown";
        }
        if (xForwardedFor == null || xForwardedFor.isBlank()) {
            return remoteAddr;
        }
        if (!isTrustedProxy(remoteAddr)) {
            return remoteAddr;
        }
        String first = xForwardedFor.split(",")[0].trim();
        return first.isEmpty() ? remoteAddr : first;
    }

    private boolean isTrustedProxy(String addr) {
        if (trustedCidrs.isEmpty()) {
            return false;
        }
        try {
            byte[] candidate = InetAddress.getByName(addr).getAddress();
            for (Cidr cidr : trustedCidrs) {
                if (cidr.contains(candidate)) {
                    return true;
                }
            }
        } catch (UnknownHostException e) {
            log.warn("Could not parse remote address '{}' as inet: {}", addr, e.getMessage());
        }
        return false;
    }

    private static Cidr parseCidr(String spec) {
        try {
            int slash = spec.indexOf('/');
            if (slash < 0) {
                InetAddress addr = InetAddress.getByName(spec.trim());
                return new Cidr(addr.getAddress(), addr.getAddress().length * 8);
            }
            InetAddress addr = InetAddress.getByName(spec.substring(0, slash).trim());
            int prefix = Integer.parseInt(spec.substring(slash + 1).trim());
            return new Cidr(addr.getAddress(), prefix);
        } catch (Exception e) {
            log.warn("Ignoring invalid trusted-proxy CIDR '{}': {}", spec, e.getMessage());
            return null;
        }
    }

    private record Cidr(byte[] network, int prefixBits) {
        boolean contains(byte[] candidate) {
            if (candidate.length != network.length) {
                return false;
            }
            int fullBytes = prefixBits / 8;
            int remainderBits = prefixBits % 8;
            for (int i = 0; i < fullBytes; i++) {
                if (candidate[i] != network[i]) return false;
            }
            if (remainderBits == 0) return true;
            int mask = 0xFF << (8 - remainderBits) & 0xFF;
            return (candidate[fullBytes] & mask) == (network[fullBytes] & mask);
        }
    }
}
