import { apiRequest, csrfHeaders } from './api';

export async function voiceRequest(path: string, options: RequestInit): Promise<Response> {
  const send = async () => {
    const headers = new Headers(options.headers);
    const csrf = await csrfHeaders();
    headers.set('X-CSRFToken', csrf['X-CSRFToken']);
    return fetch(path, { ...options, headers, credentials: 'same-origin' });
  };
  const response = await send();
  if (response.status !== 401) return response;
  // The backend helper renews an expired access cookie before retrying.
  const session = await apiRequest('/auth/users/me/');
  return session.ok ? send() : response;
}
