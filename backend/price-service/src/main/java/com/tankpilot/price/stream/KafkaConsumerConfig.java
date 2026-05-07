package com.tankpilot.price.stream;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.tankpilot.common.events.EventEnvelope;
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
 * Consumer configuration for price-service's SSE bridge.
 *
 * <p>Same pattern as ai-service's consumer config but with a separate
 * group-id so each service has independent offsets — that's why
 * {@link com.tankpilot.price.stream.PriceStreamController} sees
 * <em>every</em> event, not just the ones the ai-service hasn't taken.</p>
 *
 * <p>The bean is conditional on
 * {@code tankpilot.kafka.consumer.enabled=true} (default) so unit
 * tests and dev environments without a broker keep working.</p>
 */
@Configuration
@EnableKafka
@ConditionalOnProperty(prefix = "tankpilot.kafka.consumer", name = "enabled", havingValue = "true", matchIfMissing = false)
public class KafkaConsumerConfig {

    @Value("${tankpilot.kafka.bootstrap-servers:redpanda:29092}")
    private String bootstrapServers;

    @Value("${tankpilot.kafka.consumer.group-id:price-service-stream}")
    private String groupId;

    @Bean
    public ConsumerFactory<String, EventEnvelope> priceStreamConsumerFactory(ObjectMapper mapper) {
        Map<String, Object> props = new HashMap<>();
        props.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapServers);
        props.put(ConsumerConfig.GROUP_ID_CONFIG, groupId);
        props.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "latest");
        props.put(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG, false);

        JsonDeserializer<EventEnvelope> inner =
                new JsonDeserializer<>(EventEnvelope.class, mapper, false);
        inner.addTrustedPackages("com.tankpilot.common.events");
        inner.setUseTypeMapperForKey(false);

        ErrorHandlingDeserializer<EventEnvelope> safeValueDes =
                new ErrorHandlingDeserializer<>(inner);

        return new DefaultKafkaConsumerFactory<>(
                props, new StringDeserializer(), safeValueDes);
    }

    @Bean
    public ConcurrentKafkaListenerContainerFactory<String, EventEnvelope> priceStreamListenerFactory(
            ConsumerFactory<String, EventEnvelope> priceStreamConsumerFactory) {
        ConcurrentKafkaListenerContainerFactory<String, EventEnvelope> factory =
                new ConcurrentKafkaListenerContainerFactory<>();
        factory.setConsumerFactory(priceStreamConsumerFactory);
        factory.getContainerProperties().setAckMode(
                org.springframework.kafka.listener.ContainerProperties.AckMode.MANUAL_IMMEDIATE);
        return factory;
    }
}
