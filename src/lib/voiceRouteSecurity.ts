import { NextRequest, NextResponse } from 'next/server';

export function voiceError(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function authorizeVoice(request: NextRequest): Promise<NextResponse | null> {
  if (!request.cookies.get('ams_access')?.value) return voiceError('Sign in to use voice.', 401);
  if (request.headers.get('origin') !== new URL(request.url).origin) return voiceError('Untrusted request origin.', 403);
  const backend = process.env.AMS_BACKEND_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';
  try {
    const permission = await fetch(`${backend}/auth/voice-permit/`, {
      method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(10_000),
      headers: {
        cookie: request.headers.get('cookie') ?? '',
        origin: request.headers.get('origin') ?? '',
        'X-CSRFToken': request.headers.get('X-CSRFToken') ?? '',
      },
    });
    if (!permission.ok) return voiceError('Voice access denied or quota reached.', [401, 403, 429].includes(permission.status) ? permission.status : 503);
    if ((await permission.json()).allowed !== true) return voiceError('Unable to verify voice access.', 503);
    return null;
  } catch {
    return voiceError('Unable to verify voice access.', 503);
  }
}

export class BodyTooLarge extends Error {}

export async function readLimitedBody(request: Request, limit: number): Promise<ArrayBuffer> {
  if (Number(request.headers.get('content-length')) > limit) throw new BodyTooLarge();
  const reader = request.body?.getReader();
  if (!reader) return new ArrayBuffer(0);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new BodyTooLarge(); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes.buffer;
}
