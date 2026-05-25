import type { NotificationAlertRecord, NotificationFeedItem } from "@/contexts/NotificationsContext";

export interface NotificationDisplay {
  avatarLabel: string;
  headline: string;
  preview: string;
  metaParts: string[];
}

const STAGE_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  STOCK_DETAILS: "Stock details",
  CENTRAL_REGISTER: "Central Register",
  FINANCE_REVIEW: "Finance Review",
  COMPLETED: "Completed",
  REJECTED: "Rejected",
};

const ENTRY_TYPE_LABELS: Record<string, string> = {
  RECEIPT: "Receipt",
  ISSUE: "Issue",
  RETURN: "Return",
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  PENDING_ACK: "Pending acknowledgement",
  COMPLETED: "Completed",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
  VOIDED: "Voided",
};

export function formatNotificationModuleLabel(module: string) {
  return module.replace(/[_-]+/g, " ").replace(/\b\w/g, char => char.toUpperCase());
}

export function notificationToneClass(severity: string) {
  if (severity === "critical") return "is-critical";
  if (severity === "warning") return "is-warning";
  return "is-info";
}

export function getNotificationInitials(value: string | null | undefined, fallback = "AM") {
  const source = value?.trim() || fallback;
  return source
    .split(/\s+/)
    .filter(Boolean)
    .map(part => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function formatNotificationRelativeTime(value: string, now = Date.now()) {
  const date = new Date(value);
  const diff = now - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

function readString(metadata: Record<string, unknown> | undefined, key: string) {
  const value = metadata?.[key];
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function readNumber(metadata: Record<string, unknown> | undefined, key: string) {
  const value = metadata?.[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function labelFor(value: string | null, labels: Record<string, string>) {
  if (!value) return null;
  return labels[value] ?? formatNotificationModuleLabel(value);
}

function addIfMissing(parts: string[], value: string | null) {
  if (!value) return;
  if (parts.some(part => part.toLowerCase().includes(value.toLowerCase()))) return;
  parts.push(value);
}

function compactParts(parts: Array<string | null | undefined>) {
  return parts.filter((part): part is string => Boolean(part && part.trim()));
}

function stockEntryPreview(item: NotificationFeedItem) {
  const metadata = item.metadata ?? {};
  const entryNumber = readString(metadata, "entry_number");
  const fromLocation = readString(metadata, "from_location_name");
  const toLocation = readString(metadata, "to_location_name");
  const issuedTo = readString(metadata, "issued_to_name");
  const itemCount = readNumber(metadata, "item_count");
  const totalQuantity = readNumber(metadata, "total_quantity");
  const movementTarget = toLocation || issuedTo;
  const movement = fromLocation && movementTarget
    ? `${fromLocation} to ${movementTarget}`
    : movementTarget
      ? `Receiving store: ${movementTarget}`
      : fromLocation
        ? `Source: ${fromLocation}`
        : null;
  const quantity = itemCount
    ? `${itemCount} line item${itemCount === 1 ? "" : "s"}${totalQuantity ? `, ${totalQuantity} unit${totalQuantity === 1 ? "" : "s"}` : ""}`
    : totalQuantity
      ? `${totalQuantity} unit${totalQuantity === 1 ? "" : "s"}`
      : null;

  const parts = [item.message];
  addIfMissing(parts, entryNumber ? `Entry ${entryNumber}` : null);
  addIfMissing(parts, movement);
  addIfMissing(parts, quantity);
  return parts.join(" ");
}

function inspectionPreview(item: NotificationFeedItem) {
  const metadata = item.metadata ?? {};
  const contractNo = readString(metadata, "contract_no");
  const departmentName = readString(metadata, "department_name");
  const contractorName = readString(metadata, "contractor_name");
  const stageLabel = readString(metadata, "stage_label") || labelFor(readString(metadata, "stage"), STAGE_LABELS);

  const parts = [item.message];
  addIfMissing(parts, contractNo ? `Contract ${contractNo}` : null);
  addIfMissing(parts, departmentName ? `Department: ${departmentName}` : null);
  addIfMissing(parts, contractorName ? `Contractor: ${contractorName}` : null);
  addIfMissing(parts, stageLabel ? `Stage: ${stageLabel}` : null);
  return parts.join(" ");
}

/**
 * Domain-aware preview text for every alert kind the backend can emit.
 *
 * Backend `alert.title` is intentionally a category-style label (e.g.
 * "Inspection certificates waiting for Central Register") and backend
 * `alert.message` just restates that with the count. The notification panel
 * needs ONE clean action headline plus a SPECIFIC, contextual preview that
 * tells the user WHY this needs their attention. The frontend owns that
 * pair; the backend just supplies the data.
 *
 * Keys map 1:1 with `AlertRecord.key` in ams-backend/notifications/services.py.
 */
type AlertCopy = {
  headline: string;
  preview: (count: number) => string;
};

const ALERT_COPY: Record<string, AlertCopy> = {
  "inspections-stock-details": {
    headline: "Stock details pending",
    preview: (n) =>
      n === 1
        ? "1 inspection certificate is waiting at Stage 2. Your department needs to record stock-register entries before it can move to Central Register."
        : `${n} inspection certificates are waiting at Stage 2. Your department needs to record stock-register entries before they can move to Central Register.`,
  },
  "inspections-central-register": {
    headline: "Central Register linking pending",
    preview: (n) =>
      n === 1
        ? "1 inspection certificate is at Stage 3. Each line item still needs to be linked to a catalog record before it can move to Finance Review."
        : `${n} inspection certificates are at Stage 3. Their line items still need to be linked to catalog records before they can move to Finance Review.`,
  },
  "inspections-finance-review": {
    headline: "Finance Review ready",
    preview: (n) =>
      n === 1
        ? "1 inspection certificate has cleared Central Register. Finance can capitalize the fixed assets and close it out."
        : `${n} inspection certificates have cleared Central Register. Finance can capitalize the fixed assets and close them out.`,
  },
  "stock-entries-pending-ack": {
    headline: "Receiver acknowledgement pending",
    preview: (n) =>
      n === 1
        ? "1 stock receipt/return is sitting at the receiving store. The recipient must confirm delivery before the entry closes."
        : `${n} stock receipts/returns are sitting at the receiving store. Recipients must confirm delivery before these entries close.`,
  },
  "stock-entries-correction-approvals": {
    headline: "Correction requests need approval",
    preview: (n) =>
      n === 1
        ? "1 stock-correction request is awaiting approval. Review the proposed reversal or adjustment before it runs."
        : `${n} stock-correction requests are awaiting approval. Review the proposed reversals or adjustments before they run.`,
  },
  "stock-entries-correction-apply": {
    headline: "Approved corrections to apply",
    preview: (n) =>
      n === 1
        ? "1 approved correction still needs its linked movement applied to take effect."
        : `${n} approved corrections still need their linked movements applied to take effect.`,
  },
  "items-low-stock": {
    headline: "Items at low stock",
    preview: (n) =>
      n === 1
        ? "1 catalog item is at or below its configured low-stock threshold within stores you can see. Plan a replenishment."
        : `${n} catalog items are at or below their configured low-stock thresholds within stores you can see. Plan replenishments.`,
  },
  "items-expired-batches": {
    headline: "Expired batches in stock",
    preview: (n) =>
      n === 1
        ? "1 tracked batch in your stores has already passed its expiry date. Review it for disposal or write-off."
        : `${n} tracked batches in your stores have already passed their expiry dates. Review them for disposal or write-off.`,
  },
  "items-expiring-batches": {
    headline: "Batches expiring soon",
    preview: (n) =>
      n === 1
        ? "1 tracked batch in your stores expires within the next 30 days. Plan usage or transfer."
        : `${n} tracked batches in your stores expire within the next 30 days. Plan usage or transfer.`,
  },
  "maintenance-overdue": {
    headline: "Maintenance overdue",
    preview: (n) =>
      n === 1
        ? "1 maintenance work order is past its due date. Schedule the work or close the order."
        : `${n} maintenance work orders are past their due dates. Schedule the work or close them.`,
  },
  "maintenance-critical": {
    headline: "Critical maintenance open",
    preview: (n) =>
      n === 1
        ? "1 critical-priority maintenance work order is still open. It needs immediate attention."
        : `${n} critical-priority maintenance work orders are still open. They need immediate attention.`,
  },
  "depreciation-uncapitalized": {
    headline: "Fixed assets awaiting capitalization",
    preview: (n) =>
      n === 1
        ? "1 fixed asset is in stock without a depreciation entry. Assign an asset class and capitalize it."
        : `${n} fixed assets are in stock without depreciation entries. Assign asset classes and capitalize them.`,
  },
};

function severityLabel(severity: string) {
  if (severity === "critical") return "Critical";
  if (severity === "warning") return "Warning";
  return null; // skip generic "info"; the alert itself is the info
}

export function buildNotificationAlertDisplay(alert: NotificationAlertRecord): NotificationDisplay {
  const moduleLabel = formatNotificationModuleLabel(alert.module);
  const customCopy = ALERT_COPY[alert.key];

  // Fall back to backend strings for unknown keys; otherwise the frontend
  // owns the copy so it stays clean and non-redundant.
  const headline = customCopy?.headline ?? alert.title;
  const preview = customCopy?.preview(alert.count) ?? alert.message;

  const countLabel = alert.count === 1 ? "1 pending" : `${alert.count} pending`;
  const tone = severityLabel(alert.severity);

  return {
    avatarLabel: moduleLabel,
    headline,
    preview,
    // No more "Current alert" filler; the panel itself signals these are
    // current alerts. Keep just the actionable counters: count + module + tone.
    metaParts: compactParts([countLabel, moduleLabel, tone]),
  };
}

export function buildNotificationFeedDisplay(item: NotificationFeedItem): NotificationDisplay {
  const metadata = item.metadata ?? {};
  const moduleLabel = formatNotificationModuleLabel(item.module);
  const timeLabel = formatNotificationRelativeTime(item.created_at);
  const actorLabel = item.actor_name ? `by ${item.actor_name}` : null;

  if (item.module === "inspections" || item.kind.startsWith("inspection.")) {
    const contractNo = readString(metadata, "contract_no");
    const departmentName = readString(metadata, "department_name");
    const stageLabel = readString(metadata, "stage_label") || labelFor(readString(metadata, "stage"), STAGE_LABELS);

    return {
      avatarLabel: contractNo || "Inspection",
      headline: item.title || (contractNo ? `Inspection ${contractNo}` : "Inspection update"),
      preview: inspectionPreview(item),
      metaParts: compactParts([timeLabel, departmentName, stageLabel, actorLabel]),
    };
  }

  if (item.module === "stock-entries" || item.kind.startsWith("stock_entry.") || item.kind.startsWith("stock_correction.")) {
    const entryNumber = readString(metadata, "entry_number");
    const statusLabel = readString(metadata, "status_label") || labelFor(readString(metadata, "status"), STATUS_LABELS);
    const entryTypeLabel = readString(metadata, "entry_type_label") || labelFor(readString(metadata, "entry_type"), ENTRY_TYPE_LABELS);

    return {
      avatarLabel: entryNumber || entryTypeLabel || "Stock entry",
      headline: item.title || (entryNumber ? `Stock entry ${entryNumber}` : "Stock entry update"),
      preview: stockEntryPreview(item),
      metaParts: compactParts([timeLabel, statusLabel, entryTypeLabel, actorLabel]),
    };
  }

  return {
    avatarLabel: item.actor_name || moduleLabel,
    headline: item.title,
    preview: item.message,
    metaParts: compactParts([timeLabel, moduleLabel, actorLabel]),
  };
}
