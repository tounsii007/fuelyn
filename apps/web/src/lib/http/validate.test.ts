import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { parseJson, parseQuery } from './validate';

function jsonRequest(body: unknown): NextRequest {
  return {
    json: async () => body,
    headers: new Map(),
  } as unknown as NextRequest;
}

function brokenJsonRequest(): NextRequest {
  return {
    json: async () => {
      throw new Error('not json');
    },
    headers: new Map(),
  } as unknown as NextRequest;
}

function queryRequest(params: Record<string, string>): NextRequest {
  const sp = new URLSearchParams(params);
  return {
    nextUrl: { searchParams: sp },
  } as unknown as NextRequest;
}

const Schema = z.object({ name: z.string().min(2), age: z.coerce.number().int().min(0) });

describe('parseJson', () => {
  it('returns success on valid input', async () => {
    const result = await parseJson(jsonRequest({ name: 'Ada', age: 30 }), Schema);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Ada');
    }
  });

  it('returns 400 envelope on schema mismatch', async () => {
    const result = await parseJson(jsonRequest({ name: 'A', age: -5 }), Schema);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.response.status).toBe(400);
      const body = await result.response.json();
      expect(body.error).toBe('Invalid request');
      expect(Array.isArray(body.issues)).toBe(true);
      expect(body.issues.length).toBeGreaterThan(0);
    }
  });

  it('returns 400 on invalid JSON', async () => {
    const result = await parseJson(brokenJsonRequest(), Schema);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.response.status).toBe(400);
    }
  });
});

describe('parseQuery', () => {
  it('coerces query strings into typed values', () => {
    const result = parseQuery(queryRequest({ name: 'Ada', age: '30' }), Schema);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.age).toBe(30);
    }
  });

  it('returns 400 on missing required field', () => {
    const result = parseQuery(queryRequest({ age: '5' }), Schema);
    expect(result.success).toBe(false);
  });
});
