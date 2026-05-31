package com.fuelyn.price.service;

import java.time.Duration;
import java.util.Collections;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import com.fuelyn.price.model.dto.ChargingStationResponse.*;

import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
import io.github.resilience4j.ratelimiter.annotation.RateLimiter;
import io.github.resilience4j.retry.annotation.Retry;

/** Resilient OpenChargeMap API client for EV charging station search. */
@Service
public class OpenChargeMapClient implements ChargingStationClient {

    private static final Logger log = LoggerFactory.getLogger(OpenChargeMapClient.class);
    private static final String OCM_BASE = "https://api.openchargemap.io/v3/poi";

    private static final Map<Integer, String> CONNECTION_TYPE_MAP =
            Map.ofEntries(
                    Map.entry(1, "Typ 1 (J1772)"),
                    Map.entry(2, "CHAdeMO"),
                    Map.entry(25, "Typ 2 (Mennekes)"),
                    Map.entry(27, "Tesla Supercharger"),
                    Map.entry(32, "CCS (Combo 1)"),
                    Map.entry(33, "CCS (Combo 2)"),
                    Map.entry(36, "Typ 2 (Steckdose)"));

    private final RestTemplate restTemplate;
    private final String apiKey;

    public OpenChargeMapClient(
            RestTemplateBuilder builder, @Value("${fuelyn.openchargemap.api-key:}") String apiKey) {
        this.restTemplate =
                builder.connectTimeout(Duration.ofSeconds(10))
                        .readTimeout(Duration.ofSeconds(10))
                        .build();
        this.apiKey = apiKey;
    }

    /** Searches for EV charging stations near the given coordinates. */
    @CircuitBreaker(name = "openchargemap", fallbackMethod = "searchChargingFallback")
    @RateLimiter(name = "external-api") // bound outbound calls to the quota'd OCM API
    @Retry(name = "tankerkoenig") // reuse retry config
    public List<ChargingStation> searchChargingStations(double lat, double lng, double radiusKm) {
        StringBuilder urlBuilder =
                new StringBuilder(OCM_BASE)
                        .append("?output=json")
                        .append("&latitude=")
                        .append(lat)
                        .append("&longitude=")
                        .append(lng)
                        .append("&distance=")
                        .append(Math.min(radiusKm, 100))
                        .append("&distanceunit=KM")
                        .append("&maxresults=100")
                        .append("&compact=true")
                        .append("&verbose=false")
                        .append("&countrycode=DE");

        if (apiKey != null && !apiKey.isBlank()) {
            urlBuilder.append("&key=").append(apiKey);
        }

        String url = urlBuilder.toString();
        log.debug("Fetching charging stations: lat={}, lng={}, radius={}km", lat, lng, radiusKm);
        long start = System.currentTimeMillis();

        ResponseEntity<List<OCMResult>> response =
                restTemplate.exchange(
                        url,
                        HttpMethod.GET,
                        null,
                        new ParameterizedTypeReference<List<OCMResult>>() {});

        long duration = System.currentTimeMillis() - start;

        // Defensive checks before any field access. OpenChargeMap can answer
        // 200 with an empty body, 204 with no body at all, or 200 with a non-
        // 2xx-equivalent payload — and a circuit-breaker recovery may yield
        // a half-deserialised response. Treat any of these as "no stations"
        // so the caller never receives a null and never NPEs.
        if (response == null || !response.getStatusCode().is2xxSuccessful()) {
            log.warn(
                    "OpenChargeMap non-success status: {}",
                    response == null ? "null" : response.getStatusCode());
            return Collections.emptyList();
        }
        List<OCMResult> results = response.getBody();
        if (results == null) {
            return Collections.emptyList();
        }

        List<ChargingStation> stations =
                results.stream()
                        .filter(r -> r.AddressInfo() != null)
                        .map(this::mapToChargingStation)
                        .toList();

        log.info("Fetched {} charging stations in {}ms", stations.size(), duration);
        return stations;
    }

    @SuppressWarnings("unused")
    private List<ChargingStation> searchChargingFallback(
            double lat, double lng, double radiusKm, Throwable t) {
        log.warn(
                "[CircuitBreaker] OpenChargeMap unavailable: {}. Returning empty.", t.getMessage());
        return Collections.emptyList();
    }

    private ChargingStation mapToChargingStation(OCMResult r) {
        OCMAddress addr = r.AddressInfo();
        List<Connection> connections =
                r.Connections() != null
                        ? r.Connections().stream().map(this::mapConnection).toList()
                        : Collections.emptyList();

        return new ChargingStation(
                String.valueOf(r.ID()),
                addr.Title() != null ? addr.Title() : "Ladestation",
                r.OperatorInfo() != null ? r.OperatorInfo().Title() : "Unbekannt",
                addr.Latitude(),
                addr.Longitude(),
                addr.Distance() != null ? addr.Distance() : 0,
                addr.AddressLine1() != null ? addr.AddressLine1() : "",
                addr.Town() != null ? addr.Town() : "",
                addr.Postcode() != null ? addr.Postcode() : "",
                connections,
                r.StatusType() == null
                        || r.StatusType().IsOperational() == null
                        || r.StatusType().IsOperational(),
                r.UsageCost(),
                r.UsageType() != null ? r.UsageType().Title() : null);
    }

    private Connection mapConnection(OCMConnection c) {
        String typeName =
                CONNECTION_TYPE_MAP.getOrDefault(
                        c.ConnectionTypeID(),
                        c.ConnectionType() != null && c.ConnectionType().Title() != null
                                ? c.ConnectionType().Title()
                                : "Typ " + c.ConnectionTypeID());

        return new Connection(typeName, c.PowerKW(), c.Quantity() != null ? c.Quantity() : 1);
    }
}
