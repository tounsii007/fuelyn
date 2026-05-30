package com.fuelyn.common.security;

import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;

import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.InputStreamReader;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;

/**
 * Wraps a request whose body has already been consumed and replays the
 * buffered bytes to downstream consumers.
 *
 * <p>{@link ServiceAuthFilter} must read the request body to verify the
 * HMAC signature. The servlet body stream is single-pass, so without this
 * wrapper the controller's {@code @RequestBody} parsing would see an
 * exhausted stream and fail on every signed POST/PUT. (Spring's
 * {@code ContentCachingRequestWrapper} caches bytes as a side effect of
 * reading but does <em>not</em> replay them on a second
 * {@code getInputStream()} call, so it does not solve this.)</p>
 *
 * <p>Each call to {@link #getInputStream()} / {@link #getReader()} returns a
 * fresh view over the same buffer, so the body can be read any number of
 * times.</p>
 */
final class CachedBodyHttpServletRequest extends HttpServletRequestWrapper {

    private final byte[] body;

    CachedBodyHttpServletRequest(HttpServletRequest request, byte[] body) {
        super(request);
        this.body = body;
    }

    @Override
    public ServletInputStream getInputStream() {
        ByteArrayInputStream source = new ByteArrayInputStream(body);
        return new ServletInputStream() {
            @Override
            public int read() {
                return source.read();
            }

            @Override
            public int read(byte[] b, int off, int len) {
                return source.read(b, off, len);
            }

            @Override
            public boolean isFinished() {
                return source.available() == 0;
            }

            @Override
            public boolean isReady() {
                return true;
            }

            @Override
            public void setReadListener(ReadListener readListener) {
                // Synchronous replay from an in-memory buffer — async read
                // notifications are not applicable.
            }
        };
    }

    @Override
    public BufferedReader getReader() {
        return new BufferedReader(new InputStreamReader(new ByteArrayInputStream(body), resolveCharset()));
    }

    @Override
    public int getContentLength() {
        return body.length;
    }

    @Override
    public long getContentLengthLong() {
        return body.length;
    }

    private Charset resolveCharset() {
        String encoding = getCharacterEncoding();
        if (encoding != null) {
            try {
                return Charset.forName(encoding);
            } catch (RuntimeException ignored) {
                // Fall through to the UTF-8 default on an unknown/invalid charset.
            }
        }
        return StandardCharsets.UTF_8;
    }
}
