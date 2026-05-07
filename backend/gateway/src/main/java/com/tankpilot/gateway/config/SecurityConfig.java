package com.tankpilot.gateway.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.annotation.web.reactive.EnableWebFluxSecurity;
import org.springframework.security.config.web.server.ServerHttpSecurity;
import org.springframework.security.web.server.SecurityWebFilterChain;
import org.springframework.security.web.server.ServerAuthenticationEntryPoint;
import reactor.core.publisher.Mono;

/**
 * Reactive security configuration for the Gateway.
 *
 * <p>Disables CSRF (stateless API), permits API + actuator paths,
 * denies the rest. The custom {@link ServerAuthenticationEntryPoint}
 * is the important bit: when an unauthenticated request hits a
 * denied path we return a plain 401 with NO {@code WWW-Authenticate}
 * header, so browsers don't pop a Basic-Auth credentials dialog
 * (the API is meant to be consumed by the BFF with an X-API-Key
 * header, not browsed).</p>
 */
@Configuration
@EnableWebFluxSecurity
public class SecurityConfig {

    @Bean
    public SecurityWebFilterChain securityWebFilterChain(ServerHttpSecurity http) {
        return http
                .csrf(ServerHttpSecurity.CsrfSpec::disable)
                .httpBasic(ServerHttpSecurity.HttpBasicSpec::disable)
                .formLogin(ServerHttpSecurity.FormLoginSpec::disable)
                .logout(ServerHttpSecurity.LogoutSpec::disable)
                .exceptionHandling(spec -> spec.authenticationEntryPoint(silentJsonEntryPoint()))
                .authorizeExchange(exchanges -> exchanges
                        .pathMatchers("/actuator/health/**", "/actuator/info").permitAll()
                        .pathMatchers("/api/**").permitAll()
                        .pathMatchers("/fallback/**").permitAll()
                        .pathMatchers("/").permitAll()      // friendly root JSON
                        .anyExchange().denyAll()
                )
                .build();
    }

    /**
     * Replace Spring's default Basic-Auth challenge with a plain
     * JSON 401 — no `WWW-Authenticate` header, so browsers stay
     * quiet and the BFF gets a parseable error body.
     */
    private static ServerAuthenticationEntryPoint silentJsonEntryPoint() {
        return (exchange, ex) -> {
            var response = exchange.getResponse();
            response.setStatusCode(HttpStatus.UNAUTHORIZED);
            response.getHeaders().setContentType(org.springframework.http.MediaType.APPLICATION_JSON);
            // Important: do NOT add WWW-Authenticate. Browsers only
            // pop a credentials dialog when that header is present
            // with a Basic / Digest scheme.
            byte[] body = ("{\"error\":\"unauthorized\",\"message\":\"This endpoint requires an X-API-Key header.\"}")
                    .getBytes();
            var buffer = response.bufferFactory().wrap(body);
            return response.writeWith(Mono.just(buffer));
        };
    }
}
