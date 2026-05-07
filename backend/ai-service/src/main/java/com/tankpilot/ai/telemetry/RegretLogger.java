package com.tankpilot.ai.telemetry;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.tankpilot.ai.model.AIAdvisorRequest;
import com.tankpilot.ai.model.AIAdvisorResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.Marker;
import org.slf4j.MarkerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Structured regret-telemetry logger.
 *
 * <p>Writes one JSON line per advisor decision under a dedicated SLF4J
 * marker (<code>ADVISOR_REGRET</code>). A nightly batch job can later
 * read these lines, look up the prices that <i>actually</i> occurred
 * in the 24 h after each <code>wait</code> recommendation, and
 * compute regret = (observed_min − recommended_now) × tank_size. That
 * stream of regret samples is the input we need to tune signal
 * weights with empirical data instead of intuition.</p>
 *
 * <p>The output is purely additive — it does not affect the response
 * the user sees. PII-light: we log the geo bucket (rounded to 0.01°)
 * and the brand/price tuple per station, not user-identifying fields.</p>
 */
@Component
public class RegretLogger {

    private static final Logger log = LoggerFactory.getLogger(RegretLogger.class);
    private static final Marker REGRET_MARKER = MarkerFactory.getMarker("ADVISOR_REGRET");

    private final ObjectMapper mapper;

    @Autowired
    public RegretLogger(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    public void record(String requestId, AIAdvisorRequest request, AIAdvisorResponse response) {
        if (!log.isInfoEnabled()) return;

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

    /** Round to 0.01° (~1 km) so the bucket reveals a city block, not a person. */
    private static Double roundToBucket(Double v) {
        if (v == null) return null;
        return Math.round(v * 100.0) / 100.0;
    }
}
