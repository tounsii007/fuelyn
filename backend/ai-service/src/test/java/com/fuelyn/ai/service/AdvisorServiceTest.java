package com.fuelyn.ai.service;

import com.fuelyn.ai.backend.EnrichmentBackend;
import com.fuelyn.ai.model.AIAdvisorRequest;
import com.fuelyn.ai.model.AIAdvisorResponse;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit tests for {@link AdvisorService} — verify the tiered fallback
 * chain, caching, and graceful degradation when no backends are
 * configured.
 */
class AdvisorServiceTest {

    // ─── Test fixtures ───────────────────────────────────────────

    private static AIAdvisorRequest sampleRequest() {
        return new AIAdvisorRequest(
                List.of(
                        new AIAdvisorRequest.StationPrice("Aral", "Aral", 1.749, 1.0),
                        new AIAdvisorRequest.StationPrice("Shell", "Shell", 1.799, 2.0),
                        new AIAdvisorRequest.StationPrice("JET", "JET", 1.819, 3.0)
                ),
                "e10", null, 52.5, 13.4, 50
        );
    }

    /** Backend that always works — flips fromAI=true and rewrites headline. */
    private static EnrichmentBackend okBackend(String name, AtomicInteger calls) {
        return new EnrichmentBackend() {
            @Override public String name() { return name; }
            @Override public boolean isAvailable() { return true; }
            @Override public AIAdvisorResponse enrich(AIAdvisorRequest req, AIAdvisorResponse base) {
                calls.incrementAndGet();
                return new AIAdvisorResponse(
                        base.action(), "[" + name + "] " + base.headline(),
                        base.explanation(), base.bestTimePrediction(),
                        base.savingsEstimate(), base.confidence(), base.bestStation(),
                        base.priceOutlook(), base.tip(), false, true);
            }
        };
    }

    /** Backend that always fails — used to test fallthrough. */
    private static EnrichmentBackend failingBackend(String name, AtomicInteger calls) {
        return new EnrichmentBackend() {
            @Override public String name() { return name; }
            @Override public boolean isAvailable() { return true; }
            @Override public AIAdvisorResponse enrich(AIAdvisorRequest req, AIAdvisorResponse base) {
                calls.incrementAndGet();
                throw new RuntimeException(name + " is broken");
            }
        };
    }

    /** Backend that reports itself unavailable — must be skipped. */
    private static EnrichmentBackend unavailableBackend(String name, AtomicInteger calls) {
        return new EnrichmentBackend() {
            @Override public String name() { return name; }
            @Override public boolean isAvailable() { return false; }
            @Override public AIAdvisorResponse enrich(AIAdvisorRequest req, AIAdvisorResponse base) {
                calls.incrementAndGet();
                throw new IllegalStateException("should not be called when unavailable");
            }
        };
    }

    // ─── Tests ───────────────────────────────────────────────────

    @Test
    void noBackends_returnsHeuristicBaseline() {
        AdvisorService svc = new AdvisorService(List.of(), true, "ollama,openai", 200, 15);
        AIAdvisorResponse r = svc.getRecommendation(sampleRequest());

        assertThat(r).isNotNull();
        assertThat(r.fromAI()).isFalse();
        assertThat(r.bestStation()).isNotNull();
        assertThat(r.bestStation().name()).isEqualTo("Aral"); // cheapest
    }

    @Test
    void enrichmentDisabled_skipsBackendsEvenWhenPresent() {
        AtomicInteger ollama = new AtomicInteger();
        AdvisorService svc = new AdvisorService(
                List.of(okBackend("ollama", ollama)),
                false, "ollama", 200, 15
        );

        AIAdvisorResponse r = svc.getRecommendation(sampleRequest());

        assertThat(r.fromAI()).isFalse();
        assertThat(ollama).hasValue(0);
    }

    @Test
    void firstBackendSucceeds_secondNotCalled() {
        AtomicInteger ollama = new AtomicInteger();
        AtomicInteger openai = new AtomicInteger();
        AdvisorService svc = new AdvisorService(
                List.of(okBackend("ollama", ollama), okBackend("openai", openai)),
                true, "ollama,openai", 200, 15
        );

        AIAdvisorResponse r = svc.getRecommendation(sampleRequest());

        assertThat(r.fromAI()).isTrue();
        assertThat(r.headline()).startsWith("[ollama]");
        assertThat(ollama).hasValue(1);
        assertThat(openai).hasValue(0);
    }

    @Test
    void firstBackendFails_secondTakesOver() {
        AtomicInteger ollama = new AtomicInteger();
        AtomicInteger openai = new AtomicInteger();
        AdvisorService svc = new AdvisorService(
                List.of(failingBackend("ollama", ollama), okBackend("openai", openai)),
                true, "ollama,openai", 200, 15
        );

        AIAdvisorResponse r = svc.getRecommendation(sampleRequest());

        assertThat(r.fromAI()).isTrue();
        assertThat(r.headline()).startsWith("[openai]");
        assertThat(ollama).hasValue(1);
        assertThat(openai).hasValue(1);
    }

    @Test
    void allBackendsFail_fallsBackToHeuristic() {
        AtomicInteger a = new AtomicInteger();
        AtomicInteger b = new AtomicInteger();
        AdvisorService svc = new AdvisorService(
                List.of(failingBackend("ollama", a), failingBackend("openai", b)),
                true, "ollama,openai", 200, 15
        );

        AIAdvisorResponse r = svc.getRecommendation(sampleRequest());

        // Heuristic always succeeds
        assertThat(r).isNotNull();
        assertThat(r.fromAI()).isFalse();
        assertThat(r.bestStation().name()).isEqualTo("Aral");
        assertThat(a).hasValue(1);
        assertThat(b).hasValue(1);
    }

    @Test
    void unavailableBackends_areSkippedSilently() {
        AtomicInteger ollama = new AtomicInteger();
        AtomicInteger openai = new AtomicInteger();
        AdvisorService svc = new AdvisorService(
                List.of(unavailableBackend("ollama", ollama), okBackend("openai", openai)),
                true, "ollama,openai", 200, 15
        );

        AIAdvisorResponse r = svc.getRecommendation(sampleRequest());

        assertThat(r.headline()).startsWith("[openai]");
        assertThat(ollama).hasValue(0);  // unavailable → not invoked
        assertThat(openai).hasValue(1);
    }

    @Test
    void cacheReturnsSameResultWithoutHittingBackend() {
        AtomicInteger calls = new AtomicInteger();
        AdvisorService svc = new AdvisorService(
                List.of(okBackend("ollama", calls)),
                true, "ollama", 200, 15
        );

        AIAdvisorResponse first = svc.getRecommendation(sampleRequest());
        AIAdvisorResponse second = svc.getRecommendation(sampleRequest());

        assertThat(calls).hasValue(1);            // backend called only once
        assertThat(second.fromCache()).isTrue();
        assertThat(second.headline()).isEqualTo(first.headline());
    }

    @Test
    void providerOrder_isApplied() {
        AtomicInteger first = new AtomicInteger();
        AtomicInteger second = new AtomicInteger();
        // Bean discovery order is [openai, ollama], but config asks for ollama,openai
        AdvisorService svc = new AdvisorService(
                List.of(okBackend("openai", first), okBackend("ollama", second)),
                true, "ollama,openai", 200, 15
        );

        AIAdvisorResponse r = svc.getRecommendation(sampleRequest());

        // ollama should win even though it was registered second
        assertThat(r.headline()).startsWith("[ollama]");
        assertThat(second).hasValue(1);
        assertThat(first).hasValue(0);
    }
}
