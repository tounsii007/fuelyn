package com.fuelyn.ai;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cache.annotation.EnableCaching;

/**
 * Fuelyn AI Service &mdash; GPT-4o-mini powered fuel recommendations.
 *
 * <p>Provides intelligent refueling advice with automatic fallback
 * to local heuristics when the OpenAI API is unavailable.</p>
 */
@SpringBootApplication(scanBasePackages = {"com.fuelyn.ai", "com.fuelyn.common"})
@EnableCaching
public class AIServiceApplication {

    public static void main(String[] args) {
        SpringApplication.run(AIServiceApplication.class, args);
    }
}
