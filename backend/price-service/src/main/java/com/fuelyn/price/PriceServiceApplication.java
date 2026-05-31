package com.fuelyn.price;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Entry point for the Fuelyn Price Service.
 *
 * <p>This microservice is responsible for:
 *
 * <ul>
 *   <li>Collecting real-time fuel prices from the Tankerkoenig API
 *   <li>Storing price snapshots in an H2/PostgreSQL database
 *   <li>Providing price history, statistics, and day-of-week patterns
 * </ul>
 *
 * <p>Runs on port 8081 (configurable via {@code server.port}).
 */
@SpringBootApplication(scanBasePackages = {"com.fuelyn.price", "com.fuelyn.common"})
@EnableScheduling
@EnableCaching
public class PriceServiceApplication {

    /**
     * Launches the Price Service Spring Boot application.
     *
     * @param args command-line arguments
     */
    public static void main(String[] args) {
        SpringApplication.run(PriceServiceApplication.class, args);
    }
}
