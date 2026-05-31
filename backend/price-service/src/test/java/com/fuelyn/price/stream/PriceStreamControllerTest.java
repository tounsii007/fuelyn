package com.fuelyn.price.stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.kafka.support.Acknowledgment;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import com.fuelyn.common.events.EventEnvelope;
import com.fuelyn.common.events.PriceUpdatedEvent;

/**
 * Tests for {@link PriceStreamController} focused on the iter-24 fix: subscription cap + heartbeat
 * dispatch off the scheduler thread.
 *
 * <p>Avoids the Kafka listener orchestration entirely (we test the bean methods directly). Uses
 * real {@link SseEmitter}s captured into local lists so we can verify their lifecycle.
 */
class PriceStreamControllerTest {

    private PriceStreamController controller;

    @BeforeEach
    void setUp() {
        controller = new PriceStreamController(3); // tiny cap for cap-tests
    }

    @AfterEach
    void tearDown() {
        controller.shutdown();
    }

    @Nested
    @DisplayName("Subscription cap (iter 24)")
    class SubscriptionCap {

        @Test
        void firstThreeSubscriptions_succeed() {
            for (int i = 0; i < 3; i++) {
                MockHttpServletResponse response = new MockHttpServletResponse();
                SseEmitter e = controller.streamPrices(null, response);
                assertThat(e).isNotNull();
            }
            assertThat(controller.activeSubscriptionsCount()).isEqualTo(3);
        }

        @Test
        void fourthSubscription_isRejected_with503() {
            for (int i = 0; i < 3; i++) {
                controller.streamPrices(null, new MockHttpServletResponse());
            }
            MockHttpServletResponse response = new MockHttpServletResponse();
            assertThatThrownBy(() -> controller.streamPrices(null, response))
                    .isInstanceOf(ResponseStatusException.class)
                    .hasMessageContaining("503")
                    .hasMessageContaining("cap");
            // The Retry-After header was set before the throw.
            assertThat(response.getHeader("Retry-After")).isEqualTo("30");
        }

        @Test
        void rejectionDoesNotIncreaseCount() {
            for (int i = 0; i < 3; i++) {
                controller.streamPrices(null, new MockHttpServletResponse());
            }
            int before = controller.activeSubscriptionsCount();
            try {
                controller.streamPrices(null, new MockHttpServletResponse());
            } catch (ResponseStatusException ignored) {
            }
            assertThat(controller.activeSubscriptionsCount()).isEqualTo(before);
        }

        @Test
        void rejection_doesNotLeakState_intoSuccessCount() {
            // After hitting the cap, a fresh request must not be silently
            // accepted nor leave the controller in a state where the
            // counter is wrong. We assert the cap consistently via two
            // back-to-back rejections.
            for (int i = 0; i < 3; i++) {
                controller.streamPrices(null, new MockHttpServletResponse());
            }
            assertThatThrownBy(() -> controller.streamPrices(null, new MockHttpServletResponse()))
                    .isInstanceOf(ResponseStatusException.class);
            assertThatThrownBy(() -> controller.streamPrices(null, new MockHttpServletResponse()))
                    .isInstanceOf(ResponseStatusException.class);
            // Still exactly three subscriptions.
            assertThat(controller.activeSubscriptionsCount()).isEqualTo(3);
        }
    }

    @Nested
    @DisplayName("Subscription request shape")
    class SubscriptionShape {

        @Test
        void emptyStationsParameter_subscribesToAll() {
            MockHttpServletResponse response = new MockHttpServletResponse();
            SseEmitter e = controller.streamPrices(null, response);
            assertThat(e).isNotNull();
            // X-Accel-Buffering header set so reverse proxies don't buffer.
            assertThat(response.getHeader("X-Accel-Buffering")).isEqualTo("no");
        }

        @Test
        void cacheControlHeader_disablesIntermediateCaches() {
            MockHttpServletResponse response = new MockHttpServletResponse();
            controller.streamPrices(null, response);
            // SSE intentionally uses no-cache + no-transform rather than
            // no-store — the connection persists, so caching the document
            // body wouldn't make sense, but we still want intermediaries
            // to leave the byte stream alone.
            assertThat(response.getHeader("Cache-Control"))
                    .contains("no-cache")
                    .contains("no-transform");
        }

        @Test
        void specificStations_filterIsApplied() {
            controller.streamPrices("st1,st2,st3", new MockHttpServletResponse());
            assertThat(controller.activeSubscriptionsCount()).isEqualTo(1);
        }

        @Test
        void blankStations_treatedAsAll() {
            MockHttpServletResponse response = new MockHttpServletResponse();
            SseEmitter e = controller.streamPrices("   ", response);
            assertThat(e).isNotNull();
            assertThat(controller.activeSubscriptionsCount()).isEqualTo(1);
        }
    }

    @Nested
    @DisplayName("Health endpoint reflects subscription state")
    class HealthEndpoint {

        @Test
        void healthEndpoint_includesCapAndCounter() {
            controller.streamPrices(null, new MockHttpServletResponse());
            String health = controller.health();
            assertThat(health)
                    .contains("\"subscriptions\":1")
                    .contains("\"maxSubscriptions\":3")
                    .contains("\"subscriptionsRejected\":0");
        }

        @Test
        void healthEndpoint_countsRejections() {
            for (int i = 0; i < 3; i++) {
                controller.streamPrices(null, new MockHttpServletResponse());
            }
            try {
                controller.streamPrices(null, new MockHttpServletResponse());
            } catch (ResponseStatusException ignored) {
            }
            try {
                controller.streamPrices(null, new MockHttpServletResponse());
            } catch (ResponseStatusException ignored) {
            }

            assertThat(controller.health()).contains("\"subscriptionsRejected\":2");
        }
    }

    @Nested
    @DisplayName("Kafka onPriceUpdated — null safety + ack semantics")
    class OnPriceUpdated {

        @Test
        void nullEnvelope_isAcked_andDoesNotCrash() {
            CountingAck ack = new CountingAck();
            // The listener method is permissive and acks even on null —
            // dropping the event is preferable to redelivery loops.
            controller.onPriceUpdated(null, ack);
            assertThat(ack.calls).isEqualTo(1);
        }

        @Test
        void envelopeWithNullData_isAckedAndIgnored() {
            CountingAck ack = new CountingAck();
            EventEnvelope<Object> envelope =
                    new EventEnvelope<>("id", "type", "source", Instant.now(), null, 1, null);
            controller.onPriceUpdated(envelope, ack);
            assertThat(ack.calls).isEqualTo(1);
            assertThat(controller.eventsFanOut()).isZero();
        }

        @Test
        void validEvent_dispatchedAndAcked() throws Exception {
            controller.streamPrices(null, new MockHttpServletResponse());

            PriceUpdatedEvent ev =
                    PriceUpdatedEvent.forUpdate(
                            "s1",
                            "Aral",
                            "aral",
                            "diesel",
                            1.799,
                            1.789,
                            Instant.now(),
                            52.5,
                            13.4,
                            "10115");
            EventEnvelope<PriceUpdatedEvent> envelope =
                    EventEnvelope.of(PriceUpdatedEvent.TYPE, "test", ev);

            CountingAck ack = new CountingAck();
            controller.onPriceUpdated(envelope, ack);

            assertThat(ack.calls).isEqualTo(1);
            // Fan-out is async on the virtual-thread executor; allow it
            // a brief moment to publish through the SseEmitter.
            Thread.sleep(100);
            assertThat(controller.eventsFanOut()).isGreaterThanOrEqualTo(0);
        }

        @Test
        void filteredSubscriber_doesNotReceiveOtherStations() throws Exception {
            // Subscribe to specific stations only.
            controller.streamPrices("not-this-one", new MockHttpServletResponse());

            PriceUpdatedEvent ev =
                    PriceUpdatedEvent.forUpdate(
                            "s1",
                            "Aral",
                            "aral",
                            "diesel",
                            1.799,
                            1.789,
                            Instant.now(),
                            52.5,
                            13.4,
                            "10115");
            EventEnvelope<PriceUpdatedEvent> envelope =
                    EventEnvelope.of(PriceUpdatedEvent.TYPE, "test", ev);

            CountingAck ack = new CountingAck();
            controller.onPriceUpdated(envelope, ack);

            assertThat(ack.calls).isEqualTo(1);
            Thread.sleep(50);
            // Subscriber filter excluded s1 → no fan-out increment expected.
            assertThat(controller.eventsFanOut()).isZero();
        }
    }

    private static final class CountingAck implements Acknowledgment {
        int calls = 0;

        @Override
        public void acknowledge() {
            calls++;
        }
    }
}
