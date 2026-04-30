import { describe, expect, it } from "vitest";
import {
  buildFullReversalPayload,
  describeQuantityCorrectionChange,
  getCorrectionModeCopy,
  getQuantityCorrectionUiCopy,
  validateFullReversalRequest,
  type CorrectionEntryForPayload,
} from "./stockEntryCorrectionRules";

const entry: CorrectionEntryForPayload = {
  id: 42,
  entry_number: "ISS-00042",
  items: [
    { id: 10, quantity: 2, accepted_quantity: 2 },
    { id: 11, quantity: 5, accepted_quantity: null },
  ],
};

describe("stock entry correction rules", () => {
  it("builds full reversal payloads without exposing quantity choices", () => {
    expect(buildFullReversalPayload(entry, "Wrong transfer was made")).toEqual({
      reason: "Wrong transfer was made",
      lines: [
        { id: 10, corrected_quantity: 0, instances: [] },
        { id: 11, corrected_quantity: 0, instances: [] },
      ],
    });
  });

  it("requires a reason and responsibility acknowledgement before full reversal", () => {
    expect(validateFullReversalRequest("", false)).toBe("Enter a reason for this full return request.");
    expect(validateFullReversalRequest("Wrong store", false)).toBe("Confirm that you understand this is an auditable responsibility action.");
    expect(validateFullReversalRequest("Wrong store", true)).toBeNull();
  });

  it("uses simpler action labels for store staff", () => {
    expect(getCorrectionModeCopy("difference")).toMatchObject({
      actionLabel: "Fix Quantity Mistake",
      title: "Fix Quantity Mistake",
      submitLabel: "Send Correction Request",
    });
    expect(getCorrectionModeCopy("reversal")).toMatchObject({
      actionLabel: "Request Full Return",
      title: "Request Full Return",
      submitLabel: "Submit Full Return Request",
    });
  });

  it("warns that correction actions are for exceptional mistakes only", () => {
    const differenceCopy = getCorrectionModeCopy("difference");
    const reversalCopy = getCorrectionModeCopy("reversal");

    expect(differenceCopy.disclaimer).toContain("actual mistake");
    expect(reversalCopy.disclaimer).toContain("receiving store");
    expect(reversalCopy.disclaimer).toContain("moved onward");
  });

  it("uses receipt-specific human labels for quantity corrections", () => {
    expect(getQuantityCorrectionUiCopy("RECEIPT")).toMatchObject({
      currentQuantityLabel: "You accepted",
      targetQuantityLabel: "What should have been accepted?",
      unchangedMessage: "Change at least one item to the quantity that should have been accepted.",
    });
  });

  it("describes quantity changes without system delta language", () => {
    expect(describeQuantityCorrectionChange(1, 2)).toBe("Need 1 more");
    expect(describeQuantityCorrectionChange(2, 1)).toBe("1 extra");
    expect(describeQuantityCorrectionChange(3, 1)).toBe("2 extra");
    expect(describeQuantityCorrectionChange(2, 2)).toBe("No change");
  });
});
