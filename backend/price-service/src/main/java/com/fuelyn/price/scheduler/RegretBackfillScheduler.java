package com.fuelyn.price.scheduler;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import com.fuelyn.price.service.RegretBackfillService;

import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;

/**
 * Nightly cron that closes the regret loop on advisor telemetry.
 *
 * <p>Default schedule: 03:30 daily — chosen to run after the existing data-cleanup job at 03:00
 * (see {@link PriceCollectionScheduler}) so the two jobs don't both fight for the connection pool,
 * and well before the morning collection burst.
 *
 * <p>Guarded by a {@link SchedulerLock} so a clustered deployment does not run the loop twice.
 * Disabled by default; enable via env {@code REGRET_BACKFILL_ENABLED=true} once the Flyway
 * migration is applied and ai-service has been writing rows for a while.
 */
@Component
@ConditionalOnProperty(
        prefix = "fuelyn.regret.backfill",
        name = "enabled",
        havingValue = "true",
        matchIfMissing = false)
public class RegretBackfillScheduler {

    private static final Logger log = LoggerFactory.getLogger(RegretBackfillScheduler.class);

    private final RegretBackfillService service;

    public RegretBackfillScheduler(RegretBackfillService service) {
        this.service = service;
    }

    @Scheduled(cron = "${fuelyn.regret.backfill.cron:0 30 3 * * *}")
    @SchedulerLock(name = "regretBackfill", lockAtMostFor = "PT45M", lockAtLeastFor = "PT1M")
    public void runDaily() {
        log.info("Regret backfill — starting nightly pass");
        try {
            int filled = service.runOnce();
            log.info(
                    "Regret backfill — nightly pass done, {} rows received a regret value", filled);
        } catch (Exception e) {
            // Telemetry job — never let it propagate so a transient
            // DB hiccup doesn't poison the scheduler thread.
            log.error("Regret backfill failed: {}", e.getMessage(), e);
        }
    }
}
