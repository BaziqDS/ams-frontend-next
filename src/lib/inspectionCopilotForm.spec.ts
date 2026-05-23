import { describe, expect, it } from "vitest";
import {
  applyInspectionItemCopilotPatches,
  buildInspectionCertificateItemCopilotFields,
  buildInspectionFinanceCopilotFields,
  buildInspectionItemArrayCopilotFields,
  buildInspectionItemCopilotFields,
  parseInspectionItemFieldPath,
  syncInspectionItemReferences,
} from "./inspectionCopilotForm";

describe("inspection copilot form helpers", () => {
  it("parses dotted and bracket item field paths", () => {
    expect(parseInspectionItemFieldPath("items.0.central_register")).toEqual({
      index: 0,
      field: "central_register",
    });
    expect(parseInspectionItemFieldPath("items[2].central_register_page_no")).toEqual({
      index: 2,
      field: "central_register_page_no",
    });
    expect(parseInspectionItemFieldPath("central_register")).toBeNull();
  });

  it("patches nested central register fields without replacing existing item data", () => {
    const currentItems = [
      {
        id: 10,
        item_description: "core i5",
        accepted_quantity: 11,
        central_register: null,
        central_register_page_no: "",
      },
    ];

    const result = applyInspectionItemCopilotPatches({
      currentItems,
      values: {
        "items.0.central_register": "5",
        "items.0.central_register_page_no": "44",
      },
      blankItem: () => ({
        item_description: "",
        accepted_quantity: 0,
        central_register: null,
        central_register_page_no: "",
      }),
    });

    expect(result.applied).toEqual([
      "items.0.central_register",
      "items.0.central_register_page_no",
    ]);
    expect(result.ignored).toEqual([]);
    expect(result.nextItems[0]).toMatchObject({
      id: 10,
      item_description: "core i5",
      accepted_quantity: 11,
      central_register: 5,
      central_register_page_no: "44",
    });
  });

  it("merges bulk item patches over existing rows instead of blanking untouched fields", () => {
    const currentItems = [
      {
        id: 10,
        item_description: "core i5",
        accepted_quantity: 11,
        central_register: null,
        central_register_page_no: "",
      },
    ];

    const result = applyInspectionItemCopilotPatches({
      currentItems,
      values: {
        items: [{ central_register: 7, central_register_page_no: "50" }],
      },
      blankItem: () => ({
        item_description: "",
        accepted_quantity: 0,
        central_register: null,
        central_register_page_no: "",
      }),
    });

    expect(result.applied).toEqual(["items"]);
    expect(result.nextItems[0]).toMatchObject({
      id: 10,
      item_description: "core i5",
      accepted_quantity: 11,
      central_register: 7,
      central_register_page_no: "50",
    });
  });

  it("expands create-form bulk item patches into visible rows", () => {
    const result = applyInspectionItemCopilotPatches({
      currentItems: [
        {
          item_description: "",
          tendered_quantity: 1,
          accepted_quantity: 0,
          rejected_quantity: 0,
          unit_price: "0.00",
          remarks: "",
        },
      ],
      values: {
        items: [
          {
            item_description: "Soccer Balls",
            tendered_quantity: 50,
            accepted_quantity: 48,
            rejected_quantity: 2,
            unit_price: 25,
            remarks: "2 balls with minor stitching defects",
          },
          {
            item_description: "Basketballs",
            tendered_quantity: 30,
            accepted_quantity: 30,
            rejected_quantity: 0,
            unit_price: 35,
            remarks: "All items in good condition",
          },
          {
            item_description: "Tennis Rackets",
            tendered_quantity: 25,
            accepted_quantity: 23,
            rejected_quantity: 2,
            unit_price: 60,
            remarks: "2 rackets with frame scratches",
          },
        ],
      },
      blankItem: () => ({
        item_description: "",
        tendered_quantity: 1,
        accepted_quantity: 0,
        rejected_quantity: 0,
        unit_price: "0.00",
        remarks: "",
      }),
    });

    expect(result.applied).toEqual(["items"]);
    expect(result.ignored).toEqual([]);
    expect(result.nextItems).toHaveLength(3);
    expect(result.nextItems.map(item => item.item_description)).toEqual([
      "Soccer Balls",
      "Basketballs",
      "Tennis Rackets",
    ]);
    expect(result.nextItems[0]).toMatchObject({
      tendered_quantity: 50,
      accepted_quantity: 48,
      rejected_quantity: 2,
      unit_price: 25,
      remarks: "2 balls with minor stitching defects",
    });
  });

  it("uses explicit row indexes in bulk item patches instead of array position", () => {
    const currentItems = [
      {
        id: 10,
        item_description: "rejected line",
        accepted_quantity: 0,
        central_register: null,
        central_register_page_no: "",
      },
      {
        id: 11,
        item_description: "accepted line",
        accepted_quantity: 3,
        central_register: null,
        central_register_page_no: "",
      },
    ];

    const result = applyInspectionItemCopilotPatches({
      currentItems,
      values: {
        items: [{ index: 1, central_register: 7, central_register_page_no: "50" }],
      },
      blankItem: () => ({
        item_description: "",
        accepted_quantity: 0,
        central_register: null,
        central_register_page_no: "",
      }),
    });

    expect(result.applied).toEqual(["items"]);
    expect(result.nextItems[0]).toMatchObject({
      id: 10,
      item_description: "rejected line",
      accepted_quantity: 0,
      central_register: null,
      central_register_page_no: "",
    });
    expect(result.nextItems[1]).toMatchObject({
      id: 11,
      item_description: "accepted line",
      accepted_quantity: 3,
      central_register: 7,
      central_register_page_no: "50",
    });
  });

  it("builds exact per-row writable fields for central register controls", () => {
    const fields = buildInspectionItemCopilotFields({
      items: [{ item_description: "core i5", accepted_quantity: 1 }],
      canEditStock: false,
      canEditCentral: true,
      departmentRegisterOptions: [],
      centralRegisterOptions: [{ id: 5, register_number: "CSR-1" }],
      itemOptions: [{
        id: 9,
        name: "Processor",
        code: "ITM-0001",
        description: "Intel desktop processor",
        specifications: "Core i5, 12th generation",
      }],
    });

    expect(fields.map(field => field.name)).toEqual([
      "items.0.central_register",
      "items.0.central_register_page_no",
      "items.0.item",
      "items.0.batch_number",
      "items.0.manufactured_date",
      "items.0.expiry_date",
    ]);
    expect(fields[0].options).toEqual([{ label: "CSR-1", value: 5 }]);
    expect(fields[2].options).toEqual([{
      label: "Processor (ITM-0001)",
      value: 9,
      description: "Intel desktop processor",
      specifications: "Core i5, 12th generation",
    }]);
    expect(fields.find(field => field.name === "items.0.central_register")).toMatchObject({
      required: true,
      optionSource: "inspection.centralRegisters",
      resolver: "search_form_options",
    });
    expect(fields.find(field => field.name === "items.0.central_register_page_no")).toMatchObject({
      required: true,
    });
    expect(fields.find(field => field.name === "items.0.item")).toMatchObject({
      required: true,
      optionSource: "inspection.catalogItems",
      resolver: "search_form_options",
    });
    expect(fields.find(field => field.name === "items.0.item")?.description).toMatch(
      /description and specifications/i,
    );
    expect(fields.find(field => field.name === "items.0.item")?.description).toMatch(
      /do not create/i,
    );
  });

  it("marks department stock register controls required when stock stage is active", () => {
    const fields = buildInspectionItemCopilotFields({
      items: [{ item_description: "core i5", accepted_quantity: 1 }],
      canEditStock: true,
      canEditCentral: false,
      departmentRegisterOptions: [{ id: 3, register_number: "DSR-1" }],
      centralRegisterOptions: [],
      itemOptions: [],
    });

    expect(fields.find(field => field.name === "items.0.stock_register")).toMatchObject({
      required: true,
      optionSource: "inspection.departmentStockRegisters",
      resolver: "search_form_options",
    });
    expect(fields.find(field => field.name === "items.0.stock_register_page_no")).toMatchObject({
      required: true,
    });
    expect(fields.find(field => field.name === "items.0.stock_entry_date")).toMatchObject({
      required: true,
    });
  });

  it("builds exact per-row writable fields for finance review fixed assets", () => {
    const fields = buildInspectionFinanceCopilotFields({
      items: [
        {
          item_description: "Dell laptop",
          accepted_quantity: 2,
          item_category_type: "FIXED_ASSET",
        },
        {
          item_description: "Printer ink",
          accepted_quantity: 4,
          item_category_type: "CONSUMABLE",
        },
      ],
      assetClassOptions: [{ id: 12, name: "Computer Equipment", code: "COMP" }],
    });

    expect(fields.map(field => field.name)).toEqual([
      "items.0.depreciation_asset_class",
      "items.0.capitalization_date",
      "items.0.capitalization_cost",
    ]);
    expect(fields.find(field => field.name === "items.0.depreciation_asset_class")).toMatchObject({
      type: "select",
      required: true,
      optionSource: "inspection.assetClasses",
      resolver: "search_form_options",
      options: [{ label: "Computer Equipment (COMP)", value: 12 }],
    });
    expect(fields.find(field => field.name === "items.0.capitalization_date")).toMatchObject({
      type: "date",
      required: true,
    });
    expect(fields.find(field => field.name === "items.0.capitalization_cost")).toMatchObject({
      type: "number",
      required: true,
    });
  });

  it("builds exact per-row writable fields for inspection certificate item rows", () => {
    const fields = buildInspectionCertificateItemCopilotFields({
      items: [{ item_description: "Laptop", tendered_quantity: 2, accepted_quantity: 1, rejected_quantity: 1 }],
      canEditItems: true,
      canEditStock: false,
      canEditCentral: false,
      departmentRegisterOptions: [],
      centralRegisterOptions: [],
      itemOptions: [],
    });

    expect(fields.map(field => field.name)).toEqual([
      "items.0.item_description",
      "items.0.tendered_quantity",
      "items.0.accepted_quantity",
      "items.0.rejected_quantity",
      "items.0.unit_price",
      "items.0.remarks",
    ]);
    expect(fields.find(field => field.name === "items.0.item_description")).toMatchObject({
      required: true,
    });
    expect(fields.find(field => field.name === "items.0.remarks")).toMatchObject({
      required: true,
    });
  });

  it("builds strict bulk array item fields for inspection certificate rows", () => {
    expect(
      buildInspectionItemArrayCopilotFields({
        canEditItems: true,
        canEditStock: false,
        canEditCentral: false,
      }).map(field => field.name),
    ).toEqual([
      "item_description",
      "item_specifications",
      "tendered_quantity",
      "accepted_quantity",
      "rejected_quantity",
      "unit_price",
      "remarks",
    ]);
  });

  it("resolves copied register numbers and item names back to select ids", () => {
    const result = syncInspectionItemReferences({
      items: [
        {
          item_description: "core i5",
          item: null,
          central_register: null,
          central_register_no: "CENT-1",
          central_register_page_no: "10",
        },
      ],
      departmentRegisterOptions: [],
      centralRegisterOptions: [{ id: 5, register_number: "CENT-1" }],
      itemOptions: [{ id: 9, name: "core i5", code: "ITM-0009", category_type: "CONSUMABLE", tracking_type: "INDIVIDUAL" }],
    });

    expect(result[0]).toMatchObject({
      item: 9,
      item_name: "core i5",
      item_code: "ITM-0009",
      central_register: 5,
      central_register_no: "CENT-1",
      central_register_page_no: "10",
    });
  });
});
