package com.fuelyn.price.model.dto;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Tests the wire contract of {@link UnifiedStationDto}, the iter-8 Map-replacement record. The
 * frontend's union type depends on these exact JSON keys; any rename / NON_NULL slip would break
 * the client.
 */
class UnifiedStationDtoTest {

    private final ObjectMapper json = new ObjectMapper();

    @Nested
    @DisplayName("Fuel station shape")
    class FuelShape {

        @Test
        void emitsKeysFrontendExpects() throws Exception {
            UnifiedStationDto dto =
                    new UnifiedStationDto(
                            "s1",
                            "Aral 1",
                            "Aral",
                            52.5,
                            13.4,
                            0.5,
                            true,
                            "fuel",
                            "tankerkoenig",
                            new UnifiedStationDto.AddressDto("Street", "1", "10115", "Berlin"),
                            List.of("diesel", "e5", "e10"),
                            new UnifiedStationDto.PricesDto(1.799, 1.689, 1.629),
                            1.629,
                            null,
                            null,
                            null,
                            null,
                            null,
                            null,
                            null,
                            null);

            String body = json.writeValueAsString(dto);

            // Top-level keys.
            assertThat(body)
                    .contains("\"id\":\"s1\"")
                    .contains("\"name\":\"Aral 1\"")
                    .contains("\"brand\":\"Aral\"")
                    .contains("\"lat\":52.5")
                    .contains("\"lng\":13.4")
                    .contains("\"dist\":0.5")
                    .contains("\"isOpen\":true")
                    .contains("\"stationType\":\"fuel\"")
                    .contains("\"source\":\"tankerkoenig\"")
                    .contains("\"price\":1.629")
                    .contains("\"energyTypes\":[\"diesel\",\"e5\",\"e10\"]");
            // Nested address.
            assertThat(body)
                    .contains("\"address\":")
                    .contains("\"street\":\"Street\"")
                    .contains("\"houseNumber\":\"1\"")
                    .contains("\"postCode\":\"10115\"")
                    .contains("\"city\":\"Berlin\"");
            // Nested prices.
            assertThat(body)
                    .contains("\"prices\":")
                    .contains("\"diesel\":1.799")
                    .contains("\"e5\":1.689")
                    .contains("\"e10\":1.629");
        }

        @Test
        void omitsEvNullsViaJsonInclude() throws Exception {
            UnifiedStationDto dto =
                    new UnifiedStationDto(
                            "s1",
                            "Aral 1",
                            "Aral",
                            52.5,
                            13.4,
                            0.5,
                            true,
                            "fuel",
                            "tankerkoenig",
                            new UnifiedStationDto.AddressDto("S", "1", "10115", "Berlin"),
                            List.of("diesel"),
                            new UnifiedStationDto.PricesDto(1.799, null, null),
                            1.799,
                            null,
                            null,
                            null,
                            null,
                            null,
                            null,
                            null,
                            null);

            String body = json.writeValueAsString(dto);
            // EV-only fields → null → must NOT appear in JSON.
            assertThat(body)
                    .doesNotContain("operator")
                    .doesNotContain("isOperational")
                    .doesNotContain("connections")
                    .doesNotContain("chargingTypes")
                    .doesNotContain("maxPowerKW")
                    .doesNotContain("totalPoints")
                    .doesNotContain("usageCost")
                    .doesNotContain("accessType");
            // Within prices, e5/e10 are null → also omitted.
            assertThat(body).doesNotContain("\"e5\":null").doesNotContain("\"e10\":null");
        }
    }

    @Nested
    @DisplayName("EV station shape")
    class EvShape {

        @Test
        void emitsKeysFrontendExpects() throws Exception {
            UnifiedStationDto dto =
                    new UnifiedStationDto(
                            "ev-1",
                            "EnBW Charger",
                            "EnBW",
                            52.5,
                            13.4,
                            0.5,
                            true,
                            "charging",
                            "openchargemap",
                            new UnifiedStationDto.AddressDto("Street", "", "10115", "Berlin"),
                            List.of("ev_dc"),
                            null,
                            null,
                            "EnBW",
                            true,
                            List.of(
                                    new UnifiedStationDto.ConnectionDto(
                                            "CCS", "CCS Combo", 150.0, 2, "hpc")),
                            List.of("hpc"),
                            150.0,
                            2,
                            "Free",
                            "Public");

            String body = json.writeValueAsString(dto);

            assertThat(body)
                    .contains("\"id\":\"ev-1\"")
                    .contains("\"stationType\":\"charging\"")
                    .contains("\"source\":\"openchargemap\"")
                    .contains("\"operator\":\"EnBW\"")
                    .contains("\"isOperational\":true")
                    .contains("\"chargingTypes\":[\"hpc\"]")
                    .contains("\"maxPowerKW\":150.0")
                    .contains("\"totalPoints\":2")
                    .contains("\"usageCost\":\"Free\"")
                    .contains("\"accessType\":\"Public\"");
            // Connections array
            assertThat(body)
                    .contains("\"connections\":")
                    .contains("\"connectorType\":\"CCS\"")
                    .contains("\"connectorLabel\":\"CCS Combo\"")
                    .contains("\"powerKW\":150.0")
                    .contains("\"quantity\":2")
                    .contains("\"chargingSpeed\":\"hpc\"");
        }

        @Test
        void omitsFuelNullsViaJsonInclude() throws Exception {
            UnifiedStationDto dto =
                    new UnifiedStationDto(
                            "ev-1",
                            "EnBW Charger",
                            "EnBW",
                            52.5,
                            13.4,
                            0.5,
                            true,
                            "charging",
                            "openchargemap",
                            new UnifiedStationDto.AddressDto("Street", "", "10115", "Berlin"),
                            List.of("ev_dc"),
                            null,
                            null,
                            "EnBW",
                            true,
                            List.of(),
                            List.of("dc"),
                            150.0,
                            2,
                            "Free",
                            "Public");

            String body = json.writeValueAsString(dto);
            assertThat(body).doesNotContain("\"prices\":").doesNotContain("\"price\":null");
        }
    }

    @Nested
    @DisplayName("Round-trip")
    class RoundTrip {

        @Test
        void serializeThenDeserialize_preservesFields() throws Exception {
            UnifiedStationDto original =
                    new UnifiedStationDto(
                            "s1",
                            "Aral 1",
                            "Aral",
                            52.5,
                            13.4,
                            0.5,
                            true,
                            "fuel",
                            "tankerkoenig",
                            new UnifiedStationDto.AddressDto("Street", "1", "10115", "Berlin"),
                            List.of("diesel"),
                            new UnifiedStationDto.PricesDto(1.799, null, null),
                            1.799,
                            null,
                            null,
                            null,
                            null,
                            null,
                            null,
                            null,
                            null);

            String body = json.writeValueAsString(original);
            UnifiedStationDto round = json.readValue(body, UnifiedStationDto.class);

            assertThat(round.id()).isEqualTo("s1");
            assertThat(round.stationType()).isEqualTo("fuel");
            assertThat(round.address().postCode()).isEqualTo("10115");
            assertThat(round.prices().diesel()).isEqualTo(1.799);
            assertThat(round.energyTypes()).containsExactly("diesel");
        }
    }
}
