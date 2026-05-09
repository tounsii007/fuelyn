package com.fuelyn.common.exception;

import com.fuelyn.common.dto.ApiResponse;
import jakarta.validation.ConstraintViolationException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.server.ResponseStatusException;

/**
 * Global exception handler providing consistent error responses across all
 * Fuelyn microservices.
 *
 * <p>Catches both application-level exceptions ({@link ServiceException}) and
 * framework validation errors, translating them into {@link ApiResponse}
 * envelopes with the appropriate HTTP status codes.</p>
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    /**
     * Handles known application errors thrown by service code.
     */
    @ExceptionHandler(ServiceException.class)
    public ResponseEntity<ApiResponse<Void>> handleServiceException(ServiceException ex) {
        log.warn("Service exception: {} [status={}]", ex.getMessage(), ex.getStatus());
        return ResponseEntity
                .status(ex.getStatus())
                .body(ApiResponse.error(ex.getMessage()));
    }

    /**
     * Handles bean-validation failures on {@code @Valid} method arguments.
     */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiResponse<Void>> handleValidation(MethodArgumentNotValidException ex) {
        String message = ex.getBindingResult().getFieldErrors().stream()
                .map(fe -> fe.getField() + ": " + fe.getDefaultMessage())
                .reduce((a, b) -> a + "; " + b)
                .orElse("Validation failed");
        log.warn("Validation error: {}", message);
        return ResponseEntity
                .status(HttpStatus.BAD_REQUEST)
                .body(ApiResponse.error(message));
    }

    /**
     * Handles constraint violations on validated controller parameters.
     */
    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<ApiResponse<Void>> handleConstraintViolation(ConstraintViolationException ex) {
        String message = ex.getConstraintViolations().stream()
                .map(v -> v.getPropertyPath() + ": " + v.getMessage())
                .reduce((a, b) -> a + "; " + b)
                .orElse("Constraint violation");
        log.warn("Constraint violation: {}", message);
        return ResponseEntity
                .status(HttpStatus.BAD_REQUEST)
                .body(ApiResponse.error(message));
    }

    /**
     * Handles missing required request parameters.
     */
    @ExceptionHandler(MissingServletRequestParameterException.class)
    public ResponseEntity<ApiResponse<Void>> handleMissingParam(MissingServletRequestParameterException ex) {
        log.warn("Missing parameter: {}", ex.getParameterName());
        return ResponseEntity
                .status(HttpStatus.BAD_REQUEST)
                .body(ApiResponse.error("Missing required parameter: " + ex.getParameterName()));
    }

    /**
     * Handles method-level validation failures (Spring 6.1+).
     */
    @ExceptionHandler(HandlerMethodValidationException.class)
    public ResponseEntity<ApiResponse<Void>> handleMethodValidation(HandlerMethodValidationException ex) {
        log.warn("Method validation error: {}", ex.getMessage());
        return ResponseEntity
                .status(HttpStatus.BAD_REQUEST)
                .body(ApiResponse.error("Validation failed: " + ex.getMessage()));
    }

    /**
     * {@link ResponseStatusException} carries an explicit HTTP status —
     * Spring already knows how to map it to a response, but the catch-all
     * below would shadow it with a generic 500. Handle it first so the
     * carefully-chosen status (e.g. 413 from HmacSigningFilter, 404 from
     * a controller that already classified the failure) reaches the client.
     */
    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<ApiResponse<Void>> handleResponseStatus(ResponseStatusException ex) {
        log.warn("ResponseStatusException: {} [{}]", ex.getReason(), ex.getStatusCode());
        return ResponseEntity
                .status(ex.getStatusCode())
                .body(ApiResponse.error(ex.getReason() != null ? ex.getReason() : "Request failed"));
    }

    /**
     * Catch-all for any unhandled exception. Returns a generic 500 error to
     * avoid leaking internal details to the client.
     *
     * <p>Specifically does NOT widen to {@link Throwable} — {@link Error}
     * subclasses (OutOfMemoryError, StackOverflowError, AssertionError) MUST
     * propagate so the JVM / container can take appropriate action (heap
     * dump, restart pod, etc.). Catching them here would silently mask
     * fatal conditions and turn a quick crash-loop into a slow zombie.</p>
     */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<Void>> handleGeneric(Exception ex) {
        // Do not echo the raw exception message back — it can include
        // user-supplied input or internal paths. The full stack stays in
        // the log for operators; the response stays opaque to clients.
        log.error("Unhandled exception", ex);
        return ResponseEntity
                .status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(ApiResponse.error("An unexpected error occurred"));
    }
}
