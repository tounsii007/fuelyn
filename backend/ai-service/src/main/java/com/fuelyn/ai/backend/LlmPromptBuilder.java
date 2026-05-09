package com.fuelyn.ai.backend;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fuelyn.ai.model.AIAdvisorRequest;
import com.fuelyn.ai.model.AIAdvisorResponse;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.Locale;

/**
 * Shared prompt construction for LLM enrichment backends.
 *
 * <p>Both Ollama and OpenAI backends produce identical prompts so that
 * switching between providers has no semantic impact on the output —
 * only on quality and latency.</p>
 *
 * <h3>Design</h3>
 * <ul>
 *   <li>The system prompt fixes the role, the JSON schema, and the
 *       hard rule that the model must NOT touch structured fields.</li>
 *   <li>The user prompt embeds the heuristic verdict as <b>fixed
 *       facts</b> the model must respect, plus the raw market data
 *       so the model has enough context to write something useful.</li>
 *   <li>Output is a small JSON object with five string fields. A
 *       3B-parameter model handles this size reliably.</li>
 * </ul>
 */
public final class LlmPromptBuilder {

    private static final String[] DAYS_DE = {
            "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"
    };

    /** Maximum chars of user prompt sent to the model. */
    private static final int MAX_USER_PROMPT = 4_000;

    private LlmPromptBuilder() {}

    /**
     * Returns the shared system prompt that constrains the model to
     * narrative enrichment only.
     */
    public static String systemPrompt() {
        return """
                Du bist ein freundlicher KI-Tank-Berater für die App "Fuelyn".
                Eine deterministische Heuristik hat bereits entschieden — du
                formulierst NUR die Begründungs-Texte in flüssigem, präzisem
                Deutsch um.

                Du DARFST NICHT verändern:
                - die Empfehlung (action, savingsEstimate, bestStation, confidence)
                - irgendwelche Zahlen
                Du DARFST formulieren:
                - headline (max 30 Zeichen, knackig)
                - explanation (1–2 Sätze, sachlich)
                - tip (ein praktischer Hinweis)
                - priceOutlook (kurzer 24h-Ausblick)
                - bestTimePrediction (wann wäre der ideale Zeitpunkt)

                Antworte AUSSCHLIESSLICH als valides JSON nach diesem Schema:
                {
                  "headline": "string",
                  "explanation": "string",
                  "tip": "string",
                  "priceOutlook": "string",
                  "bestTimePrediction": "string"
                }
                Kein Markdown, keine Code-Fences, kein Kommentar — nur das JSON.
                """;
    }

    /**
     * Builds the user prompt embedding the heuristic baseline as fixed
     * facts plus the raw market data for context.
     */
    public static String userPrompt(AIAdvisorRequest request,
                                    AIAdvisorResponse baseline,
                                    ObjectMapper mapper) {
        StringBuilder sb = new StringBuilder(1_024);

        sb.append("FIXIERTE Heuristik-Empfehlung (NICHT verändern):\n");
        sb.append("- action: ").append(baseline.action()).append("\n");
        sb.append("- savingsEstimate: ")
                .append(String.format(Locale.GERMANY, "%.2f", baseline.savingsEstimate())).append(" €\n");
        sb.append("- confidence: ").append(baseline.confidence()).append("\n");
        if (baseline.bestStation() != null) {
            sb.append("- bestStation: ").append(baseline.bestStation().name())
                    .append(" — ").append(baseline.bestStation().reason()).append("\n");
        }
        sb.append("- bisherige Erklärung (kannst du verbessern): ")
                .append(baseline.explanation()).append("\n\n");

        sb.append("Markt-Kontext:\n");
        sb.append("- Kraftstoff: ").append(request.fuelType()).append("\n");
        sb.append("- Tankmenge: ").append(request.fillUpLiters() == null ? 50 : request.fillUpLiters()).append(" L\n");
        sb.append("- Wochentag: ").append(DAYS_DE[LocalDate.now().getDayOfWeek().getValue() - 1]).append("\n");
        sb.append("- Uhrzeit: ").append(LocalTime.now().getHour()).append(" Uhr\n");

        if (request.prices() != null && !request.prices().isEmpty()) {
            sb.append("- Aktuelle Preise (Top 10):\n");
            request.prices().stream().limit(10).forEach(p ->
                    sb.append("    • ").append(p.stationName())
                            .append(" (").append(p.brand()).append("): ")
                            .append(String.format(Locale.GERMANY, "%.3f €", p.price()))
                            .append(", ").append(String.format(Locale.GERMANY, "%.1f km", p.distance()))
                            .append("\n"));
        }
        if (request.priceHistory() != null && !request.priceHistory().isEmpty()) {
            // Aggregated summary first — gives the LLM a one-glance read
            // on the buffered window before it parses the raw points.
            // Mean ± stddev + min/max bound the noise floor; the latest
            // price's z-score tells the model whether the current price
            // is unusual *for this station*, not just vs. its neighbours.
            var hist = request.priceHistory();
            double sum = 0, min = Double.POSITIVE_INFINITY, max = Double.NEGATIVE_INFINITY;
            for (var h : hist) {
                sum += h.price();
                if (h.price() < min) min = h.price();
                if (h.price() > max) max = h.price();
            }
            double mean = sum / hist.size();
            double sumSq = 0;
            for (var h : hist) {
                double d = h.price() - mean;
                sumSq += d * d;
            }
            double stdDev = hist.size() > 1 ? Math.sqrt(sumSq / (hist.size() - 1)) : 0;
            double latest = hist.get(hist.size() - 1).price();
            double z = stdDev > 1e-6 ? (latest - mean) / stdDev : 0;
            sb.append(String.format(Locale.GERMANY,
                    "- Preisverlauf-Aggregat (n=%d): min %.3f € / Ø %.3f € (σ %.4f) / max %.3f €. "
                            + "Aktuell %.3f € → z=%.2f.%n",
                    hist.size(), min, mean, stdDev, max, latest, z));
            sb.append("- Preisverlauf (Auszug):\n");
            hist.stream().limit(10).forEach(h ->
                    sb.append("    • ").append(h.timestamp())
                            .append(": ").append(String.format(Locale.GERMANY, "%.3f €", h.price()))
                            .append("\n"));
        }

        String full = sanitize(sb.toString());
        return full.length() > MAX_USER_PROMPT ? full.substring(0, MAX_USER_PROMPT) : full;
    }

    /**
     * Strip control characters and obvious prompt-injection trigger
     * words. Note: this is defense-in-depth on top of input validation
     * at the controller layer.
     */
    private static String sanitize(String input) {
        return input
                .replaceAll("[\\x00-\\x1F\\x7F]", "")
                .replaceAll("(?i)(ignore previous|forget instructions|pretend you are)", "[filtered]");
    }

    /**
     * Merge the LLM's narrative-only response into the heuristic
     * baseline. Any field missing or empty in the LLM output falls
     * back to the baseline value, so a partial answer never produces
     * blanks in the UI.
     */
    public static AIAdvisorResponse mergeNarrative(AIAdvisorResponse baseline, NarrativeFields llm) {
        return new AIAdvisorResponse(
                baseline.action(),
                pick(llm.headline(), baseline.headline()),
                pick(llm.explanation(), baseline.explanation()),
                pick(llm.bestTimePrediction(), baseline.bestTimePrediction()),
                baseline.savingsEstimate(),
                baseline.confidence(),
                baseline.bestStation(),
                pick(llm.priceOutlook(), baseline.priceOutlook()),
                pick(llm.tip(), baseline.tip()),
                false,
                true
        );
    }

    private static String pick(String llmValue, String baselineValue) {
        return (llmValue == null || llmValue.isBlank()) ? baselineValue : llmValue.trim();
    }

    /**
     * Narrative-only fields produced by the LLM. Mirrors the JSON
     * schema in the system prompt.
     */
    public record NarrativeFields(
            String headline,
            String explanation,
            String tip,
            String priceOutlook,
            String bestTimePrediction
    ) {}
}
