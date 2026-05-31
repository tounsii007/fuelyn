package com.fuelyn.price.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.offset;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.fuelyn.price.model.dto.PriceHistoryResponse;
import com.fuelyn.price.model.entity.PriceSnapshot;
import com.fuelyn.price.repository.PriceSnapshotRepository;
import com.fuelyn.price.repository.StationMetaRepository;

@ExtendWith(MockitoExtension.class)
class PriceHistoryServiceTest {

    @Mock private PriceSnapshotRepository repo;
    @Mock private StationMetaRepository stationMetaRepo;
    @InjectMocks private PriceHistoryService service;

    private LocalDateTime base;

    @BeforeEach
    void setUp() {
        base = LocalDateTime.of(2026, 1, 5, 12, 0); // Monday
    }

    private static PriceSnapshot snap(String id, double price, LocalDateTime ts) {
        return new PriceSnapshot(id, "e10", price, ts);
    }

    @Test
    void getHistory_returnsDefault_whenNoSnapshots() {
        when(repo.findByStationIdAndFuelTypeAndTimestampAfterOrderByTimestampAsc(
                        anyString(), anyString(), any()))
                .thenReturn(List.of());

        PriceHistoryResponse resp = service.getHistory("abc", "e10", 7);

        assertThat(resp.stationId()).isEqualTo("abc");
        assertThat(resp.history()).isEmpty();
        assertThat(resp.stats().cheapestDay()).isEqualTo("N/A");
    }

    @Test
    void getHistory_computesMinMaxAvg() {
        List<PriceSnapshot> snapshots =
                List.of(
                        snap("s1", 1.700, base.minusDays(6)),
                        snap("s1", 1.750, base.minusDays(4)),
                        snap("s1", 1.725, base.minusDays(2)),
                        snap("s1", 1.680, base.minusDays(1)));
        when(repo.findByStationIdAndFuelTypeAndTimestampAfterOrderByTimestampAsc(
                        anyString(), anyString(), any()))
                .thenReturn(snapshots);

        PriceHistoryResponse resp = service.getHistory("s1", "e10", 7);

        assertThat(resp.history()).hasSize(4);
        assertThat(resp.stats().min()).isEqualTo(1.680);
        assertThat(resp.stats().max()).isEqualTo(1.750);
        assertThat(resp.stats().avg()).isCloseTo(1.71375, offset(0.002));
    }

    @Test
    void getHistory_trendIsPositive_whenPricesRising() {
        List<PriceSnapshot> rising =
                List.of(
                        snap("s1", 1.500, base.minusDays(5)),
                        snap("s1", 1.510, base.minusDays(4)),
                        snap("s1", 1.520, base.minusDays(3)),
                        snap("s1", 1.700, base.minusDays(2)),
                        snap("s1", 1.710, base.minusDays(1)),
                        snap("s1", 1.720, base));
        when(repo.findByStationIdAndFuelTypeAndTimestampAfterOrderByTimestampAsc(
                        anyString(), anyString(), any()))
                .thenReturn(rising);

        PriceHistoryResponse resp = service.getHistory("s1", "e10", 7);

        assertThat(resp.stats().trend()).isPositive();
    }

    @Test
    void getHistory_buildsDayOfWeekPatternFromSnapshots() {
        List<PriceSnapshot> snapshots =
                List.of(
                        snap("s1", 1.60, LocalDateTime.of(2026, 1, 5, 12, 0)), // Mon
                        snap("s1", 1.79, LocalDateTime.of(2026, 1, 9, 12, 0)), // Fri
                        snap("s1", 1.70, LocalDateTime.of(2026, 1, 7, 12, 0))); // Wed
        when(repo.findByStationIdAndFuelTypeAndTimestampAfterOrderByTimestampAsc(
                        anyString(), anyString(), any()))
                .thenReturn(snapshots);

        PriceHistoryResponse resp = service.getHistory("s1", "e10", 7);

        assertThat(resp.stats().cheapestDay()).isEqualTo("Montag");
        assertThat(resp.stats().expensiveDay()).isEqualTo("Freitag");
        assertThat(resp.stats().dayOfWeekAvg()).containsKeys("Montag", "Mittwoch", "Freitag");
    }
}
