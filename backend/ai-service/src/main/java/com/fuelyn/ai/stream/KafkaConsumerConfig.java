package com.fuelyn.ai.stream;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fuelyn.common.events.EventEnvelope;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.annotation.EnableKafka;
import org.springframework.kafka.config.ConcurrentKafkaListenerContainerFactory;
import org.springframework.kafka.core.ConsumerFactory;
import org.springframework.kafka.core.DefaultKafkaConsumerFactory;
import org.springframework.kafka.support.serializer.ErrorHandlingDeserializer;
import org.springframework.kafka.support.serializer.JsonDeserializer;

import java.util.HashMap;
import java.util.Map;

/**
 * Kafka consumer configuration for ai-service.
 *
 * <p>Bean group is only loaded when
 * {@code fuelyn.kafka.consumer.enabled=true} (default).
 * Disabled means the @KafkaListener methods are not picked up and
 * the service runs exactly as before — useful for unit tests.</p>
 *
 * <p>{@code ErrorHandlingDeserializer} wraps {@code JsonDeserializer}
 * so a single poison-pill message can't kill the consumer thread.
 * Bad records are logged + skipped instead.</p>
 */
@Configuration
@EnableKafka
@ConditionalOnProperty(prefix = "fuelyn.kafka.consumer", name = "enabled", havingValue = "true", matchIfMissing = false)
public class KafkaConsumerConfig {

    @Value("${fuelyn.kafka.bootstrap-servers:redpanda:29092}")
    private String bootstrapServers;

    @Value("${fuelyn.kafka.consumer.group-id:ai-service}")
    private String groupId;

    @Bean
    public ConsumerFactory<String, EventEnvelope> priceConsumerFactory(ObjectMapper mapper) {
        Map<String, Object> props = new HashMap<>();
        props.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapServers);
        props.put(ConsumerConfig.GROUP_ID_CONFIG, groupId);
        props.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "latest");
        props.put(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG, false);

        // Build the JSON deserializer with our shared ObjectMapper so
        // it knows how to parse Java records + Instant fields.
        JsonDeserializer<EventEnvelope> inner =
                new JsonDeserializer<>(EventEnvelope.class, mapper, false);
        inner.addTrustedPackages("com.fuelyn.common.events");
        inner.setUseTypeMapperForKey(false);

        ErrorHandlingDeserializer<EventEnvelope> safeValueDes =
                new ErrorHandlingDeserializer<>(inner);

        return new DefaultKafkaConsumerFactory<>(
                props, new StringDeserializer(), safeValueDes);
    }

    @Bean
    public ConcurrentKafkaListenerContainerFactory<String, EventEnvelope> priceListenerFactory(
            ConsumerFactory<String, EventEnvelope> cf) {
        ConcurrentKafkaListenerContainerFactory<String, EventEnvelope> factory =
                new ConcurrentKafkaListenerContainerFactory<>();
        factory.setConsumerFactory(cf);
        factory.getContainerProperties().setAckMode(
                org.springframework.kafka.listener.ContainerProperties.AckMode.MANUAL_IMMEDIATE);
        return factory;
    }
}
