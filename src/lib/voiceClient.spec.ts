import { afterEach, expect, it, vi } from 'vitest';
import { apiRequest, csrfHeaders } from './api';
import { voiceRequest } from './voiceClient';

vi.mock('./api', () => ({ apiRequest: vi.fn(), csrfHeaders: vi.fn() }));
afterEach(() => { vi.resetAllMocks(); vi.unstubAllGlobals(); });

it('renews an expired session before retrying the original audio body with CSRF', async () => {
  vi.mocked(csrfHeaders).mockResolvedValue({ 'X-CSRFToken': 'csrf' });
  vi.mocked(apiRequest).mockResolvedValue(new Response('{}', { status: 200 }));
  const fetch = vi.fn().mockResolvedValueOnce(new Response('{}', { status: 401 })).mockResolvedValueOnce(new Response('{}'));
  vi.stubGlobal('fetch', fetch);
  const body = new FormData();
  body.set('audio', new File(['a'], 'voice.webm'));
  expect((await voiceRequest('/api/copilot/voice/transcribe', { method: 'POST', body })).status).toBe(200);
  expect(apiRequest).toHaveBeenCalledWith('/auth/users/me/');
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch.mock.calls[1][1].body).toBe(body);
  expect(fetch.mock.calls[1][1].headers.get('X-CSRFToken')).toBe('csrf');
});

it('does not retry a quota rejection or attempt a provider request again', async () => {
  vi.mocked(csrfHeaders).mockResolvedValue({ 'X-CSRFToken': 'csrf' });
  const fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 429 }));
  vi.stubGlobal('fetch', fetch);
  expect((await voiceRequest('/api/copilot/voice/translate', { method: 'POST', body: '{}' })).status).toBe(429);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(apiRequest).not.toHaveBeenCalled();
});
