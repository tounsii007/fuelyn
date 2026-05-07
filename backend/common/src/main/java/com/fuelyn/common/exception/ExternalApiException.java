package com.fuelyn.common.exception;

import org.springframework.http.HttpStatus;

/**
 * Exception thrown when a call to an external or inter-service API fails.
 */
public class ExternalApiException extends ServiceException {

    public ExternalApiException(String message) {
        super(message, HttpStatus.BAD_GATEWAY);
    }

    public ExternalApiException(String message, Throwable cause) {
        super(message, cause, HttpStatus.BAD_GATEWAY);
    }
}
