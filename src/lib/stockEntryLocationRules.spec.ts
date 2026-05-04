import { describe, expect, it } from "vitest";
import {
  getAllocatedReturnLocations,
  getAllocatedReturnPersons,
  getUserAssignedStores,
  getAllocatableTargetLocations,
  getAllocatableTargetPersons,
  getTransferDestinationStores,
  type StockAllocationRecord,
  type StockEntryLocation,
  type StockEntryPerson,
} from "./stockEntryLocationRules";

const locations: StockEntryLocation[] = [
  {
    id: 1,
    name: "NED University",
    parent_location: null,
    is_store: false,
    is_standalone: true,
    is_main_store: false,
    is_active: true,
    hierarchy_level: 0,
    main_store_id: 2,
  },
  {
    id: 2,
    name: "Central Store",
    parent_location: 1,
    is_store: true,
    is_standalone: false,
    is_main_store: true,
    is_active: true,
    hierarchy_level: 1,
  },
  {
    id: 10,
    name: "Computer Science",
    parent_location: 1,
    is_store: false,
    is_standalone: true,
    is_main_store: false,
    is_active: true,
    hierarchy_level: 1,
    main_store_id: 11,
  },
  {
    id: 15,
    name: "White House",
    parent_location: 1,
    is_store: true,
    is_standalone: false,
    is_main_store: false,
    is_active: true,
    hierarchy_level: 1,
  },
  {
    id: 16,
    name: "Admin Store",
    parent_location: 1,
    is_store: true,
    is_standalone: false,
    is_main_store: false,
    is_active: true,
    hierarchy_level: 1,
  },
  {
    id: 11,
    name: "CS Main Store",
    parent_location: 10,
    is_store: true,
    is_standalone: false,
    is_main_store: true,
    is_active: true,
    hierarchy_level: 2,
  },
  {
    id: 12,
    name: "CS Lab 1",
    parent_location: 10,
    is_store: false,
    is_standalone: false,
    is_main_store: false,
    is_active: true,
    hierarchy_level: 2,
  },
  {
    id: 13,
    name: "CS Lab 1 Store",
    parent_location: 12,
    is_store: true,
    is_standalone: false,
    is_main_store: false,
    is_active: true,
    hierarchy_level: 3,
  },
  {
    id: 14,
    name: "CS Lab 2 Store",
    parent_location: 11,
    is_store: true,
    is_standalone: false,
    is_main_store: false,
    is_active: true,
    hierarchy_level: 3,
  },
  {
    id: 20,
    name: "Electrical Engineering",
    parent_location: 1,
    is_store: false,
    is_standalone: true,
    is_main_store: false,
    is_active: true,
    hierarchy_level: 1,
    main_store_id: 21,
  },
  {
    id: 21,
    name: "EE Main Store",
    parent_location: 20,
    is_store: true,
    is_standalone: false,
    is_main_store: true,
    is_active: true,
    hierarchy_level: 2,
  },
  {
    id: 22,
    name: "EE Lab Store",
    parent_location: 21,
    is_store: true,
    is_standalone: false,
    is_main_store: false,
    is_active: true,
    hierarchy_level: 3,
  },
];

function destinationNames(sourceId: number) {
  return getTransferDestinationStores(String(sourceId), locations).map(location => location.name);
}

const persons: StockEntryPerson[] = [
  {
    id: 1,
    name: "CS Faculty",
    is_active: true,
    standalone_locations: [10],
  },
  {
    id: 2,
    name: "EE Faculty",
    is_active: true,
    standalone_locations: [20],
  },
  {
    id: 3,
    name: "Inactive CS Faculty",
    is_active: false,
    standalone_locations: [10],
  },
];

const allocations: StockAllocationRecord[] = [
  {
    id: 1,
    source_location: 11,
    allocated_to_person: 1,
    allocated_to_location: null,
    status: "ALLOCATED",
  },
  {
    id: 2,
    source_location: 11,
    allocated_to_person: null,
    allocated_to_location: 12,
    status: "ALLOCATED",
  },
  {
    id: 3,
    source_location: 21,
    allocated_to_person: 2,
    allocated_to_location: null,
    status: "ALLOCATED",
  },
  {
    id: 4,
    source_location: 11,
    allocated_to_person: 3,
    allocated_to_location: null,
    status: "RETURNED",
  },
];

describe("stock entry store transfer hierarchy", () => {
  it("allows the central store to transfer to root-level stores and standalone main stores", () => {
    expect(destinationNames(2)).toEqual(["White House", "Admin Store", "CS Main Store", "EE Main Store"]);
  });

  it("allows a standalone main store to transfer to central and non-main stores in the same standalone", () => {
    expect(destinationNames(11)).toEqual(["Central Store", "CS Lab 1 Store", "CS Lab 2 Store"]);
  });

  it("allows a regular store to transfer to its own main store and peer stores in the same standalone", () => {
    expect(destinationNames(13)).toEqual(["CS Main Store", "CS Lab 2 Store"]);
  });

  it("allows a root-level regular store to transfer to the central store and peer root stores", () => {
    expect(destinationNames(15)).toEqual(["Central Store", "Admin Store"]);
  });

  it("limits non-store allocation targets to the source store standalone scope", () => {
    expect(getAllocatableTargetLocations("11", locations).map(location => location.name)).toEqual(["CS Lab 1"]);
  });

  it("limits person allocation targets to active people in the source store standalone scope", () => {
    expect(getAllocatableTargetPersons("13", locations, persons).map(person => person.name)).toEqual(["CS Faculty"]);
  });

  it("limits return persons to active allocations from the receiving store", () => {
    expect(getAllocatedReturnPersons("11", persons, allocations).map(person => person.name)).toEqual(["CS Faculty"]);
  });

  it("limits return non-store locations to active allocations from the receiving store", () => {
    expect(getAllocatedReturnLocations("11", locations, allocations).map(location => location.name)).toEqual(["CS Lab 1"]);
  });

  it("finds the current user's directly assigned active stores", () => {
    expect(getUserAssignedStores([11, 12, 21], locations).map(location => location.name)).toEqual(["CS Main Store", "EE Main Store"]);
  });
});
