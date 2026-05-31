package com.fuelyn.ai.telemetry;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.jdbc.core.JdbcTemplate;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fuelyn.ai.model.AIAdvisorRequest;
import com.fuelyn.ai.model.AIAdvisorResponse;

/**
 * Tests the persistence side of {@link RegretLogger}. The JSON-log sink is hard to assert on
 * without an SLF4J interceptor, but the DB sink is a small INSERT we can verify via Mockito.
 */
class RegretLoggerTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private static AIAdvisorRequest sampleRequest() {
        return new AIAdvisorRequest(
                List.of(new AIAdvisorRequest.StationPrice("Aral Marburg", "Aral", 1.799, 0.5)),
                "e10",
                null,
                50.81,
                8.77,
                50);
    }

    private static AIAdvisorResponse sampleResponse() {
        return new AIAdvisorResponse(
                "buy_now",
                "Jetzt tanken",
                "Beste Wahl in der Nähe.",
                "ähnlicher Preis morgen",
                0.0,
                "high",
                new AIAdvisorResponse.BestStation("Aral Marburg", "günstigster"),
                "Stabil",
                "—",
                false,
                false,
                null,
                null,
                null);
    }

    @Test
    void disabledByDefault_doesNotTouchJdbc() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        RegretLogger logger = new RegretLogger(MAPPER, jdbc, /* dbEnabled= */ false);

        logger.record("req-1", sampleRequest(), sampleResponse());

        verify(jdbc, never()).update(anyString(), any(Object[].class));
        verify(jdbc, never()).update(anyString());
    }

    @Test
    void enabled_withoutJdbc_logsButDoesNotThrow() {
        // Misconfiguration: regret toggle ON but no datasource bean.
        // Must NOT crash the request path; the constructor should warn
        // and fall back to JSON-only mode.
        RegretLogger logger = new RegretLogger(MAPPER, null, true);

        assertThatCode(() -> logger.record("req-1", sampleRequest(), sampleResponse()))
                .doesNotThrowAnyException();
    }

    @Test
    void enabled_writesOneRowPerCall() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.update(
                        anyString(),
                        any(),
                        any(),
                        any(),
                        any(),
                        any(),
                        any(),
                        any(),
                        any(),
                        any(),
                        any()))
                .thenReturn(1);

        RegretLogger logger = new RegretLogger(MAPPER, jdbc, true);
        logger.record("req-1", sampleRequest(), sampleResponse());

        verify(jdbc, times(1))
                .update(
                        anyString(),
                        any(),
                        any(),
                        any(),
                        any(),
                        any(),
                        any(),
                        any(),
                        any(),
                        any(),
                        any());
    }

    @Test
    void normalisesActionEnum() {
        // The advisor emits "buy_now" / "wait" on the wire; the schema
        // expects the upper-snake catalogue. The LOG line stays
        // verbatim, but the persistent row gets the normalised value.
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        RegretLogger logger = new RegretLogger(MAPPER, jdbc, true);

        logger.record("req-1", sampleRequest(), sampleResponse());

        verify(jdbc)
                .update(
                        anyString(),
                        any(),
                        any(),
                        any(),
                        any(),
                        any(),
                        any(),
                        eq("BUY_NOW"), // the normalised action enum
                        any(),
                        any(),
                        any());
    }

    @Test
    void missingCoords_skipDbButNotLog() {
        // No lat/lng → can't bucket → must skip the INSERT (NOT NULL
        // constraint), but the JSON log line still goes out.
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        RegretLogger logger = new RegretLogger(MAPPER, jdbc, true);

        AIAdvisorRequest noCoords =
                new AIAdvisorRequest(
                        List.of(new AIAdvisorRequest.StationPrice("X", "Aral", 1.79, 0.0)),
                        "e10",
                        null,
                        /* lat= */ null,
                        /* lng= */ null,
                        50);

        logger.record("req-1", noCoords, sampleResponse());

        verify(jdbc, never()).update(anyString(), any(Object[].class));
    }

    @Test
    void jdbcFailure_isSwallowed() {
        // Telemetry path must never break the request. A real JDBC
        // failure (DB down) is logged as a warning and ignored.
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.update(
                        anyString(),
                        any(),
                        any(),
                        any(),
                        any(),
                        any(),
                        any(),
                        any(),
                        any(),
                        any(),
                        any()))
                .thenThrow(new DataAccessResourceFailureException("postgres down"));

        RegretLogger logger = new RegretLogger(MAPPER, jdbc, true);

        assertThatCode(() -> logger.record("req-1", sampleRequest(), sampleResponse()))
                .doesNotThrowAnyException();
    }
}
