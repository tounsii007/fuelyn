package com.fuelyn.ai.controller;

import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import com.fuelyn.ai.anomaly.AnomalyBroadcaster;

/**
 * Phase C1 — SSE stream for live price-anomaly notifications.
 *
 * <p>Clients (browser EventSource, mobile push-relay, ops dashboard) subscribe via {@code GET
 * /api/v1/anomalies/stream}. The connection stays open until either side hangs up; on each detected
 * anomaly the server writes one event with name {@code anomaly} and a JSON body matching {@link
 * com.fuelyn.ai.anomaly.PriceAnomalyDetector.Anomaly}.
 *
 * <p>Auth note: the gateway's HMAC + JWT validation already protects this endpoint. No additional
 * check here.
 */
@RestController
@RequestMapping("/api/v1/anomalies")
public class AnomalyStreamController {

    private final AnomalyBroadcaster broadcaster;

    public AnomalyStreamController(AnomalyBroadcaster broadcaster) {
        this.broadcaster = broadcaster;
    }

    @GetMapping(path = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter stream() {
        return broadcaster.subscribe();
    }
}
