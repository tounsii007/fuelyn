package com.tankpilot.common.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.LocalDateTime;

/**
 * Standardized API response wrapper used across all TankPilot microservices.
 *
 * <p>Provides a consistent response envelope containing:</p>
 * <ul>
 *   <li>{@code success} - whether the request completed without error</li>
 *   <li>{@code data} - the response payload (omitted when null)</li>
 *   <li>{@code error} - an error message (omitted on success)</li>
 *   <li>{@code timestamp} - the server-side response time</li>
 * </ul>
 *
 * @param <T> the type of the response payload
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class ApiResponse<T> {

    private final boolean success;
    private final T data;
    private final String error;
    private final LocalDateTime timestamp;

    private ApiResponse(boolean success, T data, String error) {
        this.success = success;
        this.data = data;
        this.error = error;
        this.timestamp = LocalDateTime.now();
    }

    /**
     * Creates a successful response containing the given payload.
     *
     * @param data the response payload
     * @param <T>  the payload type
     * @return a success response wrapping the data
     */
    public static <T> ApiResponse<T> success(T data) {
        return new ApiResponse<>(true, data, null);
    }

    /**
     * Creates an error response with the given message and no payload.
     *
     * @param error the error description
     * @param <T>   the (absent) payload type
     * @return an error response
     */
    public static <T> ApiResponse<T> error(String error) {
        return new ApiResponse<>(false, null, error);
    }

    public boolean isSuccess() {
        return success;
    }

    public T getData() {
        return data;
    }

    public String getError() {
        return error;
    }

    public LocalDateTime getTimestamp() {
        return timestamp;
    }
}
