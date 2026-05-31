package com.fuelyn.common.geo;

/**
 * Centralised bounding box for the German service area.
 *
 * <p>The same four constants used to live inline in three places ({@code
 * TankerkoenigClient.searchStations}, {@code PriceCollectorService.resolveCities}, and the bean
 * validation on every {@code @RequestParam double lat}). When the tolerance ever needed to extend
 * (e.g. to include Liechtenstein for cross- border petrol or border tankstellen on Konstanz/Lake
 * Constance), three separate edits had to stay in lockstep — easy to miss one.
 *
 * <p>Bounds are deliberately a touch wider than the political border to include stations directly
 * on the frontier and to absorb rounding error from upstream geocoders. Callers that need stricter
 * checks should still impose them locally; this is the floor.
 */
public final class GermanyBounds {

    /** Southernmost latitude (just south of Oberstdorf, Allgäu). */
    public static final double MIN_LAT = 47.0;

    /** Northernmost latitude (just north of List on Sylt). */
    public static final double MAX_LAT = 55.0;

    /** Westernmost longitude (a touch west of Aachen / Belgian border). */
    public static final double MIN_LNG = 5.5;

    /** Easternmost longitude (just east of Görlitz / Polish border). */
    public static final double MAX_LNG = 15.5;

    private GermanyBounds() {}

    /** True iff the coordinate is inside (inclusive) the bounding box. */
    public static boolean contains(double lat, double lng) {
        return lat >= MIN_LAT && lat <= MAX_LAT && lng >= MIN_LNG && lng <= MAX_LNG;
    }
}
