package com.fuelyn.ai.signals;

import com.fuelyn.ai.model.AIAdvisorRequest;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;

/**
 * Trend detection that respects the German fuel-price diurnal pattern.
 *
 * <p>Tankerkönig data shows characteristic 4–6 ct evening drops around
 * 18:00–20:00 followed by an overnight slow climb. A naive linear
 * regression over 24 h would flatten that step into a meaningless
 * "0 ct/day" slope.</p>
 *
 * <p>This module returns two signals:</p>
 * <ol>
 *   <li><b>Smooth slope</b> — exponentially weighted moving average
 *       (EWMA) over recent observations, biased toward newer data.</li>
 *   <li><b>Change-point indicator</b> — CUSUM-style detector that
 *       flags whether a sharp drop happened in the last few hours.
 *       A recent "reset event" is information by itself: the price
 *       just fell, so waiting longer rarely improves things further.</li>
 * </ol>
 */
public final class EwmaChangePoint {

    public enum Direction { RISING, FALLING, STABLE }
    public enum ChangePoint { NONE, RECENT_DROP, RECENT_SPIKE }

    public record Result(
            Direction direction,
            /** EWMA-smoothed slope per day (€/day, signed). */
            double slopePerDay,
            /** Strength in [0,1] — magnitude × confidence. */
            double strength,
            ChangePoint changePoint,
            /** Hours since the change point (0 if none). */
            double hoursSinceChange
    ) {}

    /** EWMA smoothing factor — 0.4 means each new point contributes 40 %. */
    private static final double ALPHA = 0.40;
    /** Minimum drop in € that qualifies as a change point. */
    private static final double DROP_THRESHOLD = 0.025; // 2.5 ct
    /** Minimum spike in € that qualifies as a change point. */
    private static final double SPIKE_THRESHOLD = 0.025;

    private EwmaChangePoint() {}

    public static Result analyse(List<AIAdvisorRequest.PricePoint> history) {
        if (history == null || history.size() < 4) {
            return new Result(Direction.STABLE, 0, 0, ChangePoint.NONE, 0);
        }

        List<long[]> parsed = new ArrayList<>(history.size());
        // Convert to (timeMs, value) pairs and skip unparseable entries.
        for (var pt : history) {
            Long t = parseIsoMillis(pt.timestamp());
            if (t != null) parsed.add(new long[]{t, Double.doubleToLongBits(pt.price())});
        }
        if (parsed.size() < 4) {
            return new Result(Direction.STABLE, 0, 0, ChangePoint.NONE, 0);
        }
        parsed.sort((a, b) -> Long.compare(a[0], b[0]));

        long latest = parsed.get(parsed.size() - 1)[0];
        long cutoff = latest - 24L * 3_600_000L; // last 24 h
        // Trim to last-24h window when we have enough density
        List<long[]> window = new ArrayList<>();
        for (var p : parsed) if (p[0] >= cutoff) window.add(p);
        if (window.size() < 4) window = parsed;

        // ── EWMA slope ──────────────────────────────────────────
        double ewma = Double.longBitsToDouble(window.get(0)[1]);
        double smoothedFirst = ewma;
        long firstT = window.get(0)[0];
        for (int i = 1; i < window.size(); i++) {
            double v = Double.longBitsToDouble(window.get(i)[1]);
            ewma = ALPHA * v + (1 - ALPHA) * ewma;
        }
        double smoothedLast = ewma;
        double hours = Math.max(1.0, (latest - firstT) / 3_600_000.0);
        double slopePerHour = (smoothedLast - smoothedFirst) / hours;
        double slopePerDay  = slopePerHour * 24.0;

        Direction dir;
        if (Math.abs(slopePerDay) < 0.005) dir = Direction.STABLE;     // < 0.5 ct/day
        else dir = slopePerDay > 0 ? Direction.RISING : Direction.FALLING;

        // Strength: clamp magnitude / 2 ct/day to [0,1]
        double strength = Math.min(1.0, Math.abs(slopePerDay) / 0.02);

        // ── Change-point detection on raw values ────────────────
        // Look for the largest single-step drop or spike in the
        // tail (last ~6 h or last 6 points, whichever is shorter).
        int tailStart = Math.max(0, window.size() - 6);
        double maxDrop = 0;
        long dropAtT = 0;
        double maxSpike = 0;
        long spikeAtT = 0;
        for (int i = tailStart + 1; i < window.size(); i++) {
            double prev = Double.longBitsToDouble(window.get(i - 1)[1]);
            double cur  = Double.longBitsToDouble(window.get(i)[1]);
            double diff = cur - prev;
            if (diff < -maxDrop) { maxDrop = -diff; dropAtT = window.get(i)[0]; }
            if (diff >  maxSpike){ maxSpike =  diff; spikeAtT = window.get(i)[0]; }
        }

        ChangePoint cp;
        long cpAt;
        if (maxDrop >= DROP_THRESHOLD && maxDrop >= maxSpike) {
            cp = ChangePoint.RECENT_DROP;
            cpAt = dropAtT;
        } else if (maxSpike >= SPIKE_THRESHOLD) {
            cp = ChangePoint.RECENT_SPIKE;
            cpAt = spikeAtT;
        } else {
            cp = ChangePoint.NONE;
            cpAt = 0;
        }
        double hoursSince = cp == ChangePoint.NONE ? 0 : Math.max(0, (latest - cpAt) / 3_600_000.0);

        return new Result(dir, slopePerDay, strength, cp, hoursSince);
    }

    private static Long parseIsoMillis(String iso) {
        try { return OffsetDateTime.parse(iso).toInstant().toEpochMilli(); }
        catch (DateTimeParseException ignored) {}
        try { return Instant.parse(iso).toEpochMilli(); }
        catch (DateTimeParseException ignored) {}
        return null;
    }
}
