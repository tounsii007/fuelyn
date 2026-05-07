package com.tankpilot.common.events;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.time.Instant;
import java.util.UUID;

/**
 * Generic CloudEvents-style envelope for everything we put on Kafka.
 *
 * <p>The envelope adds versioning, tracing, and provenance metadata
 * around the actual payload, so consumers can:</p>
 * <ul>
 *   <li>De-duplicate by {@code id} (idempotent processing)</li>
 *   <li>Filter by {@code type} (one topic can carry multiple types)</li>
 *   <li>Trace via {@code traceId} (W3C trace-context propagation)</li>
 *   <li>Tolerate forward-compatible schema changes via {@code schemaVersion}</li>
 * </ul>
 *
 * <p>Format roughly follows the
 * <a href="https://github.com/cloudevents/spec/blob/main/cloudevents/spec.md">CloudEvents spec</a>
 * — close enough that we can drop in the official Java SDK later
 * without migrating consumers.</p>
 *
 * @param <T> the event payload type
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record EventEnvelope<T>(
        /** Unique event identifier — used for deduplication. */
        String id,
        /** Logical event type, e.g. "tankpilot.price.updated.v1". */
        String type,
        /** Service that produced this event. */
        String source,
        /** Time the event was created (producer-side wall clock). */
        Instant time,
        /** Optional W3C trace-context traceId for end-to-end tracing. */
        String traceId,
        /** Bumped only on incompatible schema changes within a `type`. */
        int schemaVersion,
        /** The actual payload. */
        T data
) {

    /** Convenience factory with safe defaults for {@code id}/{@code time}. */
    public static <T> EventEnvelope<T> of(String type, String source, T data) {
        return new EventEnvelope<>(
                UUID.randomUUID().toString(),
                type,
                source,
                Instant.now(),
                null,
                1,
                data);
    }

    public EventEnvelope<T> withTraceId(String traceId) {
        return new EventEnvelope<>(id, type, source, time, traceId, schemaVersion, data);
    }
}
