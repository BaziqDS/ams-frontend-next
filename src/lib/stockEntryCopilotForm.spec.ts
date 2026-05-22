import { describe, expect, it } from "vitest";

import {
  applyStockEntryCopilotValuePatch,
  buildStockEntryCopilotReferenceContext,
} from "./stockEntryCopilotForm";
import type { StockEntryFormState } from "./stockEntryFormRules";

const baseForm: StockEntryFormState = {
  entry_type: "ISSUE",
  issue_target: "STORE",
  return_source: "PERSON",
  from_location: "10",
  to_location: "20",
  issued_to: "",
  status: "PENDING_ACK",
  purpose: "Lab transfer",
  remarks: "",
  items: [
    {
      item: "3",
      batch: "",
      quantity: "1",
      instances: [],
      stock_register: "",
      page_number: "",
    },
  ],
};

describe("stock entry copilot form helpers", () => {
  it("merges partial line-item patches without wiping selected item fields", () => {
    const result = applyStockEntryCopilotValuePatch(baseForm, {
      items: [
        {
          index: 0,
          instances: [44, "45"],
          stock_register: 9,
          page_number: 12,
        },
      ],
    });

    expect(result.nextForm.items[0]).toEqual({
      item: "3",
      batch: "",
      quantity: "2",
      instances: ["44", "45"],
      stock_register: "9",
      page_number: "12",
    });
    expect(result.applied).toEqual(["items"]);
    expect(result.ignored).toEqual([]);
  });

  it("documents store, person, and non-store issue targets plus register and instance options", () => {
    const context = buildStockEntryCopilotReferenceContext({
      formId: "stock-entry-create",
      active: true,
      form: baseForm,
      sourceStores: [{ id: 10, name: "Main Store" }],
      destinationStores: [{ id: 20, name: "Lab Store" }],
      destinationLocations: [{ id: 30, name: "Physics Lab" }],
      receivingPersons: [{ id: 7, name: "Ayesha Khan" }],
      returningPersons: [],
      returningLocations: [],
      sourceRegisters: [{ id: 9, register_number: "DSR-01", store: 10 }],
      lineItems: [
        {
          index: 0,
          itemOptions: [{ id: 3, name: "Microscope", code: "MIC-01" }],
          batchOptions: [],
          instanceOptions: [
            { id: 44, serial_number: "SN-044", qr_code: "QR-044" },
            { id: 45, serial_number: "SN-045", qr_code: "QR-045" },
          ],
        },
      ],
    });

    expect(context.movement_modes.map(mode => mode.issue_target)).toEqual([
      "STORE",
      "PERSON",
      "LOCATION",
    ]);
    expect(context.line_item_options[0]).toMatchObject({
      index: 0,
      source_register_options: [{ value: "9", label: "DSR-01", store: 10 }],
      instance_options: [
        { value: "44", label: "SN-044", qr_code: "QR-044" },
        { value: "45", label: "SN-045", qr_code: "QR-045" },
      ],
    });
  });
});
