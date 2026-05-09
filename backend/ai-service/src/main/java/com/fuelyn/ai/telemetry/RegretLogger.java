package com.fuelyn.ai.telemetry;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fuelyn.ai.model.AIAdvisorRequest;
import com.fuelyn.ai.model.AIAdvisorResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.Marker;
import org.slf4j.MarkerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Structured regret-telemetry logger.
 *
 * <p>Writes every advisor decision to two sinks:</p>
 * <ol>
 *   <li><b>JSON log line</b> under the SLF4J marker
 *       <code>ADVISOR_REGRET</code> — always on. Survives even when the
 *       database is unreachable, since logs are picked up by whatever
 *       log shipper the operator has configured.</li>
 *   <li><b>{@code recommendation_logs} row</b> in Postgres — opt-in via
 *       {@code fuelyn.regret.enabled=true}. Privacy-preserving: lat/lng
 *       are stored as 0.01° (~1 km) buckets, no user/device identifier.
 *       A nightly cron in price-service backfills the realised 24-h
 *       minimum price and the resulting regret value.</li>
 * </ol>
 *
 * <p>Both sinks are best-effort: any failure (Jackson, JDBC, schema
 * mismatch) is swallowed. Telemetry must never break the request path.</p>
 */
@Component
public class RegretLogger {

    private static final Logger log = LoggerFactory.getLogger(RegretLogger.class);
    private static final Marker REGRET_MARKER = MarkerFactory.getMarker("ADVISOR_REGRET");

    /**
     * Single-row insert. The sequence is owned by Flyway V5 in
     * price-service; we read the next value with {@code .nextval}
     * (Postgres) which H2 also accepts.
     */
    private static final String INSERT_SQL = """
            INSERT INTO recommendation_logs (
              id, ts_request, fuel_type, lat_bucket, lng_bucket, liters,
              station_count, recommended_action, recommended_price,
              confidence, from_ai
            ) VALUES (
              nextval('recommendation_logs_seq'),
              ?, ?, ?, ?, ?,
              ?, ?, ?,
              ?, ?
            )
            """;

    private final ObjectMapper mapper;
    private final JdbcTemplate jdbc;
    private final boolean dbEnabled;
    /** One-shot flag so we only WARN about misconfiguration once per JVM. */
    private volatile boolean dbWarningEmitted = false;

    @Autowired(required = false)
    public RegretLogger(
            ObjectMapper mapper,
            @Autowired(required = false) JdbcTemplate jdbc,
            @Value("${fuelyn.regret.enabled:false}") boolean dbEnabled
    ) {
        this.mapper = mapper;
        this.jdbc = jdbc;
        this.dbEnabled = dbEnabled;

        if (dbEnabled && jdbc == null) {
            log.warn("fuelyn.regret.enabled=true but no JdbcTemplate is wired — "
                    + "regret will be JSON-logged only. Did you set SPRING_DATASOURCE_URL?");
        } else if (dbEnabled) {
            log.info("RegretLogger ready — DB persistence ON (recommendation_logs)");
        } else {
            log.info("RegretLogger ready — JSON-only mode (DB persistence OFF)");
        }
    }

    public void record(String requestId, AIAdvisorRequest request, AIAdvisorResponse response) {
        // ─── Sink 1: structured JSON log line ────────────────────
        // Kept even with DB persistence on — operators with a log
        // pipeline (Loki, Datadog, etc.) shouldn't lose telemetry
        // because of a schema migration or DB outage.
        if (log.isInfoEnabled()) {
            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("ts", Instant.now().toString());
            entry.put("requestId", requestId);
            entry.put("fuelType", request.fuelType());
            entry.put("liters", request.fillUpLiters());
            entry.put("latBucket", roundToBucket(request.lat()));
            entry.put("lngBucket", roundToBucket(request.lng()));
            entry.put("stationCount", request.prices() == null ? 0 : request.prices().size());

            if (request.prices() != null && !request.prices().isEmpty()) {
                entry.put("prices", request.prices().stream().map(p -> Map.of(
                        "name", p.stationName(),
                        "brand", String.valueOf(p.brand()),
                        "price", p.price(),
                        "distance", p.distance()
                )).toList());
            }

            entry.put("verdict", Map.of(
                    "action", response.action(),
                    "confidence", response.confidence(),
                    "savingsEstimate", response.savingsEstimate(),
                    "fromAI", response.fromAI()
            ));
            if (response.bestStation() != null) {
                entry.put("bestStation", response.bestStation().name());
            }
            if (response.breakdown() != null) {
                entry.put("breakdown", response.breakdown());
            }

            try {
                log.info(REGRET_MARKER, mapper.writeValueAsString(entry));
            } catch (JsonProcessingException e) {
                // Telemetry must never throw out of the request path
                log.debug("Regret-log serialisation failed: {}", e.getMessage());
            }
        }

        // ─── Sink 2: recommendation_logs row ─────────────────────
        if (dbEnabled && jdbc != null) {
            try {
                persist(request, response);
            } catch (DataAccessException e) {
                // First failure → WARN once so it shows up in alerts;
                // afterwards drop to DEBUG to avoid spamming the log
                // when the DB is down for a sustained period.
                if (!dbWarningEmitted) {
                    log.warn("Regret-log INSERT failed: {} — falling back to JSON-only "
                            + "until next service restart", e.getMessage());
                    dbWarningEmitted = true;
                } else {
                    log.debug("Regret-log INSERT failed: {}", e.getMessage());
                }
            } catch (RuntimeException e) {
                // Catch-all — Jackson/JDBC config issues, etc. Same
                // suppression policy as the DataAccessException path.
                if (!dbWarningEmitted) {
                    log.warn("Regret-log INSERT unexpected error: {}", e.getMessage());
                    dbWarningEmitted = true;
                }
            }
        }
    }

    private void persist(AIAdvisorRequest request, AIAdvisorResponse response) {
        Double latBucket = roundToBucket(request.lat());
        Double lngBucket = roundToBucket(request.lng());
        // Bucket fields are NOT NULL in the table — without coords we
        // can't usefully record the row, so skip rather than insert
        // garbage. JSON log already captured the verdict.
        if (latBucket == null || lngBucket == null) {
            return;
        }

        Double recommendedPrice = bestPriceOf(request.prices());
        Double liters = request.fillUpLiters() == null ? null : request.fillUpLiters().doubleValue();
        int stationCount = request.prices() == null ? 0 : request.prices().size();

        // The action enum on the wire is lowercase ("buy_now" / "wait")
        // but our schema uses upper-snake for the catalogue. Normalise.
        String action = normaliseAction(response.action());

        jdbc.update(
                INSERT_SQL,
                Timestamp.from(Instant.now()),
                request.fuelType(),
                latBucket,
                lngBucket,
                liters,
                stationCount,
                action,
                recommendedPrice,
                response.confidence(),
                response.fromAI()
        );
    }

    /** Lowest price across the candidate stations — what the user would have paid. */
    private static Double bestPriceOf(List<AIAdvisorRequest.StationPrice> prices) {
        if (prices == null || prices.isEmpty()) return null;
        double best = Double.POSITIVE_INFINITY;
        for (var p : prices) {
            if (p == null) continue;
            if (p.price() > 0 && p.price() < best) best = p.price();
        }
        return best == Double.POSITIVE_INFINITY ? null : best;
    }

    /** Map free-form action strings to a stable catalogue. */
    private static String normaliseAction(String action) {
        if (action == null) return "UNKNOWN";
        String upper = action.trim().toUpperCase().replace('-', '_').replace(' ', '_');
        // Allow "buy_now" / "BUY_NOW" / "BuyNow" all to land in the same bucket
        return switch (upper) {
            case "BUY_NOW", "BUYNOW", "BUY"      -> "BUY_NOW";
            case "WAIT", "HOLD"                  -> "WAIT";
            case "WAIT_LONG", "WAITLONG"         -> "WAIT_LONG";
            default -> upper.length() > 16 ? upper.substring(0, 16) : upper;
        };
    }

    /** Round to 0.01° (~1 km) so the bucket reveals a city block, not a person. */
    private static Double roundToBucket(Double v) {
        if (v == null) return null;
        return Math.round(v * 100.0) / 100.0;
    }
}
