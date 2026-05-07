package com.fuelyn.price.service;

import java.util.List;

import com.fuelyn.price.model.dto.ChargingStationResponse.ChargingStation;

/** Abstraction over an EV charging-station provider (today: OpenChargeMap). */
public interface ChargingStationClient {

    List<ChargingStation> searchChargingStations(double lat, double lng, double radiusKm);
}
