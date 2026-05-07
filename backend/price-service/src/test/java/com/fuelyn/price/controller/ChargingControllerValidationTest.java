package com.fuelyn.price.controller;

import com.fuelyn.common.exception.GlobalExceptionHandler;
import com.fuelyn.price.service.OpenChargeMapClient;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.validation.beanvalidation.MethodValidationPostProcessor;

import java.util.List;

import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Verifies bean-validation annotations on {@link ChargingController}
 * produce HTTP 400 for out-of-range coordinates.
 *
 * <p>Uses a standalone MockMvc setup (no ApplicationContext), which
 * sidesteps Mockito's byte-buddy inline-mock-maker issues with newer
 * JDKs and keeps this test tiny and fast.</p>
 */
@ExtendWith(MockitoExtension.class)
class ChargingControllerValidationTest {

    @Mock
    private OpenChargeMapClient chargeMapClient;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        // MethodValidationPostProcessor enables @Validated on method parameters
        // in a plain (non-Spring) standalone MockMvc setup.
        MethodValidationPostProcessor mvpp = new MethodValidationPostProcessor();
        mvpp.afterPropertiesSet();

        ChargingController controller = new ChargingController(chargeMapClient);
        Object proxied = mvpp.postProcessAfterInitialization(controller, "chargingController");

        this.mockMvc = MockMvcBuilders.standaloneSetup(proxied)
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    void validRequest_returns200() throws Exception {
        when(chargeMapClient.searchChargingStations(anyDouble(), anyDouble(), anyDouble()))
                .thenReturn(List.of());

        mockMvc.perform(get("/api/v1/prices/charging")
                        .param("lat", "52.52")
                        .param("lng", "13.40")
                        .param("rad", "10"))
                .andExpect(status().isOk());
    }

    @Test
    void latOutOfRange_returns400() throws Exception {
        mockMvc.perform(get("/api/v1/prices/charging")
                        .param("lat", "120")
                        .param("lng", "13.40")
                        .param("rad", "10"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.success").value(false));
    }

    @Test
    void radiusOutOfRange_returns400() throws Exception {
        mockMvc.perform(get("/api/v1/prices/charging")
                        .param("lat", "52.52")
                        .param("lng", "13.40")
                        .param("rad", "500"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void missingLat_returns400() throws Exception {
        mockMvc.perform(get("/api/v1/prices/charging")
                        .param("lng", "13.40"))
                .andExpect(status().isBadRequest());
    }
}
