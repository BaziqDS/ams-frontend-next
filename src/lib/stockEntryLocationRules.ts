export interface StockEntryLocation {
  id: number;
  name: string;
  parent_location: number | null;
  is_store: boolean;
  is_standalone: boolean;
  is_main_store?: boolean | null;
  is_active: boolean;
  hierarchy_level: number;
  main_store_id?: number | null;
  auto_created_store?: number | null;
}

export interface StockEntryPerson {
  id: number;
  name: string;
  is_active: boolean;
  standalone_locations?: number[];
}

export interface StockAllocationRecord {
  id: number;
  item?: number;
  batch?: number | null;
  source_location: number;
  allocated_to_person: number | null;
  allocated_to_location: number | null;
  quantity?: number;
  status: string;
  stock_entry?: number | null;
}

function toNumericId(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const id = Number(value);
  return Number.isFinite(id) ? id : null;
}

function byId(locations: StockEntryLocation[]) {
  return new Map(locations.map(location => [location.id, location]));
}

function isActiveStore(location: StockEntryLocation) {
  return location.is_store && location.is_active;
}

function isCentralStore(location: StockEntryLocation) {
  return isActiveStore(location) && location.hierarchy_level === 1 && Boolean(location.is_main_store);
}

function getParentStandalone(location: StockEntryLocation, locationsById: Map<number, StockEntryLocation>) {
  const seen = new Set<number>();
  let current: StockEntryLocation | undefined = location;

  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    if (current.is_standalone && !current.is_store) return current;
    current = current.parent_location == null ? undefined : locationsById.get(current.parent_location);
  }

  return null;
}

function getMainStoreForStandalone(
  standalone: StockEntryLocation,
  locationsById: Map<number, StockEntryLocation>,
  locations: StockEntryLocation[],
) {
  const linkedMainStoreId = standalone.main_store_id ?? standalone.auto_created_store ?? null;
  if (linkedMainStoreId) {
    const linked = locationsById.get(linkedMainStoreId);
    if (linked && isActiveStore(linked)) return linked;
  }

  return locations.find(location => (
    isActiveStore(location) &&
    Boolean(location.is_main_store) &&
    getParentStandalone(location, locationsById)?.id === standalone.id
  )) ?? null;
}

function getContainingMainStore(
  location: StockEntryLocation,
  locationsById: Map<number, StockEntryLocation>,
  locations: StockEntryLocation[],
) {
  if (isActiveStore(location) && Boolean(location.is_main_store)) return location;

  const seen = new Set<number>();
  let current = location.parent_location == null ? undefined : locationsById.get(location.parent_location);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    if (isActiveStore(current) && Boolean(current.is_main_store)) return current;
    if (current.is_standalone && !current.is_store) {
      return getMainStoreForStandalone(current, locationsById, locations);
    }
    current = current.parent_location == null ? undefined : locationsById.get(current.parent_location);
  }

  const parentStandalone = getParentStandalone(location, locationsById);
  return parentStandalone ? getMainStoreForStandalone(parentStandalone, locationsById, locations) : null;
}

export function getTransferDestinationStores(
  sourceStoreId: string | number | null | undefined,
  locations: StockEntryLocation[],
) {
  const sourceId = toNumericId(sourceStoreId);
  if (sourceId == null) return [];

  const locationsById = byId(locations);
  const sourceStore = locationsById.get(sourceId);
  if (!sourceStore || !isActiveStore(sourceStore)) return [];

  const activeStores = locations.filter(isActiveStore);
  if (isCentralStore(sourceStore)) {
    return activeStores.filter(location => (
      location.id !== sourceStore.id &&
      (
        (location.hierarchy_level === 2 && Boolean(location.is_main_store)) ||
        (location.hierarchy_level === 1 && !Boolean(location.is_main_store))
      )
    ));
  }

  const sourceStandalone = getParentStandalone(sourceStore, locationsById);
  if (!sourceStandalone) return [];

  const sourceMainStore = getContainingMainStore(sourceStore, locationsById, locations);
  const sourceIsMainStore = sourceMainStore?.id === sourceStore.id || Boolean(sourceStore.is_main_store);

  if (sourceIsMainStore) {
    return activeStores.filter(location => {
      if (location.id === sourceStore.id) return false;
      if (isCentralStore(location)) return true;
      if (Boolean(location.is_main_store)) return false;
      return getParentStandalone(location, locationsById)?.id === sourceStandalone.id;
    });
  }

  return activeStores.filter(location => {
    if (location.id === sourceStore.id) return false;
    if (getParentStandalone(location, locationsById)?.id !== sourceStandalone.id) return false;
    return location.id === sourceMainStore?.id || !Boolean(location.is_main_store);
  });
}

export function getAllocatableTargetLocations(
  sourceStoreId: string | number | null | undefined,
  locations: StockEntryLocation[],
) {
  const sourceId = toNumericId(sourceStoreId);
  if (sourceId == null) return [];

  const locationsById = byId(locations);
  const sourceStore = locationsById.get(sourceId);
  if (!sourceStore || !isActiveStore(sourceStore)) return [];

  const sourceStandalone = getParentStandalone(sourceStore, locationsById);
  if (!sourceStandalone) return [];

  return locations.filter(location => (
    location.is_active &&
    !location.is_store &&
    !location.is_standalone &&
    getParentStandalone(location, locationsById)?.id === sourceStandalone.id
  ));
}

export function getAllocatableTargetPersons<T extends StockEntryPerson>(
  sourceStoreId: string | number | null | undefined,
  locations: StockEntryLocation[],
  persons: T[],
) {
  const sourceId = toNumericId(sourceStoreId);
  if (sourceId == null) return [];

  const locationsById = byId(locations);
  const sourceStore = locationsById.get(sourceId);
  if (!sourceStore || !isActiveStore(sourceStore)) return [];

  const sourceStandalone = getParentStandalone(sourceStore, locationsById);
  if (!sourceStandalone) return [];

  return persons.filter(person => (
    person.is_active &&
    (person.standalone_locations ?? []).some(locationId => Number(locationId) === sourceStandalone.id)
  ));
}

export function getAllocatedReturnPersons<T extends StockEntryPerson>(
  receivingStoreId: string | number | null | undefined,
  persons: T[],
  allocations: StockAllocationRecord[],
) {
  const storeId = toNumericId(receivingStoreId);
  if (storeId == null) return [];

  const allocatedPersonIds = new Set(
    allocations
      .filter(allocation => (
        allocation.status === "ALLOCATED" &&
        Number(allocation.source_location) === storeId &&
        allocation.allocated_to_person != null
      ))
      .map(allocation => Number(allocation.allocated_to_person)),
  );

  return persons.filter(person => person.is_active && allocatedPersonIds.has(person.id));
}

export function getAllocatedReturnLocations<T extends StockEntryLocation>(
  receivingStoreId: string | number | null | undefined,
  locations: T[],
  allocations: StockAllocationRecord[],
) {
  const storeId = toNumericId(receivingStoreId);
  if (storeId == null) return [];

  const allocatedLocationIds = new Set(
    allocations
      .filter(allocation => (
        allocation.status === "ALLOCATED" &&
        Number(allocation.source_location) === storeId &&
        allocation.allocated_to_location != null
      ))
      .map(allocation => Number(allocation.allocated_to_location)),
  );

  return locations.filter(location => (
    location.is_active &&
    !location.is_store &&
    allocatedLocationIds.has(location.id)
  ));
}

export function getUserAssignedStores<T extends StockEntryLocation>(
  assignedLocationIds: number[] | null | undefined,
  locations: T[],
) {
  if (!assignedLocationIds?.length) return [];
  const assignedIds = new Set(assignedLocationIds.map(Number));
  return locations.filter(location => location.is_active && location.is_store && assignedIds.has(location.id));
}
