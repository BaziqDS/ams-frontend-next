export type CreatableStockEntryType = "RECEIPT" | "ISSUE";
export type StockEntryIssueTarget = "STORE" | "LOCATION" | "PERSON";
export type StockEntryReturnSource = "LOCATION" | "PERSON";
export type StockEntrySubmitStatus = "DRAFT" | "PENDING_ACK" | "COMPLETED";

export interface StockEntryFormItem {
  item: string;
  batch: string;
  quantity: string;
  instances?: string[];
  stock_register: string;
  page_number: string;
}

export interface StockEntryFormState {
  entry_type: CreatableStockEntryType;
  issue_target: StockEntryIssueTarget;
  return_source: StockEntryReturnSource;
  from_location: string;
  to_location: string;
  issued_to: string;
  status: StockEntrySubmitStatus;
  purpose: string;
  remarks: string;
  items: StockEntryFormItem[];
}

export interface StockEntryRegisterOption {
  store: string | number;
  is_active: boolean;
}

export interface StockEntryDisplayDirectionInput {
  entry_type: string;
  from_location_name?: string | null;
  to_location_name?: string | null;
  issued_to_name?: string | null;
  inspection_certificate_number?: string | null;
}

function optionalNumber(value: string) {
  return value ? Number(value) : null;
}

function derivedStatus(form: StockEntryFormState): StockEntrySubmitStatus {
  if (form.entry_type === "ISSUE" && form.issue_target !== "STORE") return "COMPLETED";
  if (form.entry_type === "RECEIPT") return "COMPLETED";
  return "PENDING_ACK";
}

export function buildStockEntryPayload(form: StockEntryFormState) {
  const isIssue = form.entry_type === "ISSUE";
  const issueToPerson = isIssue && form.issue_target === "PERSON";
  const receiptFromPerson = !isIssue && form.return_source === "PERSON";

  return {
    entry_type: form.entry_type,
    from_location: isIssue
      ? optionalNumber(form.from_location)
      : receiptFromPerson
      ? null
      : optionalNumber(form.from_location),
    to_location: isIssue
      ? issueToPerson
        ? null
        : optionalNumber(form.to_location)
      : optionalNumber(form.to_location),
    issued_to: issueToPerson || receiptFromPerson ? optionalNumber(form.issued_to) : null,
    status: derivedStatus(form),
    purpose: form.purpose.trim() || null,
    remarks: form.remarks.trim() || null,
    items: form.items.map(row => ({
      item: Number(row.item),
      batch: optionalNumber(row.batch),
      quantity: Number(row.quantity),
      instances: (row.instances ?? []).map(Number).filter(Number.isFinite),
      stock_register: optionalNumber(row.stock_register),
      page_number: optionalNumber(row.page_number),
      ack_stock_register: null,
      ack_page_number: null,
    })),
  };
}

export function validateStockEntryForm(form: StockEntryFormState) {
  const errors: Record<string, string> = {};

  if (form.entry_type === "ISSUE") {
    if (!form.from_location) errors.from_location = "Choose the source store.";
    if (form.issue_target === "PERSON") {
      if (!form.issued_to) errors.issued_to = "Choose the receiving employee.";
    } else if (!form.to_location) {
      errors.to_location = "Choose the destination location.";
    }
  } else {
    if (!form.to_location) errors.to_location = "Choose the receiving store.";
    if (form.return_source === "PERSON") {
      if (!form.issued_to) errors.issued_to = "Choose the employee returning stock.";
    } else if (!form.from_location) {
      errors.from_location = "Choose the non-store location returning stock.";
    }
  }

  form.items.forEach((row, index) => {
    if (!row.item) errors[`items.${index}.item`] = "Choose an item.";
    if (!row.quantity || Number(row.quantity) < 1) errors[`items.${index}.quantity`] = "Quantity must be at least 1.";
  });

  return errors;
}

export function getStockEntryRegisterStoreId(form: Pick<StockEntryFormState, "entry_type" | "from_location" | "to_location">) {
  return form.entry_type === "ISSUE" ? form.from_location : form.to_location;
}

export function getStockEntrySourceRegisterOptions<T extends StockEntryRegisterOption>(
  form: Pick<StockEntryFormState, "entry_type" | "from_location" | "to_location">,
  registers: T[],
) {
  const storeId = getStockEntryRegisterStoreId(form);
  if (!storeId) return [];

  return registers.filter(register => (
    register.is_active &&
    String(register.store) === String(storeId)
  ));
}

export function getStockEntryDisplayDirection(entry: StockEntryDisplayDirectionInput) {
  if (entry.entry_type === "RECEIPT" && entry.inspection_certificate_number) {
    return {
      source: `Inspection / ${entry.inspection_certificate_number}`,
      target: entry.to_location_name ?? "-",
    };
  }

  if (entry.entry_type === "RECEIPT" && entry.issued_to_name) {
    return {
      source: entry.issued_to_name,
      target: entry.to_location_name ?? "-",
    };
  }

  return {
    source: entry.from_location_name ?? "System / inspection",
    target: entry.issued_to_name ?? entry.to_location_name ?? "-",
  };
}
