package com.fuelyn.ai.service;

import com.fuelyn.ai.model.AIAdvisorRequest;
import com.fuelyn.ai.model.AIAdvisorRequest.StationPrice;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Tests {@link AdvisorService#buildCacheKey} — the cache-key fix from
 * iter 25. The previous key was {@code fuelType:lat:lng:count} which
 * collided across users in the same geo-bucket and across refreshes
 * with the same station-count but different prices. The new key folds
 * in a SHA-256 digest of the sorted station list.
 *
 * <p>Behavioural guarantees verified here:</p>
 * <ul>
 *   <li>Identical requests → identical key (caching works at all)</li>
 *   <li>Different stations / prices / distances → different keys
 *       (collision-resistance — the headline fix)</li>
 *   <li>Reordering the upstream's station list does NOT change the key
 *       (Tankerkönig sometimes returns the same set in shuffled order)</li>
 *   <li>Bucket-level lat/lng → same key inside the bucket, different
 *       across buckets (privacy / aggregation contract)</li>
 *   <li>Null fields don't NPE</li>
 * </ul>
 */
class AdvisorCacheKeyTest {

    private static StationPrice sp(String name, double price) {
        return new StationPrice(name, "brand", price, 0.5);
    }

    private static AIAdvisorRequest request(double lat, double lng, List<StationPrice> stations) {
        return new AIAdvisorRequest(stations, "e10", null, lat, lng, 50, null, null);
    }

    @Nested
    @DisplayName("Determinism — same inputs → same key")
    class Deterministic {

        @Test
        void sameRequest_yieldsSameKey() {
            List<StationPrice> stations = List.of(sp("Aral 1", 1.799), sp("Shell A", 1.819));
            String k1 = AdvisorService.buildCacheKey(request(52.50, 13.40, stations));
            String k2 = AdvisorService.buildCacheKey(request(52.50, 13.40, stations));
            assertThat(k1).isEqualTo(k2);
        }

        @Test
        void shuffledStationOrder_yieldsSameKey() {
            // Tankerkönig's response order is undefined; the cache key
            // MUST canonicalise (sorted) before hashing.
            List<StationPrice> a = List.of(sp("Aral 1", 1.799), sp("Shell A", 1.819), sp("Esso B", 1.789));
            List<StationPrice> b = List.of(sp("Esso B", 1.789), sp("Aral 1", 1.799), sp("Shell A", 1.819));

            String ka = AdvisorService.buildCacheKey(request(52.5, 13.4, a));
            String kb = AdvisorService.buildCacheKey(request(52.5, 13.4, b));
            assertThat(ka).isEqualTo(kb);
        }

        @Test
        void priceWithinRoundingNoise_yieldsSameKey() {
            // Prices are rounded to 0.001 in the digest. 1.799 and 1.7994
            // both round to 1799 (×1000 + Math.round) → same digest.
            // 1.7995 rounds up to 1800 → different digest.
            List<StationPrice> a = List.of(sp("Aral 1", 1.799));
            List<StationPrice> b = List.of(sp("Aral 1", 1.7994));
            String ka = AdvisorService.buildCacheKey(request(52.5, 13.4, a));
            String kb = AdvisorService.buildCacheKey(request(52.5, 13.4, b));
            assertThat(ka).isEqualTo(kb);
        }
    }

    @Nested
    @DisplayName("Collision resistance — different stations → different keys")
    class CollisionResistance {

        @Test
        void differentStationCount_givesDifferentKey() {
            String k1 = AdvisorService.buildCacheKey(request(52.5, 13.4,
                    List.of(sp("A", 1.799))));
            String k2 = AdvisorService.buildCacheKey(request(52.5, 13.4,
                    List.of(sp("A", 1.799), sp("B", 1.819))));
            assertThat(k1).isNotEqualTo(k2);
        }

        @Test
        void sameCountDifferentNames_givesDifferentKey() {
            // The headline collision the old key produced.
            String k1 = AdvisorService.buildCacheKey(request(52.5, 13.4,
                    List.of(sp("Aral 1", 1.799), sp("Shell A", 1.819))));
            String k2 = AdvisorService.buildCacheKey(request(52.5, 13.4,
                    List.of(sp("Esso X", 1.799), sp("Total Y", 1.819))));
            assertThat(k1).isNotEqualTo(k2);
        }

        @Test
        void onePriceMoved_givesDifferentKey() {
            // Same station, same name, only one price differs.
            String k1 = AdvisorService.buildCacheKey(request(52.5, 13.4,
                    List.of(sp("Aral 1", 1.799), sp("Shell A", 1.819))));
            String k2 = AdvisorService.buildCacheKey(request(52.5, 13.4,
                    List.of(sp("Aral 1", 1.799), sp("Shell A", 1.829))));
            assertThat(k1).isNotEqualTo(k2);
        }

        @Test
        void distanceChanged_givesDifferentKey() {
            String k1 = AdvisorService.buildCacheKey(request(52.5, 13.4,
                    List.of(new StationPrice("Aral 1", "brand", 1.799, 0.5))));
            String k2 = AdvisorService.buildCacheKey(request(52.5, 13.4,
                    List.of(new StationPrice("Aral 1", "brand", 1.799, 1.2))));
            assertThat(k1).isNotEqualTo(k2);
        }

        @Test
        void differentFuelType_givesDifferentKey() {
            List<StationPrice> stations = List.of(sp("Aral 1", 1.799));
            AIAdvisorRequest e10 = new AIAdvisorRequest(stations, "e10", null, 52.5, 13.4, 50, null, null);
            AIAdvisorRequest diesel = new AIAdvisorRequest(stations, "diesel", null, 52.5, 13.4, 50, null, null);
            assertThat(AdvisorService.buildCacheKey(e10))
                    .isNotEqualTo(AdvisorService.buildCacheKey(diesel));
        }
    }

    @Nested
    @DisplayName("Geo-bucketing")
    class GeoBucket {

        @Test
        void coordsInSameHundredthOfDegree_yieldSameKey() {
            // 0.01° resolution. Two coordinates 0.005° apart should
            // bucket to the same key.
            List<StationPrice> stations = List.of(sp("Aral 1", 1.799));
            String k1 = AdvisorService.buildCacheKey(request(52.500, 13.400, stations));
            String k2 = AdvisorService.buildCacheKey(request(52.501, 13.401, stations));
            assertThat(k1).isEqualTo(k2);
        }

        @Test
        void coordsInDifferentBuckets_yieldDifferentKey() {
            List<StationPrice> stations = List.of(sp("Aral 1", 1.799));
            String k1 = AdvisorService.buildCacheKey(request(52.500, 13.400, stations));
            String k2 = AdvisorService.buildCacheKey(request(52.520, 13.400, stations));
            assertThat(k1).isNotEqualTo(k2);
        }

        @Test
        void nullCoords_yieldDeterministicKey() {
            List<StationPrice> stations = List.of(sp("Aral 1", 1.799));
            AIAdvisorRequest req = new AIAdvisorRequest(stations, "e10", null, null, null, 50, null, null);
            // Must not NPE.
            String key = AdvisorService.buildCacheKey(req);
            assertThat(key).isNotBlank();
            // Two requests both with null coords still produce the same key.
            assertThat(key).isEqualTo(AdvisorService.buildCacheKey(req));
        }
    }

    @Nested
    @DisplayName("Empty / edge inputs")
    class EdgeInputs {

        @Test
        void emptyStationList_yieldsKeyContainingZero() {
            // Bean-validation @NotEmpty would reject this in production,
            // but buildCacheKey itself must still answer something
            // sensible if it's ever fed an empty list (e.g. reflection
            // tests, future relaxation of the contract).
            List<StationPrice> stations = Collections.emptyList();
            String key = AdvisorService.buildCacheKey(request(52.5, 13.4, stations));
            assertThat(key).contains(":0");
        }

        @ParameterizedTest
        @ValueSource(ints = {1, 5, 25, 50})
        void variousStationCounts_yieldDistinctKeys(int n) {
            List<StationPrice> stations = new ArrayList<>();
            for (int i = 0; i < n; i++) stations.add(sp("Station " + i, 1.7 + i * 0.001));
            String key = AdvisorService.buildCacheKey(request(52.5, 13.4, stations));
            // Key contains the count for fast visual debugging.
            assertThat(key).contains("_");
            // Different N → different key.
            if (n > 1) {
                List<StationPrice> smaller = stations.subList(0, n - 1);
                String smallerKey = AdvisorService.buildCacheKey(request(52.5, 13.4, smaller));
                assertThat(key).isNotEqualTo(smallerKey);
            }
        }
    }

    @Nested
    @DisplayName("Birthday-paradox sanity check")
    class CollisionProbability {

        @Test
        void thousandRandomRequests_yieldThousandDistinctKeys() {
            // The 48-bit prefix (12 hex chars) gives ~280 trillion
            // buckets. Across 1000 distinct random requests we should
            // see zero collisions with overwhelming probability.
            java.util.Set<String> keys = new java.util.HashSet<>();
            java.util.Random rng = new java.util.Random(42);  // deterministic
            for (int i = 0; i < 1000; i++) {
                int n = 1 + rng.nextInt(10);
                List<StationPrice> stations = new ArrayList<>();
                for (int j = 0; j < n; j++) {
                    stations.add(sp("station-" + i + "-" + j, 1.5 + rng.nextDouble() * 0.5));
                }
                double lat = 47.0 + rng.nextDouble() * 8.0;
                double lng = 5.5 + rng.nextDouble() * 10.0;
                keys.add(AdvisorService.buildCacheKey(request(lat, lng, stations)));
            }
            assertThat(keys).hasSize(1000);
        }
    }
}
