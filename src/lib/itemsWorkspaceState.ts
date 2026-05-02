export type ItemsWorkspaceTab = "distribution" | "instances" | "batches" | "info" | "activity";

export type ItemsWorkspaceState = {
  itemId: string | null;
  tab: ItemsWorkspaceTab;
  locationId: string | null;
};

type ItemsWorkspaceCapabilities = {
  canShowInstances: boolean;
  canShowBatches: boolean;
};

const VALID_TABS = new Set<ItemsWorkspaceTab>(["distribution", "instances", "batches", "info", "activity"]);

function cleanParam(value: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function parseItemsWorkspaceSearch(searchParams: URLSearchParams): ItemsWorkspaceState {
  const itemId = cleanParam(searchParams.get("item"));
  const requestedTab = cleanParam(searchParams.get("tab"));
  const tab = requestedTab && VALID_TABS.has(requestedTab as ItemsWorkspaceTab)
    ? requestedTab as ItemsWorkspaceTab
    : "distribution";
  const locationId = tab === "distribution" && itemId
    ? cleanParam(searchParams.get("location"))
    : null;

  return {
    itemId,
    tab,
    locationId,
  };
}

export function normalizeItemsWorkspaceState(
  state: ItemsWorkspaceState,
  capabilities: ItemsWorkspaceCapabilities,
): ItemsWorkspaceState {
  if (!state.itemId) {
    return {
      itemId: null,
      tab: "distribution",
      locationId: null,
    };
  }

  if (state.tab === "instances" && !capabilities.canShowInstances) {
    return {
      itemId: state.itemId,
      tab: "distribution",
      locationId: null,
    };
  }

  if (state.tab === "batches" && !capabilities.canShowBatches) {
    return {
      itemId: state.itemId,
      tab: "distribution",
      locationId: null,
    };
  }

  return {
    itemId: state.itemId,
    tab: state.tab,
    locationId: state.tab === "distribution" ? state.locationId : null,
  };
}

export function buildItemsWorkspaceHref({
  itemId,
  tab = "distribution",
  locationId,
}: {
  itemId: number | string;
  tab?: ItemsWorkspaceTab;
  locationId?: number | string | null;
}) {
  const params = new URLSearchParams();

  if (tab === "distribution" && locationId != null) {
    params.set("location", String(locationId));
  } else if (tab !== "distribution") {
    params.set("tab", tab);
  }

  const query = params.toString();
  const path = `/items/${encodeURIComponent(String(itemId))}`;
  return query ? `${path}?${query}` : path;
}
