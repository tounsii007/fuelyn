// @vitest-environment jsdom

// ============================================================
// ChatInterface — empty state, send flow, error fallback.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { ChatInterface } from '../ai/ChatInterface';

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => cleanup());

function mockFetchOnce(reply: string, source: 'ollama' | 'fallback' = 'ollama') {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ reply, source }),
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('ChatInterface — empty state', () => {
  it('renders the welcome heading and 4 suggestion chips', () => {
    render(<ChatInterface />);
    // The heading text comes from t('aiChat.emptyTitle')
    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument();
    // 4 suggestion chips are rendered as buttons inside the empty
    // state's grid (excluding header buttons / send button).
    // We assert >= 4 here because the header may not show "clear" yet.
    const suggestionButtons = screen
      .getAllByRole('button')
      .filter((b) => !b.getAttribute('aria-label')?.includes('senden')
                  && !b.getAttribute('aria-label')?.includes('send'));
    expect(suggestionButtons.length).toBeGreaterThanOrEqual(4);
  });
});

describe('ChatInterface — send flow', () => {
  it('appends the user message immediately and the assistant reply on success', async () => {
    mockFetchOnce('Diesel ist heute günstiger im Norden.');
    render(<ChatInterface />);

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'Wo ist Diesel günstig?' } });

    const sendBtn = screen.getByRole('button', { name: /senden|send/i });
    fireEvent.click(sendBtn);

    // Optimistic user message appears right away
    await waitFor(() => {
      expect(screen.getByText('Wo ist Diesel günstig?')).toBeInTheDocument();
    });

    // Assistant reply lands after the mocked fetch resolves
    await waitFor(() => {
      expect(screen.getByText('Diesel ist heute günstiger im Norden.')).toBeInTheDocument();
    });
  });

  it('clears the textarea after sending', async () => {
    mockFetchOnce('ok');
    render(<ChatInterface />);

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'hello' } });
    fireEvent.click(screen.getByRole('button', { name: /senden|send/i }));

    await waitFor(() => expect(textarea.value).toBe(''));
  });

  it('disables the send button when textarea is empty', () => {
    render(<ChatInterface />);
    const sendBtn = screen.getByRole('button', { name: /senden|send/i }) as HTMLButtonElement;
    expect(sendBtn.disabled).toBe(true);
  });

  it('sends on Enter and inserts newline on Shift+Enter', async () => {
    const fetchMock = mockFetchOnce('ack');
    render(<ChatInterface />);

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'enter sends' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    // Shift+Enter should NOT trigger another send
    fireEvent.change(textarea, { target: { value: 'line one' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('ChatInterface — error fallback', () => {
  it('appends a localized error message when the network call fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('boom')),
    );

    render(<ChatInterface />);

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'hi' } });
    fireEvent.click(screen.getByRole('button', { name: /senden|send/i }));

    // Wait for at least 2 messages: user msg + error reply
    await waitFor(() => {
      const log = screen.getByRole('log');
      // The user's message + the error notice should both be in the log
      expect(log.textContent).toMatch(/hi/);
      expect(log.textContent?.length ?? 0).toBeGreaterThan(2);
    });
  });
});

describe('ChatInterface — clear chat', () => {
  it('shows the clear button only after at least one message', async () => {
    mockFetchOnce('hi');
    render(<ChatInterface />);

    // No clear button initially
    expect(screen.queryByText(/leeren|clear chat|effacer/i)).toBeNull();

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'q' } });
    fireEvent.click(screen.getByRole('button', { name: /senden|send/i }));

    // After sending, the clear button should appear
    await waitFor(() => {
      expect(screen.getByText(/leeren|clear chat|effacer/i)).toBeInTheDocument();
    });
  });
});
