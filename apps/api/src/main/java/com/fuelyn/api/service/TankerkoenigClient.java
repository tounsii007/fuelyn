package com.fuelyn.api.service;

import com.fuelyn.api.model.dto.TankerkoenigResponse;
import com.fuelyn.api.model.dto.TankerkoenigResponse.TankerkoenigPrices;
import com.fuelyn.api.model.dto.TankerkoenigResponse.TankerkoenigStation;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class TankerkoenigClient {

    private static final Logger log = LoggerFactory.getLogger(TankerkoenigClient.class);
    private static final int MAX_IDS_PER_PRICE_REQUEST = 10;

    private final RestTemplate restTemplate;
    private final String baseUrl;
    private final String apiKey;

    public TankerkoenigClient(
            RestTemplate restTemplate,
            @Value("${fuelyn.tankerkoenig.base-url}") String baseUrl,
            @Value("${fuelyn.tankerkoenig.api-key}") String apiKey) {
        this.restTemplate = restTemplate;
        this.baseUrl = baseUrl;
        this.apiKey = apiKey;
    }

    public List<TankerkoenigStation> searchStations(double lat, double lng, double radiusKm) {
        String url = baseUrl + "/json/list.php?lat={lat}&lng={lng}&rad={rad}&type=all&apikey={key}&sort=dist";

        try {
            TankerkoenigResponse response = restTemplate.getForObject(
                    url, TankerkoenigResponse.class,
                    lat, lng, radiusKm, apiKey);

            if (response == null || !response.ok()) {
                log.warn("Tankerkoenig API returned error: {}",
                        response != null ? response.message() : "null response");
                return Collections.emptyList();
            }

            List<TankerkoenigStation> stations = response.stations();
            log.debug("Found {} stations near ({}, {}) within {} km", stations.size(), lat, lng, radiusKm);
            return stations != null ? stations : Collections.emptyList();

        } catch (RestClientException e) {
            log.error("Failed to search stations from Tankerkoenig API: {}", e.getMessage());
            return Collections.emptyList();
        }
    }

    public Map<String, TankerkoenigPrices> fetchPrices(List<String> stationIds) {
        if (stationIds == null || stationIds.isEmpty()) {
            return Collections.emptyMap();
        }

        Map<String, TankerkoenigPrices> allPrices = new HashMap<>();

        // Batch into groups of MAX_IDS_PER_PRICE_REQUEST
        for (int i = 0; i < stationIds.size(); i += MAX_IDS_PER_PRICE_REQUEST) {
            List<String> batch = stationIds.subList(i,
                    Math.min(i + MAX_IDS_PER_PRICE_REQUEST, stationIds.size()));
            String ids = String.join(",", batch);
            String url = baseUrl + "/json/prices.php?ids={ids}&apikey={key}";

            try {
                TankerkoenigResponse response = restTemplate.getForObject(
                        url, TankerkoenigResponse.class, ids, apiKey);

                if (response != null && response.ok() && response.prices() != null) {
                    allPrices.putAll(response.prices());
                } else {
                    log.warn("Tankerkoenig prices API returned error for batch: {}",
                            response != null ? response.message() : "null response");
                }
            } catch (RestClientException e) {
                log.error("Failed to fetch prices for batch: {}", e.getMessage());
            }
        }

        log.debug("Fetched prices for {} stations", allPrices.size());
        return allPrices;
    }

    public List<String> getStationIds(List<TankerkoenigStation> stations) {
        return stations.stream()
                .map(TankerkoenigStation::id)
                .collect(Collectors.toList());
    }
}
