package com.fuelyn.ai.signals;

import com.fuelyn.ai.model.AIAdvisorRequest;

/**
 * Detour penalty for stations off-route.
 *
 * <p>When the user supplies a destination, a station's relevant
 * "distance" is no longer the as-the-crow-flies distance from the
 * current position — it's the <i>extra</i> distance you'd drive
 * versus going straight to the destination.</p>
 *
 * <p>Without a routing engine we approximate the detour as
 * {@code (origin → station) + (station → destination) − (origin → destination)},
 * all using the haversine formula. That's an over-estimate on
 * curving roads but a good first-order signal — and zero-cost.</p>
 */
public final class RoutePenalty {

    private static final double EARTH_KM = 6371.0;

    public record Detour(double directKm, double viaStationKm, double extraKm) {}

    private RoutePenalty() {}

    public static Detour compute(double originLat, double originLng,
                                 AIAdvisorRequest.StationPrice station,
                                 AIAdvisorRequest.Destination dest) {
        if (dest == null || station.lat() == null || station.lng() == null) {
            // No route knowledge → fall back to the user-relative distance.
            // Treat the straight line origin→dest as 0 (no actual route)
            // so the extra is just the station distance from origin.
            return new Detour(0, station.distance(), station.distance());
        }
        double a = haversine(originLat, originLng, dest.lat(), dest.lng());
        double b = haversine(originLat, originLng, station.lat(), station.lng())
                + haversine(station.lat(), station.lng(), dest.lat(), dest.lng());
        double extra = Math.max(0, b - a);
        return new Detour(a, b, extra);
    }

    private static double haversine(double lat1, double lng1, double lat2, double lng2) {
        double dLat = Math.toRadians(lat2 - lat1);
        double dLng = Math.toRadians(lng2 - lng1);
        double s1 = Math.sin(dLat / 2);
        double s2 = Math.sin(dLng / 2);
        double a = s1 * s1
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2)) * s2 * s2;
        return EARTH_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
}
