// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as translate } from '@/app/api/copilot/voice/translate/route';
import { POST as transcribe } from '@/app/api/copilot/voice/transcribe/route';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const request = (body: string, headers: Record<string, string> = {}) => new NextRequest('http://localhost:3000/api/copilot/voice/translate', {
  method: 'POST', body, headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000', Cookie: 'ams_access=valid; csrftoken=csrf', 'X-CSRFToken': 'csrf', ...headers },
});

describe('voice provider routes', () => {
  it('transcribes valid audio and ignores a client-supplied provider model', async () => {
    vi.stubEnv('GROQ_API_KEY', 'provider-test-key');
    vi.stubEnv('GROQ_STT_MODEL', 'whisper-large-v3');
    const fetch = vi.fn(async (_url: unknown, options?: RequestInit) => {
      if (options?.body instanceof FormData) {
        expect(options.body.get('model')).toBe('whisper-large-v3');
        expect(options.signal).toBeDefined();
        return Response.json({ text: 'Inspect these items' });
      }
      return Response.json({ allowed: true });
    });
    vi.stubGlobal('fetch', fetch);
    const body = new FormData();
    body.set('audio', new File(['audio'], 'voice.webm', { type: 'audio/webm' }));
    body.set('model', 'expensive-unapproved-model');
    const response = await transcribe(new NextRequest('http://localhost:3000/api/copilot/voice/transcribe', {
      method: 'POST', body, headers: { Origin: 'http://localhost:3000', Cookie: 'ams_access=valid', 'X-CSRFToken': 'csrf' },
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ text: 'Inspect these items' });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('returns a controlled error when the translation provider times out', async () => {
    vi.stubEnv('GOOGLE_TRANSLATE_API_KEY', 'provider-test-key');
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (String(url).includes('/auth/voice-permit/')) return Response.json({ allowed: true });
      throw new Error('provider-secret-error');
    }));
    const response = await translate(request(JSON.stringify({ text: 'Salam', target: 'en' })));
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain('provider-secret-error');
  });
  it('blocks anonymous requests and rejects forged sessions before calling providers', async () => {
    const fetch = vi.fn(async () => Response.json({ detail: 'Invalid token' }, { status: 401 }));
    vi.stubGlobal('fetch', fetch);
    expect((await translate(request('{}', { Cookie: '' }))).status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
    expect((await translate(request('{}'))).status).toBe(401);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('preserves successful translation after backend permission and quota validation', async () => {
    vi.stubEnv('GOOGLE_TRANSLATE_API_KEY', 'provider-test-key');
    const fetch = vi.fn(async (url) => String(url).includes('/auth/voice-permit/')
      ? Response.json({ allowed: true })
      : Response.json({ data: { translations: [{ translatedText: 'Hello' }] } }));
    vi.stubGlobal('fetch', fetch);
    const response = await translate(request(JSON.stringify({ text: 'Salam', target: 'en' })));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ translatedText: 'Hello' });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('enforces origin, backend quota and body limits without provider calls', async () => {
    vi.stubEnv('GOOGLE_TRANSLATE_API_KEY', 'provider-test-key');
    const fetch = vi.fn(async () => Response.json({ allowed: true }));
    vi.stubGlobal('fetch', fetch);
    expect((await translate(request('{}', { Origin: 'https://evil.test' }))).status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
    expect((await translate(request(JSON.stringify({ text: 'x'.repeat(6000) })))).status).toBe(413);
    fetch.mockImplementation(async () => Response.json({}, { status: 429 }));
    expect((await translate(request('{}'))).status).toBe(429);
  });

  it('rejects oversized streaming uploads before multipart parsing', async () => {
    vi.stubEnv('GROQ_API_KEY', 'provider-test-key');
    const fetch = vi.fn(async () => Response.json({ allowed: true }));
    vi.stubGlobal('fetch', fetch);
    const response = await transcribe(request('x'.repeat(26 * 1024 * 1024), { 'Content-Type': 'multipart/form-data; boundary=test' }));
    expect(response.status).toBe(413);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
