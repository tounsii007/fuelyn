package com.fuelyn.price.scheduler;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import com.fuelyn.price.model.dto.CollectionResult;
import com.fuelyn.price.service.PriceCollectorService;

import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;

/**
 * Scheduled tasks for automated price collection and data maintenance.
 *
 * <p>Every job is guarded by {@link SchedulerLock} so in a clustered deployment only one instance
 * executes a given job per cron tick. Without this, every replica would call Tankerkoenig at the
 * same time and double-count snapshots.
 */
@Component
@ConditionalOnProperty(name = "fuelyn.collection.enabled", havingValue = "true")
public class PriceCollectionScheduler {

    private static final Logger log = LoggerFactory.getLogger(PriceCollectionScheduler.class);

    private final PriceCollectorService collectorService;

    public PriceCollectionScheduler(PriceCollectorService collectorService) {
        this.collectorService = collectorService;
    }

    /** Collects fuel prices across all configured cities. */
    @Scheduled(cron = "${fuelyn.collection.cron}")
    @SchedulerLock(name = "collectPrices", lockAtMostFor = "PT25M", lockAtLeastFor = "PT1M")
    public void collectPrices() {
        log.info("Starting scheduled price collection...");
        try {
            CollectionResult result = collectorService.collectAll();
            log.info(
                    "Scheduled collection complete: {} stations, {} prices in {}ms",
                    result.stationsCount(),
                    result.pricesCount(),
                    result.durationMs());
        } catch (Exception e) {
            log.error("Scheduled price collection failed: {}", e.getMessage(), e);
        }
    }

    /** Cleans up old price snapshots (retention policy). Daily at 03:00. */
    @Scheduled(cron = "0 0 3 * * *")
    @SchedulerLock(name = "cleanupOldData", lockAtMostFor = "PT1H", lockAtLeastFor = "PT1M")
    public void cleanupOldData() {
        log.info("Starting old data cleanup...");
        try {
            int deleted = collectorService.cleanupOldData();
            log.info("Cleanup complete: {} old snapshots removed", deleted);
        } catch (Exception e) {
            log.error("Data cleanup failed: {}", e.getMessage(), e);
        }
    }
}
