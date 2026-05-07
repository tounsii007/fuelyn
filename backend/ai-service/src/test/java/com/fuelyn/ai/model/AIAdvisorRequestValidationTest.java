package com.fuelyn.ai.model;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

class AIAdvisorRequestValidationTest {

    private static ValidatorFactory factory;
    private static Validator validator;

    @BeforeAll
    static void setUp() {
        factory = Validation.buildDefaultValidatorFactory();
        validator = factory.getValidator();
    }

    @AfterAll
    static void tearDown() {
        factory.close();
    }

    private static AIAdvisorRequest.StationPrice sample() {
        return new AIAdvisorRequest.StationPrice("Aral", "Aral", 1.739, 1.0);
    }

    @Test
    void valid_requestHasNoViolations() {
        AIAdvisorRequest req = new AIAdvisorRequest(
                List.of(sample()), "e10", null, 52.5, 13.4, 50
        );

        Set<ConstraintViolation<AIAdvisorRequest>> violations = validator.validate(req);

        assertThat(violations).isEmpty();
    }

    @Test
    void invalid_fuelTypeRejected() {
        AIAdvisorRequest req = new AIAdvisorRequest(
                List.of(sample()), "premium", null, 52.5, 13.4, 50
        );

        Set<ConstraintViolation<AIAdvisorRequest>> violations = validator.validate(req);

        assertThat(violations).anyMatch(v -> v.getPropertyPath().toString().equals("fuelType"));
    }

    @Test
    void invalid_emptyPricesRejected() {
        AIAdvisorRequest req = new AIAdvisorRequest(
                List.of(), "e10", null, 52.5, 13.4, 50
        );

        Set<ConstraintViolation<AIAdvisorRequest>> violations = validator.validate(req);

        assertThat(violations).anyMatch(v -> v.getPropertyPath().toString().equals("prices"));
    }

    @Test
    void invalid_latOutOfRangeRejected() {
        AIAdvisorRequest req = new AIAdvisorRequest(
                List.of(sample()), "e10", null, 120.0, 13.4, 50
        );

        Set<ConstraintViolation<AIAdvisorRequest>> violations = validator.validate(req);

        assertThat(violations).anyMatch(v -> v.getPropertyPath().toString().equals("lat"));
    }

    @Test
    void invalid_negativePriceRejected() {
        var bad = new AIAdvisorRequest.StationPrice("X", "X", -1.0, 1.0);
        AIAdvisorRequest req = new AIAdvisorRequest(
                List.of(bad), "e10", null, 52.5, 13.4, 50
        );

        Set<ConstraintViolation<AIAdvisorRequest>> violations = validator.validate(req);

        assertThat(violations)
                .anyMatch(v -> v.getPropertyPath().toString().contains("prices[0].price"));
    }
}
