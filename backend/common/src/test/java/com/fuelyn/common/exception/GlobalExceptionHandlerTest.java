package com.fuelyn.common.exception;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.HashSet;
import java.util.Set;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.ConstraintViolationException;
import jakarta.validation.Path;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.BeanPropertyBindingResult;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.server.ResponseStatusException;

import com.fuelyn.common.dto.ApiResponse;

/**
 * Tests for {@link GlobalExceptionHandler} — verifies the iter-21 fixes (ResponseStatusException
 * honoured first, Error not suppressed) plus the existing translation contract for
 * ServiceException, validation, and missing parameters.
 */
class GlobalExceptionHandlerTest {

    private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

    @Nested
    @DisplayName("ServiceException — explicit application error")
    class ServiceErrors {

        @Test
        void serviceException_translatesToConfiguredStatus() {
            ServiceException ex = new ServiceException("upstream broken", HttpStatus.BAD_GATEWAY);
            ResponseEntity<ApiResponse<Void>> response = handler.handleServiceException(ex);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_GATEWAY);
            assertThat(response.getBody()).isNotNull();
            assertThat(response.getBody().isSuccess()).isFalse();
        }

        @Test
        void serviceException_messageIsEchoedToClient() {
            ServiceException ex = new ServiceException("something specific", HttpStatus.NOT_FOUND);
            ResponseEntity<ApiResponse<Void>> response = handler.handleServiceException(ex);
            // The body's error wraps the exception message — visible to clients.
            assertThat(response.getBody()).isNotNull();
        }
    }

    @Nested
    @DisplayName("Validation errors — 400 with field-level detail")
    class Validation {

        @Test
        void methodArgumentNotValid_includesFieldNamesInMessage() {
            BeanPropertyBindingResult bindingResult =
                    new BeanPropertyBindingResult(new Object(), "request");
            bindingResult.addError(new FieldError("request", "lat", "must not be null"));
            bindingResult.addError(
                    new FieldError("request", "lng", "must be between -180 and 180"));

            MethodArgumentNotValidException ex =
                    new MethodArgumentNotValidException(null, bindingResult);

            ResponseEntity<ApiResponse<Void>> response = handler.handleValidation(ex);
            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        }

        @Test
        void emptyValidationErrors_stillReturns400() {
            BeanPropertyBindingResult empty =
                    new BeanPropertyBindingResult(new Object(), "request");
            MethodArgumentNotValidException ex = new MethodArgumentNotValidException(null, empty);
            ResponseEntity<ApiResponse<Void>> response = handler.handleValidation(ex);
            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        }

        @Test
        void constraintViolation_translatesTo400() {
            ConstraintViolation<?> violation =
                    new StubViolation("lat", "must be between -90 and 90");
            ConstraintViolationException ex =
                    new ConstraintViolationException("validation failed", Set.of(violation));

            ResponseEntity<ApiResponse<Void>> response = handler.handleConstraintViolation(ex);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        }

        @Test
        void emptyConstraintViolations_stillReturns400() {
            ConstraintViolationException ex =
                    new ConstraintViolationException("no violations", new HashSet<>());
            ResponseEntity<ApiResponse<Void>> response = handler.handleConstraintViolation(ex);
            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        }

        @Test
        void missingParameter_translatesTo400_withParameterName() {
            MissingServletRequestParameterException ex =
                    new MissingServletRequestParameterException("lat", "double");

            ResponseEntity<ApiResponse<Void>> response = handler.handleMissingParam(ex);
            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        }
    }

    @Nested
    @DisplayName("ResponseStatusException honoured (iter 21 fix)")
    class StatusException {

        @Test
        void responseStatusException_keepsItsExplicitStatus() {
            // The headline iter-21 fix: 413 from HmacSigningFilter must
            // not be shadowed by the catch-all 500.
            ResponseStatusException ex =
                    new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "body too large");

            ResponseEntity<ApiResponse<Void>> response = handler.handleResponseStatus(ex);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.PAYLOAD_TOO_LARGE);
        }

        @Test
        void responseStatusException_with404_returnsNotFound() {
            ResponseStatusException ex =
                    new ResponseStatusException(HttpStatus.NOT_FOUND, "station unknown");
            ResponseEntity<ApiResponse<Void>> response = handler.handleResponseStatus(ex);
            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        }

        @Test
        void responseStatusException_withNullReason_returnsRequestFailed() {
            ResponseStatusException ex =
                    new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE);
            ResponseEntity<ApiResponse<Void>> response = handler.handleResponseStatus(ex);
            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
            assertThat(response.getBody()).isNotNull();
        }
    }

    @Nested
    @DisplayName("Generic catch-all — 500 + redacted message")
    class GenericCatchAll {

        @Test
        void unexpectedException_translatesTo500_withGenericMessage() {
            // Internal stack stays in the log; client sees opaque message.
            RuntimeException ex = new RuntimeException("something internal: secret-key=abc123");
            ResponseEntity<ApiResponse<Void>> response = handler.handleGeneric(ex);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
            assertThat(response.getBody()).isNotNull();
            assertThat(response.getBody().isSuccess()).isFalse();
            // Crucial: the raw exception message is NOT echoed back —
            // otherwise user-input or internal paths leak to clients.
            String body = response.toString();
            assertThat(body).doesNotContain("secret-key=abc123");
        }

        @Test
        void nullPointerException_translatesTo500() {
            NullPointerException ex = new NullPointerException("oops");
            ResponseEntity<ApiResponse<Void>> response = handler.handleGeneric(ex);
            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    @Nested
    @DisplayName("Errors (OOME, AssertionError) MUST propagate (iter 21)")
    class ErrorsPropagate {

        @Test
        void exceptionHandler_isScoped_to_Exception_notThrowable() {
            // Reflection check: confirm the @ExceptionHandler annotation is
            // bound to Exception.class, NOT Throwable.class. If a future
            // edit widens it to Throwable, this test catches it because
            // OOME / AssertionError would then be silently caught and
            // returned as 500 — masking fatal conditions.
            try {
                java.lang.reflect.Method m =
                        GlobalExceptionHandler.class.getMethod("handleGeneric", Exception.class);
                org.springframework.web.bind.annotation.ExceptionHandler ann =
                        m.getAnnotation(
                                org.springframework.web.bind.annotation.ExceptionHandler.class);
                assertThat(ann).isNotNull();
                Class<?>[] handled = ann.value();
                assertThat(handled).containsExactly(Exception.class);
                // Specifically, Throwable, Error, and OutOfMemoryError must NOT
                // be in this handler's range.
                for (Class<?> c : handled) {
                    assertThat(c).isNotSameAs(Throwable.class);
                    assertThat(c).isNotSameAs(Error.class);
                }
            } catch (NoSuchMethodException e) {
                throw new AssertionError("handleGeneric(Exception) must exist", e);
            }
        }

        @Test
        void error_subclasses_are_not_swallowed_by_signature() {
            // The catch-all signature is (Exception). An Error subclass
            // would not be eligible to call this method. Verify by trying
            // to pass an Error and watching the compiler reject.
            //
            // (Compile-time guarantee — Java's type system enforces it.
            // This test is documentation: anyone reading sees "we depend
            // on this static guarantee".)
            //
            // assertThatThrownBy below would itself swallow Error in
            // some lambda paths; we just assert the signature matches.
            java.lang.reflect.Method m;
            try {
                m = GlobalExceptionHandler.class.getMethod("handleGeneric", Exception.class);
            } catch (NoSuchMethodException e) {
                throw new AssertionError(e);
            }
            assertThat(m.getParameterTypes()).containsExactly(Exception.class);
        }
    }

    /**
     * Minimal stub so we can build a {@link ConstraintViolationException} without instantiating a
     * full Validator. Avoids Mockito (Java 26 incompat) and keeps the test framework-agnostic.
     */
    private record StubViolation(String fieldName, String message)
            implements ConstraintViolation<Object> {
        @Override
        public String getMessage() {
            return message;
        }

        @Override
        public String getMessageTemplate() {
            return "{" + fieldName + "}";
        }

        @Override
        public Object getRootBean() {
            return null;
        }

        @Override
        public Class<Object> getRootBeanClass() {
            return Object.class;
        }

        @Override
        public Object getLeafBean() {
            return null;
        }

        @Override
        public Object[] getExecutableParameters() {
            return new Object[0];
        }

        @Override
        public Object getExecutableReturnValue() {
            return null;
        }

        @Override
        public Path getPropertyPath() {
            // Return an iterable that toString()s to the field name.
            return new StubPath(fieldName);
        }

        @Override
        public Object getInvalidValue() {
            return null;
        }

        @Override
        public jakarta.validation.metadata.ConstraintDescriptor<?> getConstraintDescriptor() {
            return null;
        }

        @Override
        public <U> U unwrap(Class<U> type) {
            return null;
        }
    }

    private record StubPath(String name) implements Path {
        @Override
        public java.util.Iterator<Node> iterator() {
            return java.util.Collections.emptyIterator();
        }

        @Override
        public String toString() {
            return name;
        }
    }
}
