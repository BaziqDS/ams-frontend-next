import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { NotificationsProvider, useNotifications } from './NotificationsContext';
import { apiFetch } from '@/lib/api';

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 87 } }) }));
vi.mock('@/lib/api', () => ({ apiFetch: vi.fn() }));
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.resetAllMocks(); });

it('loads alert contents and counts in one request per polling cycle', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('BroadcastChannel', undefined);
  localStorage.clear();
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  vi.mocked(apiFetch).mockResolvedValue({
    unread_notifications: 2, open_alerts: 1, modules: { inventory: { count: 1, critical: 0 } },
    alerts: [{ key: 'alert-1', module: 'inventory', severity: 'warning', title: 'Low stock', message: '', href: '/items', count: 1 }],
  });
  const host = document.createElement('div');
  const root = createRoot(host);
  function Probe() {
    const { summary, alerts } = useNotifications();
    return <span>{summary.unread_notifications}:{alerts[0]?.title}</span>;
  }
  try {
    await act(async () => root.render(<NotificationsProvider><Probe /></NotificationsProvider>));
    expect(host.textContent).toBe('2:Low stock');
    expect(apiFetch).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(15_000));
    expect(apiFetch).toHaveBeenCalledTimes(2);
    for (const [path] of vi.mocked(apiFetch).mock.calls) expect(path).toBe('/api/notifications/summary/');
  } finally { await act(async () => root.unmount()); }
});
