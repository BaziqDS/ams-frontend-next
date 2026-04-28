import { describe, expect, it } from "vitest";
import {
  canResumeInspectionEditor,
  getCreateInspectionSubmitLabel,
  getInspectionAuditEntries,
  getInspectionRegisterCoverage,
  getInspectionRegisterRefs,
  getInspectionStageEditorLabel,
  getInspectionValueTotals,
  getInspectionWorkflowSteps,
  requiresDepartmentalStockStage,
} from "./inspectionUi";

describe("inspection UI helpers", () => {
  it("treats non-root departments as requiring stock details", () => {
    expect(requiresDepartmentalStockStage({ department_hierarchy_level: 2 })).toBe(true);
    expect(requiresDepartmentalStockStage({ department_hierarchy_level: 1 })).toBe(true);
  });

  it("skips stock details for root-level departments", () => {
    expect(requiresDepartmentalStockStage({ department_hierarchy_level: 0 })).toBe(false);
  });

  it("labels root-level create submission as central register", () => {
    expect(getCreateInspectionSubmitLabel(0)).toBe("Submit to Central Register");
    expect(getCreateInspectionSubmitLabel(2)).toBe("Submit to Stock Details");
    expect(getCreateInspectionSubmitLabel(null)).toBe("Submit to Stock Details");
  });

  it("builds the departmental workflow in order and marks the current step", () => {
    expect(
      getInspectionWorkflowSteps({
        department_hierarchy_level: 2,
        stage: "STOCK_DETAILS",
        rejection_stage: null,
      }).map(step => [step.key, step.state]),
    ).toEqual([
      ["DRAFT", "complete"],
      ["STOCK_DETAILS", "current"],
      ["CENTRAL_REGISTER", "upcoming"],
      ["FINANCE_REVIEW", "upcoming"],
      ["COMPLETED", "upcoming"],
    ]);
  });

  it("builds the main-university workflow without the stock-details stage", () => {
    expect(
      getInspectionWorkflowSteps({
        department_hierarchy_level: 0,
        stage: "CENTRAL_REGISTER",
        rejection_stage: null,
      }).map(step => [step.key, step.state]),
    ).toEqual([
      ["DRAFT", "complete"],
      ["CENTRAL_REGISTER", "current"],
      ["FINANCE_REVIEW", "upcoming"],
      ["COMPLETED", "upcoming"],
    ]);
  });

  it("marks the rejection source step instead of pretending later stages completed", () => {
    expect(
      getInspectionWorkflowSteps({
        department_hierarchy_level: 2,
        stage: "REJECTED",
        rejection_stage: "FINANCE_REVIEW",
      }).map(step => [step.key, step.state]),
    ).toEqual([
      ["DRAFT", "complete"],
      ["STOCK_DETAILS", "complete"],
      ["CENTRAL_REGISTER", "complete"],
      ["FINANCE_REVIEW", "rejected"],
      ["COMPLETED", "upcoming"],
    ]);
  });

  it("adds workflow ownership details for completed, current, and upcoming stages", () => {
    expect(
      getInspectionWorkflowSteps({
        department_hierarchy_level: 2,
        stage: "CENTRAL_REGISTER",
        rejection_stage: null,
        created_at: "2026-04-26T10:00:00Z",
        updated_at: "2026-04-26T15:20:00Z",
        initiated_at: "2026-04-26T10:05:00Z",
        initiated_by_name: "Ayesha Khan",
        initiated_by: 1,
        stock_filled_by_name: "Saad Ahmed",
        stock_filled_by: 9,
        stock_filled_at: "2026-04-26T12:00:00Z",
        central_store_filled_by_name: null,
        central_store_filled_by: null,
        central_store_filled_at: null,
        finance_reviewed_by_name: null,
        finance_reviewed_by: null,
        finance_reviewed_at: null,
      } as any),
    ).toMatchObject([
      {
        key: "DRAFT",
        state: "complete",
        ownerLabel: "Ayesha Khan",
        activityAt: "2026-04-26T10:05:00Z",
      },
      {
        key: "STOCK_DETAILS",
        state: "complete",
        ownerLabel: "Saad Ahmed",
        activityAt: "2026-04-26T12:00:00Z",
      },
      {
        key: "CENTRAL_REGISTER",
        state: "current",
        ownerLabel: "Central register pending",
        activityAt: "2026-04-26T15:20:00Z",
      },
      {
        key: "FINANCE_REVIEW",
        state: "upcoming",
        ownerLabel: "Finance review pending",
        activityAt: null,
      },
      {
        key: "COMPLETED",
        state: "upcoming",
        ownerLabel: "Pending finalization",
        activityAt: "2026-04-26T15:20:00Z",
      },
    ]);
  });

  it("keeps the completion timestamp visible on the completed card", () => {
    expect(
      getInspectionWorkflowSteps({
        department_hierarchy_level: 2,
        stage: "COMPLETED",
        rejection_stage: null,
        created_at: "2026-04-26T10:00:00Z",
        updated_at: "2026-04-26T22:20:00Z",
        initiated_at: "2026-04-26T10:05:00Z",
        initiated_by_name: "Ayesha Khan",
        initiated_by: 1,
        stock_filled_by_name: "Saad Ahmed",
        stock_filled_by: 9,
        stock_filled_at: "2026-04-26T12:00:00Z",
        central_store_filled_by_name: "Ali Raza",
        central_store_filled_by: 12,
        central_store_filled_at: "2026-04-26T18:00:00Z",
        finance_reviewed_by_name: "Nida Qureshi",
        finance_reviewed_by: 13,
        finance_reviewed_at: "2026-04-26T22:20:00Z",
      } as any).at(-1),
    ).toMatchObject({
      key: "COMPLETED",
      state: "current",
      ownerLabel: "Nida Qureshi",
      activityAt: "2026-04-26T22:20:00Z",
    });
  });

  it("returns finance review as a resumable stage label", () => {
    expect(getInspectionStageEditorLabel("FINANCE_REVIEW")).toBe("Review finance");
  });

  it("allows finance review to reopen through the shared resume helper", () => {
    expect(
      canResumeInspectionEditor(
        {
          stage: "FINANCE_REVIEW",
        },
        true,
        stage => stage === "review_finance",
      ),
    ).toBe(true);
  });

  it("collects compact register references without duplicating repeated rows", () => {
    expect(
      getInspectionRegisterRefs([
        {
          stock_register_name: "ITS-2026",
          stock_register_no: "RAW-001",
          stock_register_page_no: "22",
          central_register_name: "CENT-2026",
          central_register_no: "C-001",
          central_register_page_no: "11",
        },
        {
          stock_register_name: "ITS-2026",
          stock_register_no: "RAW-001",
          stock_register_page_no: "22",
          central_register_name: "CENT-2026",
          central_register_no: "C-001",
          central_register_page_no: "11",
        },
        {
          stock_register_name: "",
          stock_register_no: "DPT-RAW-7",
          stock_register_page_no: "",
          central_register_name: "",
          central_register_no: "CENT-RAW-9",
          central_register_page_no: "4",
        },
      ], "stock"),
    ).toEqual([
      "ITS-2026 / p.22",
      "DPT-RAW-7",
    ]);

    expect(
      getInspectionRegisterRefs([
        {
          stock_register_name: "ITS-2026",
          stock_register_no: "RAW-001",
          stock_register_page_no: "22",
          central_register_name: "CENT-2026",
          central_register_no: "C-001",
          central_register_page_no: "11",
        },
        {
          stock_register_name: "",
          stock_register_no: "DPT-RAW-7",
          stock_register_page_no: "",
          central_register_name: "",
          central_register_no: "CENT-RAW-9",
          central_register_page_no: "4",
        },
      ], "central"),
    ).toEqual([
      "CENT-2026 / p.11",
      "CENT-RAW-9 / p.4",
    ]);
  });

  it("computes tendered accepted and rejected value totals from mixed price types", () => {
    expect(
      getInspectionValueTotals({
        items: [
          {
            tendered_quantity: 5,
            accepted_quantity: 4,
            rejected_quantity: 1,
            unit_price: "123.50",
          },
          {
            tendered_quantity: 2,
            accepted_quantity: 2,
            rejected_quantity: 0,
            unit_price: 10.25,
          },
          {
            tendered_quantity: 1,
            accepted_quantity: 0,
            rejected_quantity: 1,
            unit_price: "invalid",
          },
        ],
      }),
    ).toEqual({
      tendered: 638,
      accepted: 514.5,
      rejected: 123.5,
    });
  });

  it("calculates register coverage for the review metrics card", () => {
    expect(
      getInspectionRegisterCoverage({
        department_hierarchy_level: 2,
        items: [
          {
            stock_register_name: "ITS-2026",
            stock_register_no: "RAW-001",
            stock_register_page_no: "22",
            central_register_name: "CENT-2026",
            central_register_no: "C-001",
            central_register_page_no: "11",
          },
          {
            stock_register_name: "",
            stock_register_no: "",
            stock_register_page_no: "",
            central_register_name: "CENT-2026",
            central_register_no: "C-001",
            central_register_page_no: "14",
          },
          {
            stock_register_name: "ITS-2026",
            stock_register_no: "RAW-001",
            stock_register_page_no: "40",
            central_register_name: "",
            central_register_no: "",
            central_register_page_no: "",
          },
        ],
      }),
    ).toEqual({
      totalItems: 3,
      fullyCoveredItems: 1,
      stockCoveredItems: 2,
      centralCoveredItems: 2,
      requiresStockStage: true,
    });
  });

  it("collapses created and initiated into a single audit stage entry", () => {
    const entries = getInspectionAuditEntries({
      stage: "CENTRAL_REGISTER",
      department_hierarchy_level: 2,
      created_at: "2026-04-26T10:28:00Z",
      initiated_at: "2026-04-26T10:28:00Z",
      initiated_by_name: "admin",
      initiated_by: 1,
      stock_filled_by: 9,
      stock_filled_by_name: "admin",
      stock_filled_at: "2026-04-26T12:00:00Z",
      central_store_filled_by: null,
      central_store_filled_by_name: null,
      central_store_filled_at: null,
      finance_reviewed_by: null,
      finance_reviewed_by_name: null,
      finance_reviewed_at: null,
      finance_check_date: null,
      rejected_by: null,
      rejected_by_name: null,
      rejected_at: null,
      rejection_reason: null,
      updated_at: "2026-04-26T12:30:00Z",
    });

    expect(entries.filter(entry => entry.label.includes("Created") || entry.label.includes("Initiated"))).toEqual([
      {
        key: "created",
        label: "Created / Initiated",
        actor: "admin",
        when: "2026-04-26T10:28:00Z",
        note: "Certificate record created and moved into the inspection workflow",
        tone: "default",
      },
    ]);
  });

  it("uses stage usernames in audit entries instead of numeric ids when available", () => {
    const entries = getInspectionAuditEntries({
      stage: "REJECTED",
      department_hierarchy_level: 2,
      created_at: "2026-04-26T10:28:00Z",
      initiated_at: "2026-04-26T10:28:00Z",
      initiated_by_name: "admin",
      initiated_by: 1,
      stock_filled_by: 9,
      stock_filled_by_name: "admin",
      stock_filled_at: "2026-04-26T12:00:00Z",
      central_store_filled_by: 9,
      central_store_filled_by_name: "admin",
      central_store_filled_at: "2026-04-26T12:20:00Z",
      finance_reviewed_by: 9,
      finance_reviewed_by_name: "admin",
      finance_reviewed_at: "2026-04-26T12:40:00Z",
      finance_check_date: null,
      rejected_by: 9,
      rejected_by_name: "admin",
      rejected_at: "2026-04-26T13:00:00Z",
      rejection_reason: "Incorrect document",
      updated_at: "2026-04-26T13:00:00Z",
    });

    expect(entries.find(entry => entry.key === "stock_details")?.actor).toBe("admin");
    expect(entries.find(entry => entry.key === "central_register")?.actor).toBe("admin");
    expect(entries.find(entry => entry.key === "finance_review")?.actor).toBe("admin");
    expect(entries.find(entry => entry.key === "rejected")?.actor).toBe("admin");
  });

});
