// ============================================================
// Zod-based request validation helper for BFF routes.
//
// Consistent contract: every BFF route pipes user input through
// `parseJson(request, schema)` or `parseQuery(request, schema)`,
// which returns either {success, data} or a NextResponse with 400.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import type { z } from 'zod';

export type ParseResult<T> =
  | { success: true; data: T }
  | { success: false; response: NextResponse };

function toBadRequest(error: z.ZodError): NextResponse {
  return NextResponse.json(
    {
      error: 'Invalid request',
      issues: error.issues.map((i) => ({
        path: i.path.join('.') || '(root)',
        code: i.code,
        message: i.message,
      })),
    },
    { status: 400 },
  );
}

/** Parse and validate a JSON request body. */
export async function parseJson<T>(
  request: NextRequest,
  schema: z.ZodType<T>,
): Promise<ParseResult<T>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return {
      success: false,
      response: NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }),
    };
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    return { success: false, response: toBadRequest(result.error) };
  }
  return { success: true, data: result.data };
}

/** Parse and validate URL query parameters. */
export function parseQuery<T>(
  request: NextRequest,
  schema: z.ZodType<T>,
): ParseResult<T> {
  const params: Record<string, string> = {};
  request.nextUrl.searchParams.forEach((value, key) => {
    params[key] = value;
  });
  const result = schema.safeParse(params);
  if (!result.success) {
    return { success: false, response: toBadRequest(result.error) };
  }
  return { success: true, data: result.data };
}
