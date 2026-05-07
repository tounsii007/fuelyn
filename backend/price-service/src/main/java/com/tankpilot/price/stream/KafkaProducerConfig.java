package com.tankpilot.price.stream;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.common.serialization.StringSerializer;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.core.DefaultKafkaProducerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.core.ProducerFactory;
import org.springframework.kafka.support.serializer.JsonSerializer;

import java.util.HashMap;
import java.util.Map;

/**
 * Kafka producer configuration for price-service.
 *
 * <p>The bean is only created when {@code tankpilot.kafka.publisher.enabled=true}
 * (default). Switching it off in dev or in environments without a
 * broker leaves the rest of the service running cleanly — the
 * publisher is wrapped in an Optional in {@link PriceEventPublisher}.</p>
 *
 * <h3>Producer properties</h3>
 * <ul>
 *   <li>{@code acks=all} — wait for all in-sync replicas (durability)</li>
 *   <li>{@code enable.idempotence=true} — exactly-once produce semantics</li>
 *   <li>{@code compression.type=zstd} — small JSON payloads compress
 *       very well, ~70 % size reduction over the wire</li>
 *   <li>{@code linger.ms=20} — micro-batches at modest cost in latency</li>
 *   <li>{@code max.in.flight.requests.per.connection=5} — Spring's default;
 *       safe with idempotence on</li>
 * </ul>
 */
@Configuration
@ConditionalOnProperty(prefix = "tankpilot.kafka.publisher", name = "enabled", havingValue = "true", matchIfMissing = false)
public class KafkaProducerConfig {

    @Value("${tankpilot.kafka.bootstrap-servers:redpanda:29092}")
    private String bootstrapServers;

    @Bean
    public ProducerFactory<String, Object> priceProducerFactory(ObjectMapper objectMapper) {
        Map<String, Object> props = new HashMap<>();
        props.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapServers);
        props.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
        props.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, JsonSerializer.class);
        props.put(ProducerConfig.ACKS_CONFIG, "all");
        props.put(ProducerConfig.ENABLE_IDEMPOTENCE_CONFIG, true);
        props.put(ProducerConfig.COMPRESSION_TYPE_CONFIG, "zstd");
        props.put(ProducerConfig.LINGER_MS_CONFIG, 20);
        props.put(ProducerConfig.RETRIES_CONFIG, Integer.MAX_VALUE);
        props.put(ProducerConfig.REQUEST_TIMEOUT_MS_CONFIG, 30_000);
        props.put(ProducerConfig.DELIVERY_TIMEOUT_MS_CONFIG, 120_000);
        props.put(ProducerConfig.CLIENT_ID_CONFIG, "price-service");
        // Tell Spring's JsonSerializer to use the shared ObjectMapper
        // (so it picks up Java Time-Module + records correctly).
        var factory = new DefaultKafkaProducerFactory<String, Object>(props);
        factory.setValueSerializer(new JsonSerializer<>(objectMapper));
        return factory;
    }

    @Bean
    public KafkaTemplate<String, Object> priceKafkaTemplate(
            ProducerFactory<String, Object> priceProducerFactory) {
        return new KafkaTemplate<>(priceProducerFactory);
    }
}
