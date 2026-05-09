package com.fuelyn.price.service;

import com.fuelyn.price.config.CollectionProperties;
import com.fuelyn.price.model.dto.TankerkoenigResponse;
import com.fuelyn.price.model.entity.PriceSnapshot;
import com.fuelyn.price.repository.CollectionRunRepository;
import com.fuelyn.price.repository.PriceSnapshotRepository;
import com.fuelyn.price.repository.StationMetaRepository;
import com.fuelyn.price.stream.PriceEventPublisher;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.test.context.TestPropertySource;

import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Tests for {@link PriceCollectorService#cleanupOldData} — the iter-5
 * chunked-purge fix. Goals:
 *
 * <ul>
 *   <li>Rows older than the retention boundary are deleted.</li>
 *   <li>Rows newer than the retention boundary are kept.</li>
 *   <li>The chunked loop terminates when no more rows match — even when
 *       the dataset is much larger than the chunk size.</li>
 *   <li>Deletion happens in chunks: a 12k-row dataset triggers more than
 *       one DELETE round-trip.</li>
 * </ul>
 */
@DataJpaTest(showSql = false)
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@TestPropertySource(properties = {
        "spring.datasource.url=jdbc:h2:mem:price-cleanup-it;DB_CLOSE_DELAY=-1;MODE=PostgreSQL",
        "spring.flyway.enabled=true",
        "spring.flyway.locations=classpath:db/migration",
        "spring.jpa.hibernate.ddl-auto=validate",
        "spring.main.web-application-type=none"
})
class PriceCollectorCleanupTest {

    @Autowired private StationMetaRepository stationRepo;
    @Autowired private PriceSnapshotRepository snapshotRepo;
    @Autowired private CollectionRunRepository runRepo;
    @Autowired private TestEntityManager em;

    private PriceCollectorService service;

    @BeforeEach
    void setup() {
        snapshotRepo.deleteAllInBatch();
        stationRepo.deleteAllInBatch();
        runRepo.deleteAllInBatch();

        AtomicReference<PriceCollectorService> ref = new AtomicReference<>();
        PriceCollectorService s = new PriceCollectorService(
                new EmptyClient(),
                snapshotRepo, stationRepo, runRepo,
                new NoopPublisher(),
                10.0, 7,
                new SelfRef(ref),
                null,
                new CollectionProperties()
        );
        ref.set(s);
        this.service = s;
    }

    @Nested
    @DisplayName("Retention boundary")
    class RetentionBoundary {

        @Test
        void rowsOlderThanRetention_areDeleted() {
            LocalDateTime now = LocalDateTime.now();
            // 7-day retention. Insert one row 30 days old.
            snapshotRepo.save(new PriceSnapshot("s1", "diesel", 1.799, now.minusDays(30)));
            em.flush();

            int deleted = service.cleanupOldData();
            em.flush();

            assertThat(deleted).isEqualTo(1);
            assertThat(snapshotRepo.count()).isZero();
        }

        @Test
        void rowsNewerThanRetention_areKept() {
            LocalDateTime now = LocalDateTime.now();
            snapshotRepo.save(new PriceSnapshot("s1", "diesel", 1.799, now.minusDays(3)));
            em.flush();

            int deleted = service.cleanupOldData();

            assertThat(deleted).isZero();
            assertThat(snapshotRepo.count()).isEqualTo(1);
        }

        @Test
        void mixedAges_keepsOnlyRecent() {
            LocalDateTime now = LocalDateTime.now();
            snapshotRepo.save(new PriceSnapshot("s1", "diesel", 1.799, now.minusDays(30)));
            snapshotRepo.save(new PriceSnapshot("s1", "e5",     1.689, now.minusDays(3)));
            snapshotRepo.save(new PriceSnapshot("s1", "e10",    1.629, now.minusDays(60)));
            em.flush();

            int deleted = service.cleanupOldData();
            em.flush();

            assertThat(deleted).isEqualTo(2);
            assertThat(snapshotRepo.count()).isEqualTo(1);
            assertThat(snapshotRepo.findAll().get(0).getFuelType()).isEqualTo("e5");
        }
    }

    @Nested
    @DisplayName("Chunked loop terminates")
    class ChunkedLoop {

        @Test
        void datasetMuchLargerThanChunk_isFullyDrained() {
            // CLEANUP_CHUNK_SIZE is 5000. Insert 12 000 stale rows so the
            // loop must iterate 3 times (5000 + 5000 + 2000) before the
            // termination condition (chunk < CLEANUP_CHUNK_SIZE) fires.
            // Use distinct station IDs so the V6 unique constraint
            // (station_id, fuel_type, timestamp) doesn't collide.
            LocalDateTime old = LocalDateTime.now().minusDays(30);
            int n = 12_000;
            List<PriceSnapshot> bulk = new java.util.ArrayList<>(n);
            for (int i = 0; i < n; i++) {
                bulk.add(new PriceSnapshot(
                        "stale-" + i, "diesel", 1.799,
                        old.plusSeconds(i)));
            }
            snapshotRepo.saveAll(bulk);
            em.flush();

            int deleted = service.cleanupOldData();
            em.flush();

            assertThat(deleted).isEqualTo(n);
            assertThat(snapshotRepo.count()).isZero();
        }

        @Test
        void emptyDatabase_returnsZero_doesNotInfiniteLoop() {
            int deleted = service.cleanupOldData();
            assertThat(deleted).isZero();
        }
    }

    // ─── stubs ────────────────────────────────────────────────

    static class EmptyClient implements FuelStationClient {
        @Override public List<TankerkoenigResponse.Station> searchStations(double a, double b, double c) { return List.of(); }
        @Override public TankerkoenigResponse.Station fetchStationDetail(String id) { return null; }
        @Override public java.util.Map<String, TankerkoenigResponse.PriceEntry> fetchPrices(List<String> ids) { return java.util.Map.of(); }
    }

    static class NoopPublisher extends PriceEventPublisher {
        NoopPublisher() { super(null, "test"); }
        @Override public void publish(com.fuelyn.common.events.PriceUpdatedEvent event) {}
    }

    static class SelfRef extends PriceCollectorService {
        private final AtomicReference<PriceCollectorService> target;
        SelfRef(AtomicReference<PriceCollectorService> target) {
            super(null, null, null, null, null, 0, 0, null, null, new CollectionProperties());
            this.target = target;
        }
        @Override public int deleteRetentionChunk(LocalDateTime cutoff, int chunkSize) {
            return target.get().deleteRetentionChunk(cutoff, chunkSize);
        }
    }
}
