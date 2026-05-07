package com.tankpilot.api;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class TankpilotApiApplication {

    public static void main(String[] args) {
        SpringApplication.run(TankpilotApiApplication.class, args);
    }
}
