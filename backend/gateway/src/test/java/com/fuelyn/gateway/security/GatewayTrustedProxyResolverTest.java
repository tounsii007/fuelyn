package com.fuelyn.gateway.security;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Mirror of {@code TrustedProxyResolverTest} for the gateway-local
 * sibling. Runs an identical battery of tests so the two implementations
 * stay byte-for-byte equivalent on every release — drift between the
 * common-stack and the webflux-stack version of the resolver would be a
 * silent security gap.
 */
class GatewayTrustedProxyResolverTest {

    @Nested
    @DisplayName("Empty / no trusted proxies — XFF must NEVER be honoured")
    class NoTrustedSet {

        @Test
        void xffMissing_returnsRemoteAddr() {
            GatewayTrustedProxyResolver r = new GatewayTrustedProxyResolver(List.of());
            assertThat(r.resolve("203.0.113.5", null)).isEqualTo("203.0.113.5");
        }

        @Test
        void xffPresent_butNoTrust_returnsRemoteAddr() {
            GatewayTrustedProxyResolver r = new GatewayTrustedProxyResolver(List.of());
            assertThat(r.resolve("203.0.113.5", "1.2.3.4")).isEqualTo("203.0.113.5");
        }

        @Test
        void blankRemoteAddr_returnsUnknown() {
            GatewayTrustedProxyResolver r = new GatewayTrustedProxyResolver(List.of());
            assertThat(r.resolve("", "1.2.3.4")).isEqualTo("unknown");
            assertThat(r.resolve(null, "1.2.3.4")).isEqualTo("unknown");
        }
    }

    @Nested
    @DisplayName("CIDR matching — same arithmetic as common.TrustedProxyResolver")
    class CidrArithmetic {

        @ParameterizedTest
        @CsvSource({
                "10.0.0.0/8     , 10.255.255.255 , true",
                "10.0.0.0/8     , 11.0.0.0       , false",
                "192.168.0.0/16 , 192.168.255.1  , true",
                "192.168.0.0/16 , 192.169.0.0    , false",
                "172.16.0.0/12  , 172.31.255.255 , true",
                "172.16.0.0/12  , 172.32.0.0     , false",
                "203.0.113.5/32 , 203.0.113.5    , true",
                "203.0.113.5/32 , 203.0.113.4    , false",
                "0.0.0.0/0      , 1.2.3.4        , true",
        })
        void resolve_matchesIpv4Cidrs(String cidr, String candidate, boolean expected) {
            GatewayTrustedProxyResolver r = new GatewayTrustedProxyResolver(List.of(cidr));
            String resolved = r.resolve(candidate, "9.9.9.9");
            if (expected) {
                assertThat(resolved).isEqualTo("9.9.9.9");
            } else {
                assertThat(resolved).isEqualTo(candidate);
            }
        }

        @Test
        void multipleCidrs_combine() {
            GatewayTrustedProxyResolver r = new GatewayTrustedProxyResolver(
                    List.of("10.0.0.0/8", "192.168.0.0/16", "127.0.0.1"));
            assertThat(r.resolve("10.5.5.5", "1.1.1.1")).isEqualTo("1.1.1.1");
            assertThat(r.resolve("192.168.50.50", "1.1.1.1")).isEqualTo("1.1.1.1");
            assertThat(r.resolve("127.0.0.1", "1.1.1.1")).isEqualTo("1.1.1.1");
            assertThat(r.resolve("8.8.8.8", "1.1.1.1")).isEqualTo("8.8.8.8");
        }
    }

    @Nested
    @DisplayName("Multi-hop XFF chains")
    class XffChain {

        @Test
        void firstHopOfMultiHopChain_isReturned() {
            GatewayTrustedProxyResolver r = new GatewayTrustedProxyResolver(List.of("10.0.0.0/8"));
            assertThat(r.resolve("10.1.2.3", "203.0.113.5, 198.51.100.7, 192.0.2.1"))
                    .isEqualTo("203.0.113.5");
        }

        @Test
        void leadingCommaXff_doesNotProduceEmptyString() {
            // Spoof attempt: empty first hop. Must fall back to remoteAddr,
            // not return "" which would key the rate-limit cache to a
            // single bucket for every attacker using this trick.
            GatewayTrustedProxyResolver r = new GatewayTrustedProxyResolver(List.of("10.0.0.0/8"));
            assertThat(r.resolve("10.1.2.3", ", 1.2.3.4")).isEqualTo("10.1.2.3");
        }
    }

    @Nested
    @DisplayName("Malformed CIDR / address — no crash, gracefully ignore")
    class Malformed {

        @Test
        void brokenCidrInList_butGoodOnesStillMatch() {
            GatewayTrustedProxyResolver r = new GatewayTrustedProxyResolver(
                    List.of("not-an-ip", "10.0.0.0/abc", "10.0.0.0/8"));
            assertThat(r.resolve("10.1.2.3", "9.9.9.9")).isEqualTo("9.9.9.9");
        }

        @Test
        void allCidrsBroken_treatsAsEmptyTrustList() {
            GatewayTrustedProxyResolver r = new GatewayTrustedProxyResolver(
                    List.of("garbage", ""));
            assertThat(r.resolve("10.0.0.1", "1.1.1.1")).isEqualTo("10.0.0.1");
        }

        @Test
        void malformedRemoteAddr_treatedAsUntrusted() {
            GatewayTrustedProxyResolver r = new GatewayTrustedProxyResolver(List.of("10.0.0.0/8"));
            assertThat(r.resolve("not-an-ip", "1.1.1.1")).isEqualTo("not-an-ip");
        }
    }

    @Nested
    @DisplayName("IPv6")
    class IPv6 {

        @Test
        void ipv6Cidr_matchesPrefix() {
            GatewayTrustedProxyResolver r = new GatewayTrustedProxyResolver(List.of("2001:db8::/32"));
            assertThat(r.resolve("2001:db8::1", "203.0.113.5")).isEqualTo("203.0.113.5");
            assertThat(r.resolve("2001:db9::1", "203.0.113.5")).isEqualTo("2001:db9::1");
        }

        @Test
        void ipv4Address_doesNotMatchIpv6Cidr() {
            GatewayTrustedProxyResolver r = new GatewayTrustedProxyResolver(List.of("2001:db8::/32"));
            assertThat(r.resolve("10.0.0.1", "1.1.1.1")).isEqualTo("10.0.0.1");
        }

        @Test
        void ipv6Address_doesNotMatchIpv4Cidr() {
            GatewayTrustedProxyResolver r = new GatewayTrustedProxyResolver(List.of("10.0.0.0/8"));
            assertThat(r.resolve("::1", "1.1.1.1")).isEqualTo("::1");
        }
    }

    /**
     * Cross-implementation regression: any change to one resolver MUST be
     * mirrored to the other. This test compares behaviour directly so a
     * developer who edits only one side of the pair gets caught.
     */
    @Nested
    @DisplayName("Cross-implementation parity vs common.TrustedProxyResolver")
    class Parity {

        @Test
        void identicalAnswers_acrossImplementations_forKeyCases() {
            String[] cidrs = {"10.0.0.0/8", "192.168.0.0/16", "2001:db8::/32"};

            // Build both resolvers with identical config.
            GatewayTrustedProxyResolver gw = new GatewayTrustedProxyResolver(List.of(cidrs));
            com.fuelyn.common.security.TrustedProxyResolver common =
                    new com.fuelyn.common.security.TrustedProxyResolver(List.of(cidrs));

            String[][] cases = {
                    {"10.5.5.5",     "1.1.1.1"},
                    {"192.168.0.1",  "1.1.1.1"},
                    {"2001:db8::1",  "1.1.1.1"},
                    {"8.8.8.8",      "1.1.1.1"},
                    {"not-an-ip",    "1.1.1.1"},
                    {null,           "1.1.1.1"},
                    {"10.5.5.5",     null},
                    {"10.5.5.5",     ", 1.2.3.4"},
                    {"10.5.5.5",     "  9.9.9.9 , 1.2.3.4"},
            };
            for (String[] c : cases) {
                String gwAns = gw.resolve(c[0], c[1]);
                String coAns = common.resolve(c[0], c[1]);
                assertThat(gwAns)
                        .as("parity for remote=%s xff=%s", c[0], c[1])
                        .isEqualTo(coAns);
            }
        }
    }
}
