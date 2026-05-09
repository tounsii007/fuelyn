package com.fuelyn.common.geo;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Tests for {@link GermanyBounds} — the iter-27 centralisation. Three
 * independent inline copies of these constants used to live in
 * TankerkoenigClient, PriceCollectorService.resolveCities, and the
 * controller @Min/@Max annotations. The risk this test guards against
 * is one of those copies drifting; the constants are documented as the
 * single source of truth.
 */
class GermanyBoundsTest {

    @Nested
    @DisplayName("Constants pinned at known borders")
    class Constants {

        @Test
        void minLat_isOberstdorfArea() {
            assertThat(GermanyBounds.MIN_LAT).isEqualTo(47.0);
        }

        @Test
        void maxLat_isSyltArea() {
            assertThat(GermanyBounds.MAX_LAT).isEqualTo(55.0);
        }

        @Test
        void minLng_isAachenArea() {
            assertThat(GermanyBounds.MIN_LNG).isEqualTo(5.5);
        }

        @Test
        void maxLng_isGoerlitzArea() {
            assertThat(GermanyBounds.MAX_LNG).isEqualTo(15.5);
        }
    }

    @Nested
    @DisplayName("contains() — inclusive bounds, real-world cities")
    class Contains {

        @ParameterizedTest
        @CsvSource({
                // City                , lat   , lng   , inside
                "Berlin                 , 52.5200, 13.4050, true",
                "Hamburg                , 53.5511, 9.9937 , true",
                "Muenchen               , 48.1351, 11.5820, true",
                "Aachen-near-border     , 50.78  , 6.08   , true",
                "Goerlitz-near-border   , 51.15  , 14.99  , true",
                "Sylt-northtip          , 55.0   , 8.4    , true",   // exact boundary
                "Oberstdorf-southtip    , 47.0   , 10.3   , true",   // exact boundary
                // Just outside
                "Innsbruck-AT           , 47.27  , 11.39  , true",   // wider lat-clamp picks Innsbruck up; documented slack
                "Salzburg-AT            , 47.81  , 13.05  , true",   // same; tolerance for border stations
                "Kopenhagen-DK          , 55.68  , 12.57  , false",  // beyond MAX_LAT
                "Gibraltar              , 36.14  , -5.35  , false",  // way out, negative lng
                "Liechtenstein          , 47.14  , 9.55   , true",   // by design — within slack
                "Paris                  , 48.85  , 2.35   , false",  // west of MIN_LNG
                "Warschau               , 52.23  , 21.01  , false",  // east of MAX_LNG
        })
        void cityCoordinates_classifyCorrectly(String city, double lat, double lng, boolean inside) {
            assertThat(GermanyBounds.contains(lat, lng))
                    .as("%s (%s, %s)", city, lat, lng)
                    .isEqualTo(inside);
        }

        @Test
        void exactlyOnSouthernEdge_isIncluded() {
            assertThat(GermanyBounds.contains(GermanyBounds.MIN_LAT, 10.0)).isTrue();
        }

        @Test
        void exactlyOnNorthernEdge_isIncluded() {
            assertThat(GermanyBounds.contains(GermanyBounds.MAX_LAT, 10.0)).isTrue();
        }

        @Test
        void justOutsideEachEdge_isExcluded() {
            // The contains() contract is closed-interval inclusive on every
            // edge. One ulp outside should reject.
            double oneTick = 0.0001;
            assertThat(GermanyBounds.contains(GermanyBounds.MIN_LAT - oneTick, 10.0)).isFalse();
            assertThat(GermanyBounds.contains(GermanyBounds.MAX_LAT + oneTick, 10.0)).isFalse();
            assertThat(GermanyBounds.contains(50.0, GermanyBounds.MIN_LNG - oneTick)).isFalse();
            assertThat(GermanyBounds.contains(50.0, GermanyBounds.MAX_LNG + oneTick)).isFalse();
        }
    }

    @Nested
    @DisplayName("Defensive — extreme inputs don't break")
    class ExtremeInputs {

        @Test
        void positiveInfinity_returnsFalse() {
            assertThat(GermanyBounds.contains(Double.POSITIVE_INFINITY, 10.0)).isFalse();
            assertThat(GermanyBounds.contains(50.0, Double.POSITIVE_INFINITY)).isFalse();
        }

        @Test
        void nan_returnsFalse() {
            // NaN comparison always false → contains() returns false.
            assertThat(GermanyBounds.contains(Double.NaN, 10.0)).isFalse();
            assertThat(GermanyBounds.contains(50.0, Double.NaN)).isFalse();
        }

        @Test
        void zeroZero_returnsFalse() {
            // Null Island — outside Germany.
            assertThat(GermanyBounds.contains(0.0, 0.0)).isFalse();
        }
    }
}
