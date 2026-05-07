package com.tankpilot.ai.backend;

import com.tankpilot.ai.model.AIAdvisorRequest;
import com.tankpilot.ai.model.AIAdvisorResponse;

/**
 * Strategy interface for LLM-based narrative enrichment of a heuristic
 * baseline recommendation.
 *
 * <p>The contract: the heuristic owns all <i>structured</i> fields
 * (action, savingsEstimate, bestStation, confidence). An enrichment
 * backend may rewrite only the prose fields:</p>
 * <ul>
 *   <li>{@code headline}</li>
 *   <li>{@code explanation}</li>
 *   <li>{@code tip}</li>
 *   <li>{@code priceOutlook}</li>
 *   <li>{@code bestTimePrediction}</li>
 * </ul>
 *
 * <p>This guarantees algorithmic correctness regardless of whether the
 * underlying model hallucinates — the LLM cannot accidentally flip
 * {@code buy_now} to {@code wait} or invent prices that aren't in the
 * data set.</p>
 *
 * <p>Implementations must throw on transport / parse failures so the
 * orchestrator can fall back to the next provider in the chain.</p>
 */
public interface EnrichmentBackend {

    /**
     * Stable identifier used in logs and metrics.
     */
    String name();

    /**
     * Whether this backend is currently usable. Lets the orchestrator
     * skip a provider whose configuration is incomplete (e.g. missing
     * API key, container not yet healthy) without throwing.
     */
    boolean isAvailable();

    /**
     * Re-write the prose fields of {@code baseline} using this backend.
     *
     * @param request  the original user request (raw signals)
     * @param baseline the deterministic heuristic verdict (immutable)
     * @return a new response with the same structured fields and
     *         enriched narrative. Must never mutate {@code baseline}.
     * @throws RuntimeException on any transport, timeout, or parse
     *         failure — the orchestrator will then move to the next
     *         backend in the tier chain.
     */
    AIAdvisorResponse enrich(AIAdvisorRequest request, AIAdvisorResponse baseline);
}
