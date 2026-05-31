package com.fuelyn.common.exception;

import org.springframework.http.HttpStatus;

/**
 * Base exception for application-level errors across Fuelyn microservices.
 *
 * <p>Each {@code ServiceException} carries an {@link HttpStatus} that controllers translate into
 * the appropriate HTTP response code. This avoids scattering status-code logic across the service
 * layer.
 */
public class ServiceException extends RuntimeException {

    private final HttpStatus status;

    /**
     * Creates a service exception with a message and HTTP status.
     *
     * @param message a human-readable description of the error
     * @param status the HTTP status code to return to the client
     */
    public ServiceException(String message, HttpStatus status) {
        super(message);
        this.status = status;
    }

    /**
     * Creates a service exception with a message, cause, and HTTP status.
     *
     * @param message a human-readable description of the error
     * @param cause the underlying exception
     * @param status the HTTP status code to return to the client
     */
    public ServiceException(String message, Throwable cause, HttpStatus status) {
        super(message, cause);
        this.status = status;
    }

    /**
     * Returns the HTTP status associated with this exception.
     *
     * @return the HTTP status code
     */
    public HttpStatus getStatus() {
        return status;
    }
}
