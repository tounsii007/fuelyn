package com.fuelyn.common.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * Coverage of {@link TrustedProxyResolver} — the central X-Forwarded-For trust gate. Every branch
 * tested because a wrong call in this class silently downgrades the rate-limiter's per-IP cap to
 * per-XFF-claim.
 *
 * <p>Test-class structure mirrors the resolver's branches:
 *
 * <ul>
 *   <li>direct connection (no XFF) → remoteAddr
 *   <li>XFF present + remote NOT trusted → remoteAddr (the spoof case)
 *   <li>XFF present + remote trusted → first XFF hop
 *   <li>malformed CIDR / addresses → ignored, never crashes
 *   <li>IPv6 vs IPv4 — explicit, since the byte-length mismatch logic has historically been a
 *       source of subtle CIDR bugs
 * </ul>
 */
class TrustedProxyResolverTest {

    @Nested
    @DisplayName("Empty / no trusted proxies — XFF must NEVER be honoured")
    class NoTrustedSet {

        @Test
        void resolve_returnsRemoteAddr_whenXffMissing() {
            TrustedProxyResolver r = new TrustedProxyResolver(List.of());
            assertThat(r.resolve("203.0.113.5", null)).isEqualTo("203.0.113.5");
        }

        @Test
        void resolve_returnsRemoteAddr_whenXffPresentButNoTrustedProxies() {
            // The headline case: empty trust list MUST treat XFF as untrusted.
            TrustedProxyResolver r = new TrustedProxyResolver(List.of());
            assertThat(r.resolve("203.0.113.5", "1.2.3.4")).isEqualTo("203.0.113.5");
        }

        @Test
        void resolve_returnsUnknown_whenRemoteAddrIsBlank() {
            TrustedProxyResolver r = new TrustedProxyResolver(List.of());
            assertThat(r.resolve("", "1.2.3.4")).isEqualTo("unknown");
            assertThat(r.resolve(null, "1.2.3.4")).isEqualTo("unknown");
        }
    }

    @Nested
    @DisplayName("Trusted proxy hits — XFF first hop is honoured")
    class TrustedProxyHonouredXff {

        @Test
        void resolve_returnsXffFirst_whenRemoteIsTrusted() {
            TrustedProxyResolver r = TrustedProxyResolver.of("10.0.0.0/8");
            assertThat(r.resolve("10.1.2.3", "203.0.113.5")).isEqualTo("203.0.113.5");
        }

        @Test
        void resolve_returnsFirstHop_whenXffHasMultipleEntries() {
            // Standard XFF chain: client, hop1, hop2, …
            TrustedProxyResolver r = TrustedProxyResolver.of("10.0.0.0/8");
            assertThat(r.resolve("10.1.2.3", "203.0.113.5, 198.51.100.7, 192.0.2.1"))
                    .isEqualTo("203.0.113.5");
        }

        @Test
        void resolve_trimsWhitespace_aroundFirstHop() {
            TrustedProxyResolver r = TrustedProxyResolver.of("10.0.0.0/8");
            assertThat(r.resolve("10.1.2.3", "  203.0.113.5  , 1.2.3.4")).isEqualTo("203.0.113.5");
        }

        @Test
        void resolve_fallsBackToRemoteAddr_whenFirstHopIsEmpty() {
            // ", 1.2.3.4" — empty first hop must not be returned as ""
            // because the rate limiter would then key a single bucket for
            // every spoof attempt that sends a leading-comma XFF.
            TrustedProxyResolver r = TrustedProxyResolver.of("10.0.0.0/8");
            assertThat(r.resolve("10.1.2.3", ", 1.2.3.4")).isEqualTo("10.1.2.3");
        }

        @Test
        void resolve_usesBareAddressAsCidr32() {
            // No /prefix → /32 single-host CIDR.
            TrustedProxyResolver r = TrustedProxyResolver.of("192.168.1.10");
            assertThat(r.resolve("192.168.1.10", "9.9.9.9")).isEqualTo("9.9.9.9");
            assertThat(r.resolve("192.168.1.11", "9.9.9.9")).isEqualTo("192.168.1.11");
        }
    }

    @Nested
    @DisplayName("CIDR matching arithmetic")
    class CidrArithmetic {

        @ParameterizedTest
        @CsvSource({
            // CIDR             , candidate     , expected (true=trusted)
            "10.0.0.0/8          , 10.255.255.255, true",
            "10.0.0.0/8          , 10.0.0.0      , true",
            "10.0.0.0/8          , 11.0.0.0      , false",
            "10.0.0.0/8          , 9.255.255.255 , false",
            "192.168.0.0/16      , 192.168.255.1 , true",
            "192.168.0.0/16      , 192.169.0.0   , false",
            "172.16.0.0/12       , 172.16.0.0    , true",
            "172.16.0.0/12       , 172.31.255.255, true",
            "172.16.0.0/12       , 172.32.0.0    , false",
            "172.16.0.0/12       , 172.15.255.255, false",
            // /31 link-local (point-to-point)
            "192.0.2.4/31        , 192.0.2.4     , true",
            "192.0.2.4/31        , 192.0.2.5     , true",
            "192.0.2.4/31        , 192.0.2.6     , false",
            // /32 single host
            "203.0.113.5/32      , 203.0.113.5   , true",
            "203.0.113.5/32      , 203.0.113.4   , false",
            // /0 matches everything
            "0.0.0.0/0           , 1.2.3.4       , true",
            "0.0.0.0/0           , 255.255.255.255, true",
        })
        void resolve_matchesIpv4Cidrs(String cidr, String candidate, boolean expected) {
            TrustedProxyResolver r = TrustedProxyResolver.of(cidr);
            String resolved = r.resolve(candidate, "9.9.9.9");
            if (expected) {
                assertThat(resolved)
                        .as("trusted %s should honour XFF", candidate)
                        .isEqualTo("9.9.9.9");
            } else {
                assertThat(resolved)
                        .as("untrusted %s should not honour XFF", candidate)
                        .isEqualTo(candidate);
            }
        }

        @Test
        void resolve_combinesMultipleCidrs() {
            TrustedProxyResolver r =
                    TrustedProxyResolver.of("10.0.0.0/8", "192.168.0.0/16", "127.0.0.1");
            assertThat(r.resolve("10.5.5.5", "1.1.1.1")).isEqualTo("1.1.1.1");
            assertThat(r.resolve("192.168.50.50", "1.1.1.1")).isEqualTo("1.1.1.1");
            assertThat(r.resolve("127.0.0.1", "1.1.1.1")).isEqualTo("1.1.1.1");
            assertThat(r.resolve("8.8.8.8", "1.1.1.1")).isEqualTo("8.8.8.8");
        }
    }

    @Nested
    @DisplayName("IPv6")
    class IPv6 {

        @Test
        void resolve_matchesIpv6Cidr() {
            TrustedProxyResolver r = TrustedProxyResolver.of("2001:db8::/32");
            assertThat(r.resolve("2001:db8::1", "203.0.113.5")).isEqualTo("203.0.113.5");
            assertThat(r.resolve("2001:db9::1", "203.0.113.5"))
                    .isEqualTo("2001:db9::1"); // outside, fall through
        }

        @Test
        void resolve_doesNotConfuseIpv4WithIpv6() {
            // Bug-class guard: a 4-byte IPv4 address must NOT match a 16-byte
            // IPv6 CIDR even if the prefix bytes happen to align after some
            // hypothetical broken normalisation. The contains() check returns
            // false when the lengths differ.
            TrustedProxyResolver r = TrustedProxyResolver.of("2001:db8::/32");
            assertThat(r.resolve("10.0.0.1", "1.1.1.1")).isEqualTo("10.0.0.1");
        }

        @Test
        void resolve_doesNotConfuseIpv6WithIpv4() {
            TrustedProxyResolver r = TrustedProxyResolver.of("10.0.0.0/8");
            assertThat(r.resolve("::1", "1.1.1.1")).isEqualTo("::1");
        }

        @Test
        void resolve_handlesIpv6BareAddress_as128Cidr() {
            TrustedProxyResolver r = TrustedProxyResolver.of("::1");
            assertThat(r.resolve("::1", "1.1.1.1")).isEqualTo("1.1.1.1");
            assertThat(r.resolve("::2", "1.1.1.1")).isEqualTo("::2");
        }
    }

    @Nested
    @DisplayName("Malformed config — must never crash, only ignore")
    class MalformedConfig {

        @ParameterizedTest
        @ValueSource(
                strings = {
                    "not-an-ip",
                    "999.999.999.999",
                    "10.0.0.0/abc",
                    "10.0.0.0/-5",
                    "10.0.0.0/64", // valid only for IPv6, invalid for v4
                    "10.0.0.0/",
                    "/8",
                    ""
                })
        void resolve_ignoresBrokenCidr_butStillResolvesGoodOnes(String broken) {
            // Broken first, good second — broken must be silently dropped,
            // good one must still match.
            TrustedProxyResolver r = TrustedProxyResolver.of(broken, "10.0.0.0/8");
            assertThat(r.resolve("10.1.1.1", "1.1.1.1")).isEqualTo("1.1.1.1");
        }

        @Test
        void resolve_treatsAllBrokenCidrs_asNoTrust() {
            TrustedProxyResolver r = TrustedProxyResolver.of("garbage", "");
            // Same as empty list — XFF never honoured.
            assertThat(r.resolve("10.0.0.1", "1.1.1.1")).isEqualTo("10.0.0.1");
        }

        @Test
        void resolve_handlesMalformedRemoteAddress_asUntrusted() {
            // If somehow the servlet container hands us a bogus remote (rare
            // in practice but possible on wonky proxy chains), we must NOT
            // crash. The resolver logs a warning and treats it as untrusted.
            TrustedProxyResolver r = TrustedProxyResolver.of("10.0.0.0/8");
            assertThat(r.resolve("not-an-ip", "1.1.1.1")).isEqualTo("not-an-ip");
        }
    }

    @Nested
    @DisplayName("Constructor null/empty handling")
    class ConstructorEdges {

        @Test
        void nullList_isEquivalentToEmptyList() {
            TrustedProxyResolver r = new TrustedProxyResolver(null);
            assertThat(r.resolve("10.0.0.1", "1.1.1.1")).isEqualTo("10.0.0.1");
        }

        @Test
        void factory_acceptsVarargs() {
            TrustedProxyResolver r = TrustedProxyResolver.of();
            assertThat(r.resolve("10.0.0.1", "1.1.1.1")).isEqualTo("10.0.0.1");
        }
    }
}
