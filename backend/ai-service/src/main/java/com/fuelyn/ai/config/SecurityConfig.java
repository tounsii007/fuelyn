package com.fuelyn.ai.config;

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
 * Security configuration for the AI Service. Stateless, CSRF disabled.
 *
 * <p>Every {@code /api/v1/**} request must carry a valid gateway HMAC signature: {@link
 * ServiceAuthFilter} runs ahead of the authorization check and rejects unsigned callers with 401 —
 * defense in depth on top of the service port never being published to the host.
 */
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http, SecurityProperties securityProperties)
            throws Exception {
        // Constructed locally (not as a @Bean) so Spring Boot does not also
        // auto-register it as a plain servlet filter — that would run it
        // twice and on the management port. It belongs only in this chain.
        ServiceAuthFilter serviceAuthFilter =
                new ServiceAuthFilter(securityProperties.getHmacSecret());

        http.csrf(csrf -> csrf.disable())
                .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .addFilterBefore(serviceAuthFilter, AuthorizationFilter.class)
                .authorizeHttpRequests(
                        auth ->
                                auth.requestMatchers("/actuator/**")
                                        .permitAll()
                                        .requestMatchers("/api/v1/**")
                                        .permitAll()
                                        .anyRequest()
                                        .denyAll());
        return http.build();
    }
}
