package com.fuelyn.ai.stream;

import java.util.HashMap;
import java.util.Map;

import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.apache.kafka.common.serialization.StringSerializer;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.annotation.EnableKafka;
import org.springframework.kafka.config.ConcurrentKafkaListenerContainerFactory;
import org.springframework.kafka.core.ConsumerFactory;
import org.springframework.kafka.core.DefaultKafkaConsumerFactory;
import org.springframework.kafka.core.DefaultKafkaProducerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.core.ProducerFactory;
import org.springframework.kafka.listener.DeadLetterPublishingRecoverer;
import org.springframework.kafka.listener.DefaultErrorHandler;
import org.springframework.kafka.support.serializer.ErrorHandlingDeserializer;
import org.springframework.kafka.support.serializer.JsonDeserializer;
import org.springframework.kafka.support.serializer.JsonSerializer;
import org.springframework.util.backoff.ExponentialBackOff;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fuelyn.common.events.EventEnvelope;

/**
 * Kafka consumer configuration for ai-service.
 *
 * <p>Bean group is only loaded when {@code fuelyn.kafka.consumer.enabled=true} (default). Disabled
 * means the @KafkaListener methods are not picked up and the service runs exactly as before —
 * useful for unit tests.
 *
 * <p>{@code ErrorHandlingDeserializer} wraps {@code JsonDeserializer} so a single poison-pill
 * message can't kill the consumer thread. Bad records are logged + skipped instead.
 */
@Configuration
@EnableKafka
@ConditionalOnProperty(
        prefix = "fuelyn.kafka.consumer",
        name = "enabled",
        havingValue = "true",
        matchIfMissing = false)
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

        return new DefaultKafkaConsumerFactory<>(props, new StringDeserializer(), safeValueDes);
    }

    @Bean
    public ConcurrentKafkaListenerContainerFactory<String, EventEnvelope> priceListenerFactory(
            ConsumerFactory<String, EventEnvelope> cf, DefaultErrorHandler errorHandler) {
        ConcurrentKafkaListenerContainerFactory<String, EventEnvelope> factory =
                new ConcurrentKafkaListenerContainerFactory<>();
        factory.setConsumerFactory(cf);
        factory.getContainerProperties()
                .setAckMode(
                        org.springframework.kafka.listener.ContainerProperties.AckMode
                                .MANUAL_IMMEDIATE);
        factory.setCommonErrorHandler(errorHandler);
        return factory;
    }

    /**
     * Phase A2 — DLQ producer.
     *
     * <p>Used by {@link DeadLetterPublishingRecoverer} to forward records that exhausted the retry
     * budget. Must point at the same broker as the consumer; uses string keys + JSON values so the
     * DLQ message is forensically inspectable from {@code rpk topic consume fuelyn.prices.v1.dlq}.
     */
    @Bean
    public ProducerFactory<String, Object> dlqProducerFactory() {
        Map<String, Object> props = new HashMap<>();
        props.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapServers);
        props.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
        props.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, JsonSerializer.class);
        // DLQ messages must be acknowledged by the broker before we
        // commit the consumer offset, otherwise a crash loses the
        // poison-pill record entirely.
        props.put(ProducerConfig.ACKS_CONFIG, "all");
        return new DefaultKafkaProducerFactory<>(props);
    }

    @Bean
    public KafkaTemplate<String, Object> dlqKafkaTemplate(
            ProducerFactory<String, Object> dlqProducerFactory) {
        return new KafkaTemplate<>(dlqProducerFactory);
    }

    /**
     * Phase A2 — error handler with exponential back-off + DLQ.
     *
     * <p>Behaviour matrix:
     *
     * <ul>
     *   <li>Transient handler exception → up to 3 redeliveries with 1 s, 2 s, 4 s back-off (handles
     *       brief downstream blips).
     *   <li>Still failing after retries → published to {@code <originalTopic>.dlq} for offline
     *       triage. Consumer commits the offset so the broker doesn't redeliver forever.
     *   <li>Deserialisation errors are surfaced by ErrorHandlingDeserializer and routed straight to
     *       DLQ (no retry; bad bytes won't get better with time).
     * </ul>
     */
    @Bean
    public DefaultErrorHandler kafkaErrorHandler(KafkaTemplate<String, Object> dlqKafkaTemplate) {
        DeadLetterPublishingRecoverer recoverer =
                new DeadLetterPublishingRecoverer(
                        dlqKafkaTemplate,
                        (record, ex) ->
                                new org.apache.kafka.common.TopicPartition(
                                        record.topic() + ".dlq", record.partition()));
        ExponentialBackOff backOff = new ExponentialBackOff(1_000L, 2.0);
        backOff.setMaxAttempts(3); // 3 retries → 1 s, 2 s, 4 s before DLQ
        DefaultErrorHandler handler = new DefaultErrorHandler(recoverer, backOff);
        // Don't retry on deserialisation errors — they're permanent.
        handler.addNotRetryableExceptions(
                org.springframework.kafka.support.serializer.DeserializationException.class,
                IllegalArgumentException.class);
        return handler;
    }
}
