import { apiFetch, type Page } from './api';
import type { StockAllocationRecord } from './stockEntryLocationRules';
import type { StockEntryItemInstance, StockEntryStockRecord } from './stockEntryItemRules';

function nextPagePath(next: string | null) {
  if (!next) return null;
  try {
    const url = new URL(next);
    return `${url.pathname}${url.search}`;
  } catch {
    return next;
  }
}

export async function fetchAllPages<T>(initialPath: string) {
  const results: T[] = [];
  let path: string | null = initialPath;

  while (path) {
    const data = await apiFetch<Page<T> | T[]>(path);
    if (Array.isArray(data)) {
      results.push(...data);
      break;
    }
    results.push(...data.results);
    path = nextPagePath(data.next);
  }

  return results;
}


export function loadMovementPage<T>({ page, search, status, store }: { page: number; search: string; status: string; store: string }) {
  const params = new URLSearchParams({ page: String(page), search, status });
  if (store !== 'all') params.set('store', store);
  return apiFetch<Page<T>>(`/api/inventory/stock-entries/movements/?${params}`);
}

export async function loadStoreInventory<T>(store: string, selectedItemIds: number[] = []) {
  const [stockRecords, allocations] = await Promise.all([
    fetchAllPages<StockEntryStockRecord>(`/api/inventory/distribution/?location=${store}`),
    fetchAllPages<StockAllocationRecord>(`/api/inventory/stock-allocations/?status=ALLOCATED&source_location=${store}`),
  ]);
  const ids = [...new Set([...stockRecords.map(row => row.item), ...allocations.map(row => row.item), ...selectedItemIds])];
  const items: T[] = [];
  for (let offset = 0; offset < ids.length; offset += 100) {
    items.push(...await fetchAllPages<T>(`/api/inventory/items/?ids=${ids.slice(offset, offset + 100).join(',')}`));
  }
  return { items, stockRecords, allocations };
}

export async function loadSelectedItemInventory<T>(items: string[], sourceStore: string) {
  const values = await Promise.all([...new Set(items)].map(async item => {
    const [batches, instances] = await Promise.all([
      fetchAllPages<T>(`/api/inventory/item-batches/?item=${item}`),
      fetchAllPages<StockEntryItemInstance>(`/api/inventory/item-instances/?item=${item}${sourceStore ? `&location=${sourceStore}` : ''}`),
    ]);
    return { batches, instances };
  }));
  return { batches: values.flatMap(value => value.batches), instances: values.flatMap(value => value.instances) };
}
