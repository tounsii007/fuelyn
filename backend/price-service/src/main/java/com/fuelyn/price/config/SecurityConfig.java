package com.fuelyn.price.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.intercept.AuthorizationFilter;

import com.fuelyn.common.config.SecurityProperties;
import com.fuelyn.common.security.ServiceAuthFilter;

/**
 * Security configuration for the Price Service.
 *
 * <p>Stateless, CSRF disabled (API-only). The H2 console is only routed through the security chain
 * when {@code spring.h2.console.enabled=true} — the same flag that Spring Boot itself uses to
 * register the console servlet. With the flag off (the production default) the path is no longer
 * treated as public, so even an accidental console servlet would fall through to {@code denyAll()}
 * instead of being silently exposed.
 *
 * <p>Every {@code /api/v1/**} request must carry a valid gateway HMAC signature: {@link
 * ServiceAuthFilter} runs ahead of the authorization check and rejects unsigned callers with 401.
 * This is defense-in-depth on top of Docker network isolation — the service ports are never
 * published to the host, but the filter ensures that anything reaching {@code /api/v1} actually
 * came through the gateway.
 */
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    public SecurityFilterChain filterChain(
            HttpSecurity http,
            SecurityProperties securityProperties,
            @Value("${spring.h2.console.enabled:false}") boolean h2ConsoleEnabled)
            throws Exception {
        // Constructed locally (not as a @Bean) so Spring Boot does not also
        // auto-register it as a plain servlet filter — that would run it
        // twice and on the management port. It belongs only in this chain.
        ServiceAuthFilter serviceAuthFilter =
                new ServiceAuthFilter(securityProperties.getHmacSecret());

        http.csrf(csrf -> csrf.disable())
                .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .headers(h -> h.frameOptions(fo -> fo.sameOrigin()))
                .addFilterBefore(serviceAuthFilter, AuthorizationFilter.class)
                .authorizeHttpRequests(
                        auth -> {
                            auth.requestMatchers("/actuator/**").permitAll();
                            auth.requestMatchers("/api/v1/**").permitAll();
                            if (h2ConsoleEnabled) {
                                auth.requestMatchers("/h2-console/**").permitAll();
                            }
                            auth.anyRequest().denyAll();
                        });
        return http.build();
    }
}
