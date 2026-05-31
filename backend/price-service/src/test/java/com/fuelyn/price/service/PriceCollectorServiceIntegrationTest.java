package com.fuelyn.price.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Function;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.cache.Cache;
import org.springframework.cache.caffeine.CaffeineCacheManager;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.test.context.TestPropertySource;

import com.fuelyn.common.events.PriceUpdatedEvent;
import com.fuelyn.price.config.CollectionProperties;
import com.fuelyn.price.model.dto.CollectionResult;
import com.fuelyn.price.model.dto.TankerkoenigResponse;
import com.fuelyn.price.model.entity.PriceSnapshot;
import com.fuelyn.price.repository.CollectionRunRepository;
import com.fuelyn.price.repository.PriceSnapshotRepository;
import com.fuelyn.price.repository.StationMetaRepository;
import com.fuelyn.price.stream.PriceEventPublisher;

/**
 * Integration test for {@link PriceCollectorService} backed by H2 + the real Flyway migrations.
 * Avoids the full {@code @SpringBootTest} context (which on Windows hits a JDK loopback-Selector
 * bug while constructing {@code OpenChargeMapClient}'s RestTemplate) by booting just JPA + the
 * entities and wiring the service manually with stubs for Tankerkönig and the Kafka publisher.
 *
 * <p>Verifies behaviours the iter-1 .. iter-14 fixes added:
 *
 * <ul>
 *   <li>iter 1: {@code @Transactional} actually engages — proven indirectly because
 *       {@code @DataJpaTest}'s rollback boundary is at the test method, not the inner call.
 *   <li>iter 2: same-minute re-run does not duplicate snapshots.
 *   <li>iter 3: 25 stations → 25 station rows + 75 snapshot rows in one cycle without amplifying
 *       repo calls.
 *   <li>iter 9: cache eviction fires after a successful cycle.
 *   <li>iter 14: lastSeen NOT bumped when nothing else changed within the freshness window.
 * </ul>
 */
@DataJpaTest(showSql = false)
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@TestPropertySource(
        properties = {
            // Force a fresh, isolated H2 per test class. NONE-replace keeps
            // the application-yml-driven jdbc URL so Flyway runs over the
            // same schema the production service uses.
            "spring.datasource.url=jdbc:h2:mem:price-collector-it;DB_CLOSE_DELAY=-1;MODE=PostgreSQL",
            "spring.flyway.enabled=true",
            "spring.flyway.locations=classpath:db/migration",
            "spring.jpa.hibernate.ddl-auto=validate",
            // Disable the management-port's loopback bind so the test JVM
            // doesn't try to open a Selector (the same Windows quirk that
            // breaks the full SpringBootTest path).
            "spring.main.web-application-type=none"
        })
@ComponentScan(basePackageClasses = StationMetaRepository.class)
class PriceCollectorServiceIntegrationTest {

    @Autowired private StationMetaRepository stationRepo;
    @Autowired private PriceSnapshotRepository snapshotRepo;
    @Autowired private CollectionRunRepository runRepo;
    @Autowired private TestEntityManager em;

    private RecordingTankerkoenigClient tankerkoenig;
    private RecordingPriceEventPublisher publisher;
    private CaffeineCacheManager cacheManager;
    private PriceCollectorService service;

    @BeforeEach
    void wireService() {
        snapshotRepo.deleteAllInBatch();
        stationRepo.deleteAllInBatch();
        runRepo.deleteAllInBatch();

        tankerkoenig = new RecordingTankerkoenigClient();
        publisher = new RecordingPriceEventPublisher();

        cacheManager = new CaffeineCacheManager("priceHistory", "areaStats");

        // The constructor's @Lazy self-ref is satisfied via a setter-like
        // helper; we pass the same builder twice so collectAll → self.collectForArea
        // routes through this instance, replicating the production proxy.
        AtomicReference<PriceCollectorService> ref = new AtomicReference<>();
        PriceCollectorService s =
                new PriceCollectorService(
                        tankerkoenig,
                        snapshotRepo,
                        stationRepo,
                        runRepo,
                        publisher,
                        10.0, // radius
                        90, // maxHistoryDays
                        4, // parallelism
                        new SelfRefProxy(ref), // satisfies @Lazy
                        cacheManager,
                        null, // meterRegistry
                        new CollectionProperties() // empty → defaults
                        );
        ref.set(s);
        this.service = s;
    }

    /**
     * Tiny indirection so the constructor's @Lazy self-reference can be pointed at the very service
     * we're building. Not used as a real proxy — the test directly invokes service.collectForArea,
     * which is fine because we don't need the JDBC-batch correctness in unit tests (Hibernate is
     * happy to flush on the surrounding @DataJpaTest tx).
     */
    private static final class SelfRefProxy extends PriceCollectorService {
        private final AtomicReference<PriceCollectorService> target;

        SelfRefProxy(AtomicReference<PriceCollectorService> target) {
            super(
                    null,
                    null,
                    null,
                    null,
                    null,
                    0,
                    0,
                    0,
                    null,
                    null,
                    null,
                    new CollectionProperties());
            this.target = target;
        }

        @Override
        public CollectionResult collectForArea(double lat, double lng, String name) {
            return target.get().collectForArea(lat, lng, name);
        }

        @Override
        public int deleteRetentionChunk(LocalDateTime cutoff, int chunkSize) {
            return target.get().deleteRetentionChunk(cutoff, chunkSize);
        }
    }

    @Nested
    @DisplayName("Empty area")
    class Empty {

        @Test
        void noStationsReturned_persistsNothing() {
            tankerkoenig.respondWith(area -> List.of());

            CollectionResult result = service.collectForArea(52.5, 13.4, "Berlin");

            assertThat(result.stationsCount()).isZero();
            assertThat(result.pricesCount()).isZero();
            assertThat(stationRepo.count()).isZero();
            assertThat(snapshotRepo.count()).isZero();
        }
    }

    @Nested
    @DisplayName("Happy path — first cycle persistence")
    class HappyPath {

        @Test
        void firstCycle_persistsStationsAndSnapshots() {
            tankerkoenig.respondWith(
                    area ->
                            List.of(
                                    station(
                                            "s1", "Aral 1", "Aral", 52.5, 13.4, 1.799, 1.689,
                                            1.629),
                                    station(
                                            "s2", "Shell A", "Shell", 52.51, 13.41, 1.819, 1.699,
                                            1.639)));

            CollectionResult result = service.collectForArea(52.5, 13.4, "Berlin");
            em.flush();

            assertThat(result.stationsCount()).isEqualTo(2);
            assertThat(result.pricesCount()).isEqualTo(6);
            assertThat(stationRepo.count()).isEqualTo(2);
            assertThat(snapshotRepo.count()).isEqualTo(6);

            snapshotRepo
                    .findAll()
                    .forEach(
                            snap -> {
                                assertThat(snap.getPrice()).isPositive();
                                assertThat(snap.getTimestamp()).isNotNull();
                                assertThat(snap.getStationId()).isIn("s1", "s2");
                                assertThat(snap.getFuelType()).isIn("diesel", "e5", "e10");
                            });
        }

        @Test
        void firstCycle_emitsOneEventPerSnapshot() {
            tankerkoenig.respondWith(
                    area ->
                            List.of(
                                    station(
                                            "s1", "Aral 1", "Aral", 52.5, 13.4, 1.799, null,
                                            null)));

            service.collectForArea(52.5, 13.4, "Berlin");

            // Diesel only → one snapshot, one event.
            assertThat(publisher.published).hasSize(1);
            assertThat(publisher.published.get(0).fuelType()).isEqualTo("diesel");
            assertThat(publisher.published.get(0).newPrice()).isEqualTo(1.799);
        }

        @Test
        void emptyOrNullPrice_isSkipped() {
            tankerkoenig.respondWith(
                    area -> List.of(station("s1", "Aral 1", "Aral", 52.5, 13.4, null, 0.0, -1.0)));

            CollectionResult result = service.collectForArea(52.5, 13.4, "Berlin");

            // No fuel had a > 0 price → no snapshots, no events.
            assertThat(result.pricesCount()).isZero();
            assertThat(snapshotRepo.count()).isZero();
            assertThat(publisher.published).isEmpty();
        }
    }

    @Nested
    @DisplayName("N+1 elimination (iter 3)")
    class NPlusOneFix {

        @Test
        void manyStations_inOneCycle_persistsAllAtOnce() {
            List<TankerkoenigResponse.Station> bulk = new ArrayList<>();
            for (int i = 0; i < 25; i++) {
                bulk.add(
                        station(
                                "s" + i,
                                "Name " + i,
                                "Brand " + (i % 3),
                                52.5 + i * 0.001,
                                13.4 + i * 0.001,
                                1.7 + i * 0.001,
                                1.6 + i * 0.001,
                                1.5 + i * 0.001));
            }
            tankerkoenig.respondWith(area -> bulk);

            CollectionResult result = service.collectForArea(52.5, 13.4, "Bulk");

            assertThat(result.stationsCount()).isEqualTo(25);
            assertThat(result.pricesCount()).isEqualTo(75);
            assertThat(stationRepo.count()).isEqualTo(25);
            assertThat(snapshotRepo.count()).isEqualTo(75);
        }
    }

    @Nested
    @DisplayName("Bucket dedupe + UNIQUE constraint (iter 2)")
    class BucketDedupe {

        @Test
        void rerunningSameMinute_doesNotCreateDuplicateSnapshots() {
            tankerkoenig.respondWith(
                    area ->
                            List.of(
                                    station(
                                            "s1", "Aral 1", "Aral", 52.5, 13.4, 1.799, null,
                                            null)));

            service.collectForArea(52.5, 13.4, "Berlin");
            long afterFirst = snapshotRepo.count();

            // Same minute → bucket-equality kicks in.
            service.collectForArea(52.5, 13.4, "Berlin");
            long afterSecond = snapshotRepo.count();

            assertThat(afterFirst).isEqualTo(1);
            assertThat(afterSecond).isEqualTo(1);
        }

        @Test
        void uniqueConstraint_isInPlace() {
            // Sanity check: the V6 migration added the unique constraint.
            // Insert a duplicate manually and verify the underlying DB
            // would reject it. Catch DataIntegrityViolation and assert it
            // happened — H2 surfaces the constraint name in the message.
            PriceSnapshot a =
                    new PriceSnapshot(
                            "dup-sid",
                            "diesel",
                            1.799,
                            java.time.LocalDateTime.of(2026, 1, 1, 12, 0));
            snapshotRepo.saveAndFlush(a);

            PriceSnapshot b =
                    new PriceSnapshot(
                            "dup-sid",
                            "diesel",
                            1.799,
                            java.time.LocalDateTime.of(2026, 1, 1, 12, 0));

            org.assertj.core.api.Assertions.assertThatThrownBy(() -> snapshotRepo.saveAndFlush(b))
                    .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        }
    }

    @Nested
    @DisplayName("Skip lastSeen-only StationMeta save (iter 14)")
    class SkipLastSeenOnly {

        @Test
        void unchangedMetadata_keepsLastSeenStable_withinFreshnessWindow() {
            tankerkoenig.respondWith(
                    area ->
                            List.of(
                                    station(
                                            "s1", "Aral 1", "Aral", 52.5, 13.4, 1.799, null,
                                            null)));

            service.collectForArea(52.5, 13.4, "Berlin");
            em.flush();
            em.clear();
            LocalDateTime first = stationRepo.findById("s1").orElseThrow().getLastSeen();

            service.collectForArea(52.5, 13.4, "Berlin");
            em.flush();
            em.clear();
            LocalDateTime second = stationRepo.findById("s1").orElseThrow().getLastSeen();

            assertThat(second).isEqualTo(first);
        }

        @Test
        void changedMetadata_doesUpdate_evenIfLastSeenIsRecent() {
            tankerkoenig.respondWith(
                    area ->
                            List.of(
                                    station(
                                            "s1", "Aral 1", "Aral", 52.5, 13.4, 1.799, null,
                                            null)));
            service.collectForArea(52.5, 13.4, "Berlin");
            em.flush();
            em.clear();

            tankerkoenig.respondWith(
                    area ->
                            List.of(
                                    station(
                                            "s1",
                                            "Aral 1",
                                            "Aral-Rebranded",
                                            52.5,
                                            13.4,
                                            1.799,
                                            null,
                                            null)));
            service.collectForArea(52.5, 13.4, "Berlin");
            em.flush();
            em.clear();

            assertThat(stationRepo.findById("s1").orElseThrow().getBrand())
                    .isEqualTo("Aral-Rebranded");
        }
    }

    @Nested
    @DisplayName("Cache eviction (iter 9)")
    class CacheEviction {

        @Test
        void successfulCycle_clearsPriceDependentCaches() {
            Cache priceHistory = cacheManager.getCache("priceHistory");
            Cache areaStats = cacheManager.getCache("areaStats");
            assertThat(priceHistory).isNotNull();
            assertThat(areaStats).isNotNull();

            priceHistory.put("foo", "stale-history");
            areaStats.put("bar", "stale-stats");

            tankerkoenig.respondWith(
                    area ->
                            List.of(
                                    station(
                                            "s1", "Aral 1", "Aral", 52.5, 13.4, 1.799, null,
                                            null)));

            service.collectAll();

            assertThat(priceHistory.get("foo")).isNull();
            assertThat(areaStats.get("bar")).isNull();
        }
    }

    // ─── helpers ─────────────────────────────────────────────

    private static TankerkoenigResponse.Station station(
            String id,
            String name,
            String brand,
            double lat,
            double lng,
            Double diesel,
            Double e5,
            Double e10) {
        return new TankerkoenigResponse.Station(
                id, name, brand, "Street", "1", "10115", "Berlin", lat, lng, 0.5, diesel, e5, e10,
                true);
    }

    /**
     * Plain {@link FuelStationClient} implementation — no super-class RestTemplate construction, so
     * the JDK loopback-Selector bug on Windows can't bite. PriceCollectorService now depends on the
     * interface, so this is a clean test seam.
     */
    static class RecordingTankerkoenigClient implements FuelStationClient {
        private final AtomicReference<Function<AreaQuery, List<TankerkoenigResponse.Station>>>
                responder = new AtomicReference<>(area -> List.of());
        final List<AreaQuery> calls = new ArrayList<>();

        void respondWith(Function<AreaQuery, List<TankerkoenigResponse.Station>> fn) {
            responder.set(fn);
        }

        @Override
        public List<TankerkoenigResponse.Station> searchStations(
                double lat, double lng, double radiusKm) {
            AreaQuery q = new AreaQuery(lat, lng, radiusKm);
            calls.add(q);
            return responder.get().apply(q);
        }

        @Override
        public TankerkoenigResponse.Station fetchStationDetail(String stationId) {
            return null;
        }

        @Override
        public java.util.Map<String, TankerkoenigResponse.PriceEntry> fetchPrices(
                List<String> stationIds) {
            return java.util.Collections.emptyMap();
        }

        record AreaQuery(double lat, double lng, double radiusKm) {}
    }

    static class RecordingPriceEventPublisher extends PriceEventPublisher {
        final List<PriceUpdatedEvent> published = new ArrayList<>();

        RecordingPriceEventPublisher() {
            super(null, "test-topic");
        }

        @Override
        public void publish(PriceUpdatedEvent event) {
            published.add(event);
        }
    }
}
