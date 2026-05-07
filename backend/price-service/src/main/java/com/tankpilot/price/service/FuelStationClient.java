package com.tankpilot.price.service;

import java.util.List;
import java.util.Map;

import com.tankpilot.price.model.dto.TankerkoenigResponse;

/**
 * Abstraction over a fuel-station price provider (today: Tankerkoenig).
 *
 * <p>Defining an interface here serves three purposes:
 *
 * <ol>
 *   <li><b>Testability</b> — services can be unit-tested with a Mockito mock of
 *       this interface without needing the inline mock-maker (which requires
 *       byte-code rewriting and breaks under fresh JDKs).
 *   <li><b>Substitutability</b> — alternative providers (Clever-Tanken, MTS-K
 *       feeds, regional government APIs) can be plugged in without touching
 *       service or controller code.
 *   <li><b>Architectural clarity</b> — the dependency arrow points at the
 *       interface, not at the concrete HTTP client, decoupling business logic
 *       from transport concerns.
 * </ol>
 */
public interface FuelStationClient {

    /** Returns stations within {@code radiusKm} of the given coordinate. */
    List<TankerkoenigResponse.Station> searchStations(double lat, double lng, double radiusKm);

    /** Returns full details for a single station, or {@code null} if unknown. */
    TankerkoenigResponse.Station fetchStationDetail(String stationId);

    /** Batch-fetches current prices for up to 10 station IDs. */
    Map<String, TankerkoenigResponse.PriceEntry> fetchPrices(List<String> stationIds);
}
