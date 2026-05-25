export type StockEntryMovementType = "RECEIPT" | "ISSUE" | "RETURN";

export interface StockEntryMovementRecord {
  id: number;
  entry_type: StockEntryMovementType;
  entry_number: string;
  status: string;
  reference_entry?: number | null;
  reference_purpose?: string | null;
  created_at: string;
  updated_at?: string | null;
  can_acknowledge?: boolean;
}

export interface StockEntryMovementRow<TEntry extends StockEntryMovementRecord> {
  entry: TEntry;
  receipt: TEntry | null;
  actionEntry: TEntry;
}

export function isAutoReceiptStockEntry(entry: StockEntryMovementRecord) {
  return entry.entry_type === "RECEIPT" && entry.reference_purpose === "AUTO_RECEIPT" && entry.reference_entry != null;
}

export function getLinkedAutoReceipt<TEntry extends StockEntryMovementRecord>(entry: TEntry, entries: TEntry[]) {
  if (isAutoReceiptStockEntry(entry)) return entry;
  if (entry.entry_type !== "ISSUE") return null;
  return entries.find(candidate => (
    candidate.entry_type === "RECEIPT" &&
    candidate.reference_purpose === "AUTO_RECEIPT" &&
    candidate.reference_entry === entry.id
  )) ?? null;
}

export function getStockEntryMovementRows<TEntry extends StockEntryMovementRecord>(entries: TEntry[]): StockEntryMovementRow<TEntry>[] {
  const byId = new Map(entries.map(entry => [entry.id, entry]));

  return entries
    .filter(entry => !(isAutoReceiptStockEntry(entry) && byId.has(Number(entry.reference_entry))))
    .map(entry => {
      const receipt = getLinkedAutoReceipt(entry, entries);
      return {
        entry,
        receipt,
        actionEntry: receipt ?? entry,
      };
    });
}

export function getStockEntryMovementStatus<TEntry extends StockEntryMovementRecord>(entry: TEntry, receipt: TEntry | null) {
  return receipt?.status ?? entry.status;
}

export function getStockEntryMovementUpdatedEntry<TEntry extends StockEntryMovementRecord>(entry: TEntry, receipt: TEntry | null) {
  if (!receipt?.updated_at || !entry.updated_at) return receipt?.updated_at ? receipt : entry;
  return new Date(receipt.updated_at).getTime() > new Date(entry.updated_at).getTime() ? receipt : entry;
}

export function getStockEntryAcknowledgeTarget<TEntry extends StockEntryMovementRecord>(entry: TEntry, receipt: TEntry | null) {
  return receipt ?? entry;
}
