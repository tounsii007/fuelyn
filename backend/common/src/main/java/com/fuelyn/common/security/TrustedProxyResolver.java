package com.fuelyn.common.security;

import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Determines the real client IP for rate-limiting / audit logging, defending against {@code
 * X-Forwarded-For} spoofing.
 *
 * <p>Pre-existing rate limiters trusted {@code X-Forwarded-For} blindly: any client could write the
 * header themselves and rotate through fake values to bypass the per-IP cap. This resolver only
 * honours XFF when the immediate remote address is itself in a configured trusted-proxy CIDR list —
 * i.e. our reverse proxy, load balancer, or CDN. Direct traffic that pretends to forward from
 * another IP is ignored.
 *
 * <p>Default trusted set is <em>empty</em>. When unconfigured the resolver always returns the raw
 * remote address, which is the safe conservative behaviour for self-hosted setups behind a single
 * loopback proxy. Operators behind a multi-hop CDN must explicitly list the upstream CIDRs in
 * {@code fuelyn.security.trusted-proxies}.
 */
public final class TrustedProxyResolver {

    private static final Logger log = LoggerFactory.getLogger(TrustedProxyResolver.class);

    private final List<Cidr> trustedCidrs;

    public TrustedProxyResolver(List<String> trustedProxyCidrs) {
        this.trustedCidrs =
                (trustedProxyCidrs == null || trustedProxyCidrs.isEmpty())
                        ? Collections.emptyList()
                        : trustedProxyCidrs.stream()
                                .map(TrustedProxyResolver::parseCidr)
                                .filter(java.util.Objects::nonNull)
                                .toList();
    }

    /**
     * Resolve the client IP from the perspective of the application.
     *
     * @param remoteAddr the connection-level remote IP (never trust this verbatim if it represents
     *     a proxy)
     * @param xForwardedFor the raw {@code X-Forwarded-For} header value, or {@code null}
     * @return the resolved client IP — XFF's first hop if remoteAddr is trusted, otherwise
     *     remoteAddr itself
     */
    public String resolve(String remoteAddr, String xForwardedFor) {
        if (remoteAddr == null || remoteAddr.isBlank()) {
            return "unknown";
        }
        if (xForwardedFor == null || xForwardedFor.isBlank()) {
            return remoteAddr;
        }
        if (!isTrustedProxy(remoteAddr)) {
            // Don't honour the header — connection is direct from a client
            // that should not be allowed to claim somebody else's IP.
            return remoteAddr;
        }
        // First hop in the comma-separated list is the original client.
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

    /** Compact IPv4/IPv6 CIDR matcher; null on parse failure (logged). */
    private static Cidr parseCidr(String spec) {
        try {
            int slash = spec.indexOf('/');
            if (slash < 0) {
                // Bare address → /32 (IPv4) or /128 (IPv6).
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
                return false; // IPv4 vs IPv6 mismatch
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

    /** Convenience for tests / quick wiring. */
    public static TrustedProxyResolver of(String... cidrs) {
        return new TrustedProxyResolver(Arrays.asList(cidrs));
    }
}
