import { describe, expect, it } from "vitest";
import { buildStockEntryPayload, getStockEntryDisplayDirection, getStockEntryRegisterStoreId, getStockEntrySourceRegisterOptions, resolveStockEntrySourceRegisterValue, validateStockEntryForm, type StockEntryFormState } from "./stockEntryFormRules";

const baseForm: StockEntryFormState = {
  entry_type: "ISSUE",
  issue_target: "STORE",
  return_source: "PERSON",
  from_location: "10",
  to_location: "20",
  issued_to: "",
  status: "DRAFT",
  purpose: "Lab movement",
  remarks: "",
  items: [
    {
      item: "3",
      batch: "",
      quantity: "2",
      instances: ["4", "5"],
      stock_register: "",
      page_number: "",
    },
  ],
};

describe("stock entry form rules", () => {
  it("builds issue payloads with source store and employee recipient", () => {
    expect(
      buildStockEntryPayload({
        ...baseForm,
        issue_target: "PERSON",
        to_location: "",
        issued_to: "7",
      }),
    ).toMatchObject({
      entry_type: "ISSUE",
      from_location: 10,
      to_location: null,
      issued_to: 7,
      status: "COMPLETED",
    });
  });

  it("builds store-transfer issue payloads as pending acknowledgement", () => {
    expect(
      buildStockEntryPayload({
        ...baseForm,
        status: "COMPLETED",
        issue_target: "STORE",
      }),
    ).toMatchObject({
      entry_type: "ISSUE",
      from_location: 10,
      to_location: 20,
      status: "PENDING_ACK",
    });
  });

  it("builds receipt payloads with receiving store and employee return source", () => {
    expect(
      buildStockEntryPayload({
        ...baseForm,
        entry_type: "RECEIPT",
        return_source: "PERSON",
        from_location: "",
        to_location: "10",
        issued_to: "7",
      }),
    ).toMatchObject({
      entry_type: "RECEIPT",
      from_location: null,
      to_location: 10,
      issued_to: 7,
      status: "COMPLETED",
    });
  });

  it("builds receipt payloads with receiving store and non-store return source", () => {
    expect(
      buildStockEntryPayload({
        ...baseForm,
        entry_type: "RECEIPT",
        return_source: "LOCATION",
        from_location: "33",
        to_location: "10",
        issued_to: "",
      }),
    ).toMatchObject({
      entry_type: "RECEIPT",
      from_location: 33,
      to_location: 10,
      issued_to: null,
      status: "COMPLETED",
    });
  });

  it("includes selected instance ids in line item payloads", () => {
    expect(buildStockEntryPayload(baseForm).items[0]).toMatchObject({
      instances: [4, 5],
    });
  });

  it("validates receipt fields independently from issue source-store fields", () => {
    expect(
      validateStockEntryForm({
        ...baseForm,
        entry_type: "RECEIPT",
        return_source: "PERSON",
        from_location: "",
        to_location: "",
        issued_to: "",
      }),
    ).toMatchObject({
      to_location: "Choose the receiving store.",
      issued_to: "Choose the employee returning stock.",
    });
  });

  it("uses the issue source store for source-register options", () => {
    const registers = [
      { id: 1, store: 10, is_active: true },
      { id: 2, store: 20, is_active: true },
      { id: 3, store: 10, is_active: false },
    ];

    expect(getStockEntryRegisterStoreId(baseForm)).toBe("10");
    expect(getStockEntrySourceRegisterOptions(baseForm, registers).map(register => register.id)).toEqual([1]);
  });

  it("uses the receipt receiving store for source-register options", () => {
    const receiptForm: StockEntryFormState = {
      ...baseForm,
      entry_type: "RECEIPT",
      return_source: "PERSON",
      from_location: "",
      to_location: "20",
      issued_to: "7",
    };
    const registers = [
      { id: 1, store: 10, is_active: true },
      { id: 2, store: 20, is_active: true },
      { id: 3, store: 20, is_active: false },
    ];

    expect(getStockEntryRegisterStoreId(receiptForm)).toBe("20");
    expect(getStockEntrySourceRegisterOptions(receiptForm, registers).map(register => register.id)).toEqual([2]);
  });

  it("defaults the only available source register so it is visible without searching", () => {
    expect(resolveStockEntrySourceRegisterValue("", [
      { id: 1, store: 10, is_active: true },
    ])).toBe("1");
  });

  it("preserves a valid selected source register and clears invalid stale values", () => {
    const registers = [
      { id: 1, store: 10, is_active: true },
      { id: 2, store: 10, is_active: true },
    ];

    expect(resolveStockEntrySourceRegisterValue("2", registers)).toBe("2");
    expect(resolveStockEntrySourceRegisterValue("99", registers)).toBe("");
  });

  it("displays employee return receipts from the employee back to the receiving store", () => {
    expect(
      getStockEntryDisplayDirection({
        entry_type: "RECEIPT",
        from_location_name: null,
        to_location_name: "CSIT Main Store",
        issued_to_name: "Dr. Umar Farooq",
      }),
    ).toEqual({
      source: "Dr. Umar Farooq",
      target: "CSIT Main Store",
    });
  });

  it("displays inspection-generated receipts from the inspection contract", () => {
    expect(
      getStockEntryDisplayDirection({
        entry_type: "RECEIPT",
        from_location_name: null,
        to_location_name: "Central Store",
        issued_to_name: null,
        inspection_certificate_number: "IC-2026-0042",
      }),
    ).toEqual({
      source: "Inspection / IC-2026-0042",
      target: "Central Store",
    });
  });
});
