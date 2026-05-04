import { describe, expect, it } from "vitest";
import {
  buildStageItemsPayload,
  filterStockRegistersForInspectionStore,
  getAutoSelectedInspectionLocation,
  getDefaultFinanceCheckDate,
  getInspectionCentralStoreRegisters,
  getInspectionItemFinancials,
  getInspectionMainStoreRegisters,
  getInspectionQuantityError,
  getInspectionQuantityUpdateError,
  getScopedInspectionLocations,
  normalizeStageItems,
  parseInspectionQuantity,
} from "./inspectionStageForms";

describe("inspection stage form helpers", () => {
  it("normalizes copied stage items so the forms can edit missing fields safely", () => {
    expect(
      normalizeStageItems([
        {
          id: 7,
          item: null,
          item_description: "Laptop",
          tendered_quantity: 3,
          accepted_quantity: 2,
          rejected_quantity: 1,
          unit_price: "100.00",
        } as any,
      ]),
    ).toEqual([
      expect.objectContaining({
        id: 7,
        item_description: "Laptop",
        item_specifications: "",
        stock_register: null,
        stock_register_no: "",
        stock_register_page_no: "",
        central_register: null,
        central_register_no: "",
        central_register_page_no: "",
        batch_number: "",
        manufactured_date: "",
        expiry_date: "",
      }),
    ]);
  });

  it("builds stock payloads without central-only fields", () => {
    expect(
      buildStageItemsPayload([
        {
          id: 7,
          item: 3,
          item_description: "Laptop",
          item_specifications: "i7",
          tendered_quantity: 3,
          accepted_quantity: 2,
          rejected_quantity: 1,
          unit_price: "100.00",
          remarks: "",
          stock_register: 11,
          stock_register_no: "DPT-1",
          stock_register_page_no: "8",
          stock_entry_date: "2026-04-26",
          central_register: 21,
          central_register_no: "CENT-1",
          central_register_page_no: "9",
          batch_number: "B-1",
          manufactured_date: "2026-04-01",
          expiry_date: "2027-04-26",
        },
      ], "stock"),
    ).toEqual([
      {
        id: 7,
        item: 3,
        item_description: "Laptop",
        item_specifications: "i7",
        tendered_quantity: 3,
        accepted_quantity: 2,
        rejected_quantity: 1,
        unit_price: "100.00",
        remarks: null,
        stock_register: 11,
        stock_register_no: "DPT-1",
        stock_register_page_no: "8",
        stock_entry_date: "2026-04-26",
      },
    ]);
  });

  it("builds central payloads with perishable tracking metadata", () => {
    expect(
      buildStageItemsPayload([
        {
          id: 7,
          item: 3,
          item_description: "Chemical",
          item_specifications: "Lab grade",
          tendered_quantity: 3,
          accepted_quantity: 2,
          rejected_quantity: 1,
          unit_price: "100.00",
          remarks: "",
          stock_register: 11,
          stock_register_no: "DPT-1",
          stock_register_page_no: "8",
          stock_entry_date: "2026-04-26",
          central_register: 21,
          central_register_no: "CENT-1",
          central_register_page_no: "9",
          batch_number: "B-1",
          manufactured_date: "2026-04-01",
          expiry_date: "2027-04-26",
        },
      ], "central"),
    ).toEqual([
      {
        id: 7,
        item: 3,
        item_description: "Chemical",
        item_specifications: "Lab grade",
        tendered_quantity: 3,
        accepted_quantity: 2,
        rejected_quantity: 1,
        unit_price: "100.00",
        remarks: null,
        stock_register: 11,
        stock_register_no: "DPT-1",
        stock_register_page_no: "8",
        stock_entry_date: "2026-04-26",
        central_register: 21,
        central_register_no: "CENT-1",
        central_register_page_no: "9",
        batch_number: "B-1",
        manufactured_date: "2026-04-01",
        expiry_date: "2027-04-26",
      },
    ]);
  });

  it("clamps invalid quantities to zero", () => {
    expect(parseInspectionQuantity("-4")).toBe(0);
    expect(parseInspectionQuantity("abc")).toBe(0);
    expect(parseInspectionQuantity("12")).toBe(12);
  });

  it("computes unit price and accepted total for item summary tables", () => {
    expect(
      getInspectionItemFinancials({
        accepted_quantity: 3,
        unit_price: "1250.50",
      } as any),
    ).toEqual({
      unitPrice: 1250.5,
      totalPrice: 3751.5,
    });
  });

  it("rejects inspection item quantities that exceed tendered quantity", () => {
    expect(
      getInspectionQuantityError({
        tendered_quantity: 5,
        accepted_quantity: 6,
        rejected_quantity: 0,
      } as any),
    ).toBe("Accepted quantity cannot exceed tendered quantity.");

    expect(
      getInspectionQuantityError({
        tendered_quantity: 5,
        accepted_quantity: 0,
        rejected_quantity: 6,
      } as any),
    ).toBe("Rejected quantity cannot exceed tendered quantity.");

    expect(
      getInspectionQuantityError({
        tendered_quantity: 5,
        accepted_quantity: 4,
        rejected_quantity: 2,
      } as any),
    ).toBe("Accepted and rejected quantities cannot exceed tendered quantity.");

    expect(
      getInspectionQuantityError({
        tendered_quantity: 5,
        accepted_quantity: 3,
        rejected_quantity: 2,
      } as any),
    ).toBeNull();
  });

  it("checks proposed quantity edits before committing them", () => {
    const item = {
      tendered_quantity: 5,
      accepted_quantity: 2,
      rejected_quantity: 1,
    } as any;

    expect(getInspectionQuantityUpdateError(item, { accepted_quantity: 6 })).toBe(
      "Accepted quantity cannot exceed tendered quantity.",
    );
    expect(getInspectionQuantityUpdateError(item, { rejected_quantity: 4 })).toBe(
      "Accepted and rejected quantities cannot exceed tendered quantity.",
    );
    expect(getInspectionQuantityUpdateError(item, { tendered_quantity: 2 })).toBe(
      "Accepted and rejected quantities cannot exceed tendered quantity.",
    );
    expect(getInspectionQuantityUpdateError(item, { accepted_quantity: 3 })).toBeNull();
  });

  it("filters stock registers to the inspection location main store when available", () => {
    const registers = [
      { id: 1, register_number: "A", store: 10, store_name: "Electrical Main Store" },
      { id: 2, register_number: "B", store: 11, store_name: "Central Store" },
    ] as any[];

    expect(filterStockRegistersForInspectionStore(registers, 10)).toEqual([registers[0]]);
  });

  it("uses the inspection location main store for stock-detail register options", () => {
    const registers = [
      { id: 1, register_number: "CSR-CENTRAL", store: 10, store_name: "Central Store" },
      { id: 2, register_number: "CSR-CSIT", store: 11, store_name: "CSIT Main Store" },
      { id: 3, register_number: "CSR-EE", store: 12, store_name: "EE Main Store" },
    ] as any[];

    expect(getInspectionMainStoreRegisters(registers, { main_store_id: 10 })).toEqual([registers[0]]);
    expect(getInspectionMainStoreRegisters(registers, { main_store_id: 11 })).toEqual([registers[1]]);
  });

  it("uses the root-level central store for central register options", () => {
    const registers = [
      { id: 1, register_number: "CSR-CENTRAL", store: 10, store_name: "Central Store" },
      { id: 2, register_number: "CSR-CSIT", store: 11, store_name: "CSIT Main Store" },
      { id: 3, register_number: "CSR-EE", store: 12, store_name: "EE Main Store" },
    ] as any[];

    expect(
      getInspectionCentralStoreRegisters(registers, {
        main_store_id: 11,
        root_main_store_id: 10,
        hierarchy_level: 1,
      }),
    ).toEqual([registers[0]]);

    expect(
      getInspectionCentralStoreRegisters(registers, {
        main_store_id: 10,
        root_main_store_id: 10,
        hierarchy_level: 0,
      }),
    ).toEqual([registers[0]]);
  });

  it("keeps all stock registers when the location main store is unknown", () => {
    const registers = [
      { id: 1, register_number: "A", store: 10 },
      { id: 2, register_number: "B", store: 11 },
    ] as any[];

    expect(filterStockRegistersForInspectionStore(registers, null)).toEqual(registers);
  });

  it("scopes inspection locations to assigned standalone locations for non-root users", () => {
    const locations = [
      { id: 1, name: "NED University", is_standalone: true, hierarchy_level: 0 },
      { id: 2, name: "Electrical Engineering", is_standalone: true, hierarchy_level: 1 },
      { id: 3, name: "Electrical Lab", is_standalone: false, hierarchy_level: 2 },
      { id: 4, name: "CSIT", is_standalone: true, hierarchy_level: 1 },
    ];

    expect(getScopedInspectionLocations(locations, [2, 3], false)).toEqual([locations[1]]);
  });

  it("keeps all standalone locations only for unrestricted users", () => {
    const locations = [
      { id: 1, name: "NED University", is_standalone: true, hierarchy_level: 0 },
      { id: 2, name: "Electrical Engineering", is_standalone: true, hierarchy_level: 1 },
      { id: 3, name: "Electrical Lab", is_standalone: false, hierarchy_level: 2 },
    ];

    expect(getScopedInspectionLocations(locations, [1], true)).toEqual([locations[0], locations[1]]);
  });

  it("treats a directly assigned root standalone as a single create option for regular users", () => {
    const locations = [
      { id: 1, name: "NED University", is_standalone: true, hierarchy_level: 0 },
      { id: 2, name: "Electrical Engineering", is_standalone: true, hierarchy_level: 1, hierarchy_path: "1/2" },
      { id: 3, name: "Electrical Lab", is_standalone: false, hierarchy_level: 2, hierarchy_path: "1/2/3" },
    ];

    expect(getScopedInspectionLocations(locations, [1], false)).toEqual([locations[0]]);
  });

  it("auto-selects only when exactly one scoped inspection location is available", () => {
    expect(getAutoSelectedInspectionLocation([{ id: 2 }])).toBe(2);
    expect(getAutoSelectedInspectionLocation([{ id: 2 }, { id: 4 }])).toBe("");
  });

  it("defaults a missing finance check date to today while preserving explicit values", () => {
    expect(getDefaultFinanceCheckDate("2026-05-03", new Date("2026-05-04T09:00:00Z"))).toBe("2026-05-03");
    expect(getDefaultFinanceCheckDate("", new Date("2026-05-04T09:00:00Z"))).toBe("2026-05-04");
    expect(getDefaultFinanceCheckDate(null, new Date("2026-12-31T09:00:00Z"))).toBe("2026-12-31");
  });
});
