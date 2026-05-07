package com.fuelyn.ai.signals;

import java.util.Locale;
import java.util.Map;

/**
 * Brand-level loyalty / affiliate rebates (€ off per litre).
 *
 * <p>Example real-world programmes (rough averages 2024–2026):</p>
 * <ul>
 *   <li>ADAC member: 1 ct/L at participating Aral, JET, Avia</li>
 *   <li>Aral Comfort App: 2 ct/L on first fill of the day</li>
 *   <li>Shell ClubSmart: 1 ct/L equivalent in points</li>
 *   <li>HEM Card: 2 ct/L</li>
 * </ul>
 *
 * <p>The advisor applies these as an effective-price discount when the
 * caller signals a programme via the (future) {@code activePartners}
 * field. For now we expose a static lookup keyed by lowercased brand
 * name — easy to extend per user later.</p>
 */
public final class AffiliateRebate {

    /** Default €-discount per litre for popular German brand programmes. */
    private static final Map<String, Double> DEFAULTS = Map.ofEntries(
            Map.entry("aral",         0.02),
            Map.entry("shell",        0.01),
            Map.entry("jet",          0.01),
            Map.entry("avia",         0.01),
            Map.entry("hem",          0.02),
            Map.entry("totalenergies",0.01),
            Map.entry("total",        0.01),
            Map.entry("esso",         0.01)
    );

    private AffiliateRebate() {}

    /**
     * Returns the per-litre rebate for a brand, or 0 if none.
     *
     * @param brand            free-form brand string (case-insensitive)
     * @param userHasMembership true if the caller's vehicle profile
     *        opted into loyalty discounts. If false we return 0
     *        (no programme assumed) so that conservative — never
     *        promise savings the user can't actually claim.
     */
    public static double perLitre(String brand, boolean userHasMembership) {
        if (!userHasMembership || brand == null || brand.isBlank()) return 0.0;
        return DEFAULTS.getOrDefault(brand.trim().toLowerCase(Locale.ROOT), 0.0);
    }
}
