package com.fuelyn.price.service;

import com.fuelyn.price.model.dto.TankerkoenigResponse;
import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
import io.github.resilience4j.ratelimiter.annotation.RateLimiter;
import io.github.resilience4j.retry.annotation.Retry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.time.Duration;
import java.util.Collections;
import java.util.List;
import java.util.Map;

/**
 * Resilient Tankerkoenig API client with circuit breaker, retry, and rate limiting.
 *
 * <h3>Fault Tolerance:</h3>
 * <ul>
 *   <li>{@code @CircuitBreaker} &mdash; Opens after 50% failures in 10-call window, waits 30s</li>
 *   <li>{@code @Retry} &mdash; 3 attempts with exponential backoff (2s, 4s, 8s)</li>
 *   <li>{@code @RateLimiter} &mdash; Max 30 calls/minute to respect API limits</li>
 * </ul>
 */
@Service
public class TankerkoenigClient implements FuelStationClient {

    private static final Logger log = LoggerFactory.getLogger(TankerkoenigClient.class);

    private final RestTemplate restTemplate;
    private final String baseUrl;
    private final String apiKey;

    public TankerkoenigClient(
            RestTemplateBuilder builder,
            @Value("${fuelyn.tankerkoenig.base-url}") String baseUrl,
            @Value("${fuelyn.tankerkoenig.api-key}") String apiKey,
            @Value("${fuelyn.tankerkoenig.timeout-ms:10000}") int timeoutMs
    ) {
        this.restTemplate = builder
                .connectTimeout(Duration.ofMillis(timeoutMs))
                .readTimeout(Duration.ofMillis(timeoutMs))
                .build();
        this.baseUrl = baseUrl;
        this.apiKey = apiKey;
    }

    /**
     * Searches for fuel stations within a radius around the given coordinates.
     *
     * @param lat      latitude (must be within Germany: 47.0-55.0)
     * @param lng      longitude (must be within Germany: 5.5-15.5)
     * @param radiusKm search radius in kilometers (1-25)
     * @return list of stations with current prices
     */
    @CircuitBreaker(name = "tankerkoenig", fallbackMethod = "searchStationsFallback")
    @Retry(name = "tankerkoenig")
    @RateLimiter(name = "external-api")
    public List<TankerkoenigResponse.Station> searchStations(double lat, double lng, double radiusKm) {
        if (lat < 47.0 || lat > 55.0 || lng < 5.5 || lng > 15.5) {
            log.warn("Coordinates ({}, {}) outside Germany bounds, skipping", lat, lng);
            return Collections.emptyList();
        }

        String url = baseUrl + "/json/list.php?lat={lat}&lng={lng}&rad={rad}&type=all&apikey={key}&sort=dist";

        log.debug("Fetching stations: lat={}, lng={}, radius={}km", lat, lng, radiusKm);
        long start = System.currentTimeMillis();

        TankerkoenigResponse.ListResponse response = restTemplate.getForObject(
                url, TankerkoenigResponse.ListResponse.class,
                lat, lng, radiusKm, apiKey
        );

        long duration = System.currentTimeMillis() - start;

        if (response == null || !response.ok()) {
            log.error("Tankerkoenig API error: {}", response != null ? response.message() : "null response");
            return Collections.emptyList();
        }

        List<TankerkoenigResponse.Station> stations = response.stations() != null
                ? response.stations() : Collections.emptyList();

        log.info("Fetched {} stations in {}ms (lat={}, lng={}, rad={}km)",
                stations.size(), duration, lat, lng, radiusKm);

        return stations;
    }

    /**
     * Fallback when Tankerkoenig API is unavailable (circuit breaker open).
     */
    @SuppressWarnings("unused")
    private List<TankerkoenigResponse.Station> searchStationsFallback(
            double lat, double lng, double radiusKm, Throwable t) {
        log.warn("[CircuitBreaker] Tankerkoenig API unavailable: {}. Returning empty.", t.getMessage());
        return Collections.emptyList();
    }

    /**
     * Fetches detail for a single station by ID.
     */
    @CircuitBreaker(name = "tankerkoenig", fallbackMethod = "fetchStationDetailFallback")
    @Retry(name = "tankerkoenig")
    @RateLimiter(name = "external-api")
    public TankerkoenigResponse.Station fetchStationDetail(String stationId) {
        String url = baseUrl + "/json/detail.php?id={id}&apikey={key}";

        log.debug("Fetching station detail: id={}", stationId);

        TankerkoenigResponse.DetailResponse response = restTemplate.getForObject(
                url, TankerkoenigResponse.DetailResponse.class, stationId, apiKey
        );

        if (response == null || !response.ok()) {
            log.error("Station detail API error: {}", response != null ? response.message() : "null");
            return null;
        }

        return response.station();
    }

    @SuppressWarnings("unused")
    private TankerkoenigResponse.Station fetchStationDetailFallback(String stationId, Throwable t) {
        log.warn("[CircuitBreaker] Station detail failed for {}: {}", stationId, t.getMessage());
        return null;
    }

    /**
     * Batch-fetches current prices for up to 10 station IDs.
     *
     * <p>Decorated with the same {@code external-api} rate limiter as the
     * sibling search/detail methods — without it, a bursty caller (e.g. a
     * favourites-list refresh that fans out to 50 stations in 5 batches)
     * could blow Tankerkönig's per-key quota independently of the limit
     * applied everywhere else in this service.</p>
     */
    @CircuitBreaker(name = "tankerkoenig", fallbackMethod = "fetchPricesFallback")
    @Retry(name = "tankerkoenig")
    @RateLimiter(name = "external-api")
    public Map<String, TankerkoenigResponse.PriceEntry> fetchPrices(List<String> stationIds) {
        if (stationIds == null || stationIds.isEmpty()) {
            return Collections.emptyMap();
        }

        List<String> batch = stationIds.size() > 10 ? stationIds.subList(0, 10) : stationIds;
        String ids = String.join(",", batch);
        String url = baseUrl + "/json/prices.php?ids={ids}&apikey={key}";

        TankerkoenigResponse.PricesResponse response = restTemplate.getForObject(
                url, TankerkoenigResponse.PricesResponse.class, ids, apiKey
        );

        if (response == null || !response.ok() || response.prices() == null) {
            return Collections.emptyMap();
        }

        return response.prices();
    }

    @SuppressWarnings("unused")
    private Map<String, TankerkoenigResponse.PriceEntry> fetchPricesFallback(
            List<String> stationIds, Throwable t) {
        log.warn("[CircuitBreaker] Price fetch failed: {}", t.getMessage());
        return Collections.emptyMap();
    }
}
