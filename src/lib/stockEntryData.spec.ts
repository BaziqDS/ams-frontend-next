import { afterEach, expect, it, vi } from 'vitest';
import { apiFetch } from './api';
import { loadMovementPage, loadSelectedItemInventory, loadStoreInventory } from './stockEntryData';

vi.mock('./api', () => ({ apiFetch: vi.fn() }));
afterEach(() => vi.resetAllMocks());

it('loads only the requested movement page and delegates filtering to the server', async () => {
  const page = { count: 60, next: '/next-page/', previous: null, results: [{ id: 10 }] };
  vi.mocked(apiFetch).mockResolvedValue(page);
  expect(await loadMovementPage({ page: 2, search: 'needle', status: 'COMPLETED', store: '9' })).toEqual(page);
  expect(apiFetch).toHaveBeenCalledTimes(1);
  const path = String(vi.mocked(apiFetch).mock.calls[0][0]);
  expect(path).toContain('/movements/?');
  expect(new URL(path, 'http://localhost').searchParams.get('page')).toBe('2');
  expect(path).toContain('status=COMPLETED');
  expect(path).toContain('search=needle');
  expect(path).toContain('store=9');
});

it('loads the selected store and preserves edited items without downloading the full catalog', async () => {
  vi.mocked(apiFetch).mockImplementation(async path => {
    if (path.includes('/distribution/')) return [{ item: 5 }];
    if (path.includes('/stock-allocations/')) return [{ item: 6 }];
    return [{ id: 5 }, { id: 6 }, { id: 7 }];
  });
  const data = await loadStoreInventory('9', [7, 5]);
  expect(data.items).toEqual([{ id: 5 }, { id: 6 }, { id: 7 }]);
  expect(apiFetch).toHaveBeenCalledWith('/api/inventory/distribution/?location=9');
  expect(apiFetch).toHaveBeenCalledWith('/api/inventory/stock-allocations/?status=ALLOCATED&source_location=9');
  expect(apiFetch).toHaveBeenCalledWith('/api/inventory/items/?ids=5,6,7');
  expect(apiFetch).toHaveBeenCalledTimes(3);
});

it('loads batches and instances only for selected items and keeps returns available across locations', async () => {
  vi.mocked(apiFetch).mockResolvedValue([]);
  await loadSelectedItemInventory(['5', '5'], '9');
  expect(apiFetch).toHaveBeenCalledTimes(2);
  expect(apiFetch).toHaveBeenCalledWith('/api/inventory/item-instances/?item=5&location=9');
  vi.mocked(apiFetch).mockClear();
  await loadSelectedItemInventory(['5'], '');
  expect(apiFetch).toHaveBeenCalledWith('/api/inventory/item-instances/?item=5');
});
