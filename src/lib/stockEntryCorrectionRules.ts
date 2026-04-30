export type CorrectionMode = "difference" | "reversal";

export interface CorrectionEntryItemForPayload {
  id: number;
  quantity: number;
  accepted_quantity?: number | null;
}

export interface CorrectionEntryForPayload {
  id: number;
  entry_number?: string;
  items: CorrectionEntryItemForPayload[];
}

export interface CorrectionPayload {
  reason: string;
  lines: Array<{
    id: number;
    corrected_quantity: number;
    instances: string[];
  }>;
}

export interface CorrectionModeCopy {
  actionLabel: string;
  title: string;
  submitLabel: string;
  disclaimerTitle: string;
  disclaimer: string;
}

export interface QuantityCorrectionUiCopy {
  currentQuantityLabel: string;
  targetQuantityLabel: string;
  helperText: string;
  unchangedMessage: string;
}

export function getCorrectionModeCopy(mode: CorrectionMode): CorrectionModeCopy {
  if (mode === "reversal") {
    return {
      actionLabel: "Request Full Return",
      title: "Request Full Return",
      submitLabel: "Submit Full Return Request",
      disclaimerTitle: "Use only for a wrong transfer",
      disclaimer:
        "This asks the receiving store to return the full transfer. The original entry stays in history. If the receiving store has moved onward or no longer has the stock, this request can be blocked or rejected.",
    };
  }

  return {
    actionLabel: "Fix Quantity Mistake",
    title: "Fix Quantity Mistake",
    submitLabel: "Send Correction Request",
    disclaimerTitle: "Use only when an actual mistake happened",
    disclaimer:
      "This is for special cases only when an actual mistake happened, such as stock recorded more or less than the actual movement. The original entry stays in history and the system creates linked correction records for audit.",
  };
}

export function getQuantityCorrectionUiCopy(entryType: string): QuantityCorrectionUiCopy {
  if (entryType === "RECEIPT") {
    return {
      currentQuantityLabel: "You accepted",
      targetQuantityLabel: "What should have been accepted?",
      helperText: "Enter the final quantity that should have been accepted. The system will calculate what needs to happen.",
      unchangedMessage: "Change at least one item to the quantity that should have been accepted.",
    };
  }

  return {
    currentQuantityLabel: "Entry currently says",
    targetQuantityLabel: "What should the quantity be?",
    helperText: "Enter the final correct quantity. The system will calculate what needs to happen.",
    unchangedMessage: "Change at least one item to the quantity that should have been recorded.",
  };
}

export function describeQuantityCorrectionChange(currentQuantity: number, targetQuantity: number) {
  const difference = targetQuantity - currentQuantity;
  const count = Math.abs(difference);

  if (difference > 0) return `Need ${count} more`;
  if (difference < 0) return `${count} extra`;
  return "No change";
}

export function validateFullReversalRequest(reason: string, responsibilityAccepted: boolean) {
  if (!reason.trim()) {
    return "Enter a reason for this full return request.";
  }

  if (!responsibilityAccepted) {
    return "Confirm that you understand this is an auditable responsibility action.";
  }

  return null;
}

export function buildFullReversalPayload(entry: CorrectionEntryForPayload, reason: string): CorrectionPayload {
  return {
    reason: reason.trim(),
    lines: entry.items.map(item => ({
      id: item.id,
      corrected_quantity: 0,
      instances: [],
    })),
  };
}
