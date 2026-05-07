package com.fuelyn.price.controller;

import com.fuelyn.common.dto.ApiResponse;
import com.fuelyn.price.model.dto.TankerkoenigResponse;
import com.fuelyn.price.service.TankerkoenigClient;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Proxy endpoints for Tankerkoenig API — stations search, detail, and batch prices.
 * Keeps API keys server-side and adds circuit breaker / rate limiting.
 */
@RestController
@RequestMapping("/api/v1/prices")
@Validated
public class StationProxyController {

    private static final Logger log = LoggerFactory.getLogger(StationProxyController.class);

    private final TankerkoenigClient tankerkoenigClient;

    public StationProxyController(TankerkoenigClient tankerkoenigClient) {
        this.tankerkoenigClient = tankerkoenigClient;
    }

    /**
     * GET /api/v1/prices/stations?lat=...&lng=...&rad=5&type=e10&sort=dist
     * Proxies Tankerkoenig list.php — searches stations by location.
     */
    @GetMapping("/stations")
    public ResponseEntity<ApiResponse<Map<String, Object>>> searchStations(
            @RequestParam @Min(-90) @Max(90) double lat,
            @RequestParam @Min(-180) @Max(180) double lng,
            @RequestParam(defaultValue = "5") @Min(1) @Max(25) double rad,
            @RequestParam(defaultValue = "e10") @Pattern(regexp = "diesel|e5|e10") String type,
            @RequestParam(defaultValue = "dist") @Pattern(regexp = "price|dist") String sort
    ) {
        log.info("Station search: lat={}, lng={}, rad={}, type={}, sort={}", lat, lng, rad, type, sort);

        List<TankerkoenigResponse.Station> stations = tankerkoenigClient.searchStations(lat, lng, rad);

        // Filter by fuel type and sort
        List<TankerkoenigResponse.Station> filtered = stations.stream()
                .filter(s -> {
                    Double price = switch (type) {
                        case "diesel" -> s.diesel();
                        case "e5" -> s.e5();
                        case "e10" -> s.e10();
                        default -> s.e10();
                    };
                    return price != null && price > 0;
                })
                .sorted((a, b) -> {
                    if ("price".equals(sort)) {
                        Double priceA = getPrice(a, type);
                        Double priceB = getPrice(b, type);
                        return Double.compare(
                                priceA != null ? priceA : Double.MAX_VALUE,
                                priceB != null ? priceB : Double.MAX_VALUE
                        );
                    }
                    return Double.compare(a.dist(), b.dist());
                })
                .toList();

        List<Map<String, Object>> mapped = filtered.stream()
                .map(StationProxyController::mapStationWithPrices)
                .toList();

        return ResponseEntity.ok(ApiResponse.success(Map.of("stations", mapped)));
    }

    /**
     * GET /api/v1/prices/stations/{id}
     * Proxies Tankerkoenig detail.php — fetches a single station's details.
     */
    @GetMapping("/stations/{id}")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getStationDetail(
            @PathVariable @NotBlank String id
    ) {
        log.info("Station detail: id={}", id);

        TankerkoenigResponse.Station station = tankerkoenigClient.fetchStationDetail(id);

        if (station == null) {
            return ResponseEntity.notFound().build();
        }

        return ResponseEntity.ok(ApiResponse.success(Map.of("station", mapStationWithPrices(station))));
    }

    /**
     * GET /api/v1/prices/batch?ids=id1,id2,...
     * Proxies Tankerkoenig prices.php — batch price fetch for up to 10 stations.
     */
    @GetMapping("/batch")
    public ResponseEntity<ApiResponse<Map<String, Object>>> batchPrices(
            @RequestParam @NotBlank @Size(max = 400, message = "ids parameter too long") String ids
    ) {
        List<String> idList = List.of(ids.split(","));
        if (idList.isEmpty() || idList.size() > 10) {
            return ResponseEntity.badRequest()
                    .body(ApiResponse.error("Provide 1-10 station IDs"));
        }

        log.info("Batch price fetch: {} stations", idList.size());

        Map<String, TankerkoenigResponse.PriceEntry> prices = tankerkoenigClient.fetchPrices(idList);
        return ResponseEntity.ok(ApiResponse.success(Map.of("prices", prices)));
    }

    private Double getPrice(TankerkoenigResponse.Station station, String fuelType) {
        return switch (fuelType) {
            case "diesel" -> station.diesel();
            case "e5" -> station.e5();
            case "e10" -> station.e10();
            default -> station.e10();
        };
    }

    /**
     * Maps a Tankerkoenig Station to a frontend-compatible structure
     * with nested prices and address objects.
     */
    private static Map<String, Object> mapStationWithPrices(TankerkoenigResponse.Station s) {
        Map<String, Object> map = new HashMap<>();
        map.put("id", s.id());
        map.put("name", s.name());
        map.put("brand", s.brand() != null ? s.brand() : "");
        map.put("street", s.street() != null ? s.street() : "");
        map.put("houseNumber", s.houseNumber() != null ? s.houseNumber() : "");
        map.put("postCode", s.postCode() != null ? s.postCode() : "");
        map.put("place", s.place() != null ? s.place() : "");
        map.put("lat", s.lat());
        map.put("lng", s.lng());
        map.put("dist", s.dist());
        map.put("isOpen", s.isOpen());

        Map<String, Object> prices = new HashMap<>();
        prices.put("diesel", s.diesel());
        prices.put("e5", s.e5());
        prices.put("e10", s.e10());
        map.put("prices", prices);

        return map;
    }
}
