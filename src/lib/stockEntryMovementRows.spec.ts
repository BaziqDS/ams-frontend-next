import { describe, expect, it } from "vitest";
import {
  getStockEntryMovementRows,
  getStockEntryMovementStatus,
  getStockEntryMovementUpdatedEntry,
  getStockEntryAcknowledgeTarget,
  isAutoReceiptStockEntry,
  type StockEntryMovementRecord,
} from "./stockEntryMovementRows";

function entry(overrides: Partial<StockEntryMovementRecord>): StockEntryMovementRecord {
  return {
    id: 1,
    entry_type: "ISSUE",
    entry_number: "SE-1",
    status: "PENDING_ACK",
    reference_entry: null,
    reference_purpose: null,
    created_at: "2026-05-01T09:00:00Z",
    updated_at: "2026-05-01T09:00:00Z",
    can_acknowledge: false,
    ...overrides,
  };
}

describe("stock entry movement rows", () => {
  it("folds an auto receipt into its source issue", () => {
    const issue = entry({ id: 10, entry_type: "ISSUE", entry_number: "ISS-10" });
    const receipt = entry({
      id: 11,
      entry_type: "RECEIPT",
      entry_number: "R-ISS-10",
      reference_entry: 10,
      reference_purpose: "AUTO_RECEIPT",
      can_acknowledge: true,
    });

    const rows = getStockEntryMovementRows([receipt, issue]);

    expect(rows).toHaveLength(1);
    expect(rows[0].entry).toBe(issue);
    expect(rows[0].receipt).toBe(receipt);
    expect(rows[0].actionEntry).toBe(receipt);
  });

  it("keeps auto receipts visible when the source issue is not loaded", () => {
    const receipt = entry({
      id: 11,
      entry_type: "RECEIPT",
      entry_number: "R-ISS-10",
      reference_entry: 10,
      reference_purpose: "AUTO_RECEIPT",
    });

    const rows = getStockEntryMovementRows([receipt]);

    expect(rows).toHaveLength(1);
    expect(rows[0].entry).toBe(receipt);
    expect(rows[0].receipt).toBe(receipt);
  });

  it("does not fold manual receipts or generated return rows", () => {
    const manualReceipt = entry({ id: 20, entry_type: "RECEIPT", reference_entry: 10, reference_purpose: "REPLACEMENT" });
    const returned = entry({ id: 21, entry_type: "RETURN", reference_entry: 20, reference_purpose: "REJECTION_RETURN" });

    expect(isAutoReceiptStockEntry(manualReceipt)).toBe(false);
    expect(getStockEntryMovementRows([manualReceipt, returned]).map(row => row.entry.id)).toEqual([20, 21]);
  });

  it("uses the linked receipt for movement status, update metadata, and acknowledgement", () => {
    const issue = entry({
      id: 10,
      entry_type: "ISSUE",
      status: "PENDING_ACK",
      updated_at: "2026-05-01T09:00:00Z",
      can_acknowledge: false,
    });
    const receipt = entry({
      id: 11,
      entry_type: "RECEIPT",
      status: "COMPLETED",
      reference_entry: 10,
      reference_purpose: "AUTO_RECEIPT",
      updated_at: "2026-05-01T10:00:00Z",
      can_acknowledge: true,
    });

    expect(getStockEntryMovementStatus(issue, receipt)).toBe("COMPLETED");
    expect(getStockEntryMovementUpdatedEntry(issue, receipt)).toBe(receipt);
    expect(getStockEntryAcknowledgeTarget(issue, receipt)).toBe(receipt);
  });
});
