import type { StockEntryFormItem, StockEntryFormState } from "@/lib/stockEntryFormRules";
import {
  searchCopilotFormOptions,
  type CopilotFormOptionSearchResult,
  type CopilotPatchField,
} from "@/lib/copilotFormRuntime";

type IdValue = string | number;

type NamedOption = {
  id: IdValue;
  name: string;
  code?: string | null;
  location_type?: string | null;
  designation?: string | null;
  department?: string | null;
};

type RegisterOption = {
  id: IdValue;
  register_number: string;
  store?: IdValue;
  store_name?: string | null;
};

type ItemOption = {
  id: IdValue;
  name: string;
  code?: string | null;
  tracking_type?: string | null;
  category_type?: string | null;
};

type BatchOption = {
  id: IdValue;
  batch_number: string;
};

type InstanceOption = {
  id: IdValue;
  serial_number?: string | null;
  qr_code?: string | null;
};

type LineItemContext = {
  index: number;
  itemOptions: ItemOption[];
  batchOptions: BatchOption[];
  instanceOptions: InstanceOption[];
};

type BuildStockEntryCopilotReferenceContextArgs = {
  formId: string;
  active: boolean;
  form: StockEntryFormState;
  sourceStores: NamedOption[];
  destinationStores: NamedOption[];
  destinationLocations: NamedOption[];
  receivingPersons: NamedOption[];
  returningPersons: NamedOption[];
  returningLocations: NamedOption[];
  sourceRegisters: RegisterOption[];
  lineItems: LineItemContext[];
};

const LINE_ITEM_PATCH_META_FIELDS = new Set(["id", "index"]);

function blankItem(): StockEntryFormItem {
  return {
    item: "",
    batch: "",
    quantity: "1",
    instances: [],
    stock_register: "",
    page_number: "",
  };
}

function toStringValue(value: unknown) {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string" || typeof value === "number") return String(value);
  return undefined;
}

function toStringArray(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  return value
    .map(item => toStringValue(item))
    .filter((item): item is string => item !== undefined);
}

function getPatchTargetIndex(
  currentItems: StockEntryFormItem[],
  incoming: Record<string, unknown>,
  fallbackIndex: number,
) {
  const explicitIndex = Number(incoming.index);
  if (Number.isInteger(explicitIndex) && explicitIndex >= 0) return explicitIndex;

  const explicitId = Number(incoming.id);
  if (Number.isFinite(explicitId)) {
    const idIndex = currentItems.findIndex(item => Number((item as unknown as { id?: unknown }).id) === explicitId);
    if (idIndex >= 0) return idIndex;
  }

  return fallbackIndex;
}

function applyLineItemPatch(existing: StockEntryFormItem, incoming: Record<string, unknown>) {
  const next = { ...existing };

  for (const [field, value] of Object.entries(incoming)) {
    if (LINE_ITEM_PATCH_META_FIELDS.has(field)) continue;

    if (field === "instances") {
      next.instances = toStringArray(value) ?? [];
      continue;
    }

    if (
      field === "item" ||
      field === "batch" ||
      field === "quantity" ||
      field === "stock_register" ||
      field === "page_number"
    ) {
      const nextValue = toStringValue(value);
      if (nextValue !== undefined) next[field] = nextValue;
    }
  }

  if ("instances" in incoming && !("quantity" in incoming) && (next.instances ?? []).length > 0) {
    next.quantity = String(next.instances?.length ?? 1);
  }

  return next;
}

export function applyStockEntryCopilotValuePatch(
  currentForm: StockEntryFormState,
  values: Record<string, unknown>,
) {
  let nextForm: StockEntryFormState = { ...currentForm };
  const applied: string[] = [];
  const ignored: string[] = [];

  if (values.entry_type === "ISSUE" || values.entry_type === "RECEIPT") {
    nextForm = { ...nextForm, entry_type: values.entry_type };
    applied.push("entry_type");
  }
  if (values.issue_target === "STORE" || values.issue_target === "LOCATION" || values.issue_target === "PERSON") {
    nextForm = { ...nextForm, issue_target: values.issue_target };
    applied.push("issue_target");
  }
  if (values.return_source === "LOCATION" || values.return_source === "PERSON") {
    nextForm = { ...nextForm, return_source: values.return_source };
    applied.push("return_source");
  }

  for (const key of ["from_location", "to_location", "issued_to", "purpose", "remarks"] as const) {
    if (!(key in values)) continue;
    const nextValue = toStringValue(values[key]);
    if (nextValue === undefined) {
      ignored.push(key);
      continue;
    }
    nextForm = { ...nextForm, [key]: nextValue };
    applied.push(key);
  }

  if (Array.isArray(values.items)) {
    const incomingRows = values.items;
    if (incomingRows.length === 0) {
      nextForm = { ...nextForm, items: [blankItem()] };
    } else {
      const nextItems = [...nextForm.items];
      incomingRows.forEach((row, fallbackIndex) => {
        if (!row || typeof row !== "object" || Array.isArray(row)) {
          ignored.push(`items.${fallbackIndex}`);
          return;
        }
        const incoming = row as Record<string, unknown>;
        const targetIndex = getPatchTargetIndex(nextItems, incoming, fallbackIndex);
        const existing = nextItems[targetIndex] ?? blankItem();
        nextItems[targetIndex] = applyLineItemPatch(existing, incoming);
      });
      nextForm = { ...nextForm, items: nextItems };
    }
    applied.push("items");
  }

  return { nextForm, applied: Array.from(new Set(applied)), ignored };
}

function optionLabel(option: NamedOption) {
  const meta = [option.code, option.location_type, option.designation, option.department]
    .filter(Boolean)
    .join(" - ");
  return meta ? `${option.name} (${meta})` : option.name;
}

function toNamedSelectOption(option: NamedOption) {
  return {
    value: String(option.id),
    label: optionLabel(option),
    id: option.id,
  };
}

function toRegisterSelectOption(option: RegisterOption) {
  return {
    value: String(option.id),
    label: option.register_number,
    id: option.id,
    store: option.store,
    store_name: option.store_name ?? null,
  };
}

function toItemSelectOption(option: ItemOption) {
  return {
    value: String(option.id),
    label: option.code ? `${option.name} (${option.code})` : option.name,
    id: option.id,
    code: option.code ?? null,
    tracking_type: option.tracking_type ?? null,
    category_type: option.category_type ?? null,
  };
}

function toBatchSelectOption(option: BatchOption) {
  return {
    value: String(option.id),
    label: option.batch_number,
    id: option.id,
  };
}

function toInstanceSelectOption(option: InstanceOption) {
  const fallback = `Instance ${option.id}`;
  return {
    value: String(option.id),
    label: option.serial_number || option.qr_code || fallback,
    id: option.id,
    serial_number: option.serial_number ?? null,
    qr_code: option.qr_code ?? null,
  };
}

export function buildStockEntryCopilotReferenceContext({
  formId,
  active,
  form,
  sourceStores,
  destinationStores,
  destinationLocations,
  receivingPersons,
  returningPersons,
  returningLocations,
  sourceRegisters,
  lineItems,
}: BuildStockEntryCopilotReferenceContextArgs) {
  return {
    route: "/stock-entries",
    page_kind: "form_reference",
    entity: "stock_entry",
    formId,
    active,
    current_values: form,
    backend_contract: {
      create_endpoint: "POST /api/inventory/stock-entries/",
      item_payload_fields: [
        "item",
        "batch",
        "quantity",
        "instances",
        "stock_register",
        "page_number",
      ],
      note:
        "ack_stock_register and ack_page_number belong to the receiver acknowledgement workflow, not the create stock-entry modal.",
    },
    movement_modes: [
      {
        entry_type: "ISSUE",
        issue_target: "STORE",
        label: "Transfer to store",
        required_fields: ["from_location", "to_location", "items"],
        result_status: "PENDING_ACK",
      },
      {
        entry_type: "ISSUE",
        issue_target: "PERSON",
        label: "Issue to person",
        required_fields: ["from_location", "issued_to", "items"],
        result_status: "COMPLETED",
      },
      {
        entry_type: "ISSUE",
        issue_target: "LOCATION",
        label: "Issue to non-store location",
        required_fields: ["from_location", "to_location", "items"],
        result_status: "COMPLETED",
      },
    ],
    return_modes: [
      {
        entry_type: "RECEIPT",
        return_source: "PERSON",
        label: "Return from person",
        required_fields: ["to_location", "issued_to", "items"],
      },
      {
        entry_type: "RECEIPT",
        return_source: "LOCATION",
        label: "Return from non-store location",
        required_fields: ["to_location", "from_location", "items"],
      },
    ],
    source_store_options: sourceStores.map(toNamedSelectOption),
    destination_store_options: destinationStores.map(toNamedSelectOption),
    destination_non_store_options: destinationLocations.map(toNamedSelectOption),
    receiving_person_options: receivingPersons.map(toNamedSelectOption),
    returning_person_options: returningPersons.map(toNamedSelectOption),
    returning_non_store_options: returningLocations.map(toNamedSelectOption),
    source_register_options: sourceRegisters.map(toRegisterSelectOption),
    line_item_options: lineItems.map(line => ({
      index: line.index,
      selected_values: form.items[line.index] ?? null,
      item_options: line.itemOptions.map(toItemSelectOption),
      batch_options: line.batchOptions.map(toBatchSelectOption),
      instance_options: line.instanceOptions.map(toInstanceSelectOption),
      source_register_options: sourceRegisters.map(toRegisterSelectOption),
    })),
  };
}

type StockEntryCopilotReferenceContext = ReturnType<typeof buildStockEntryCopilotReferenceContext>;

function lineIndexFromFieldPath(field: string) {
  const match = field.match(/^items\.(\d+)\./);
  return match ? Number(match[1]) : 0;
}

function optionsStateFor(options: unknown[], dependenciesReady: boolean) {
  return dependenciesReady ? undefined : options.length === 0 ? "requires_dependency" as const : undefined;
}

function buildSearchFieldsForStockEntry(
  context: StockEntryCopilotReferenceContext,
  field: string,
): CopilotPatchField[] {
  const currentValues = context.current_values;
  const lineIndex = lineIndexFromFieldPath(field);
  const line = context.line_item_options.find(candidate => candidate.index === lineIndex)
    ?? context.line_item_options[0];
  const itemSelected = Boolean(currentValues.items[lineIndex]?.item);
  const sourceReady = currentValues.entry_type === "ISSUE"
    ? Boolean(currentValues.from_location)
    : Boolean(currentValues.to_location && (currentValues.return_source === "PERSON"
      ? currentValues.issued_to
      : currentValues.from_location));

  return [
    {
      name: "from_location",
      label: currentValues.entry_type === "ISSUE" ? "Source store" : "Returning non-store",
      type: "select",
      options: currentValues.entry_type === "ISSUE"
        ? context.source_store_options
        : context.returning_non_store_options,
      optionSource: "stockEntry.sourceLocations",
      resolver: "search_form_options",
    },
    {
      name: "to_location",
      label: currentValues.entry_type === "ISSUE" ? "Destination" : "Receiving store",
      type: "select",
      options: currentValues.entry_type === "ISSUE"
        ? currentValues.issue_target === "LOCATION"
          ? context.destination_non_store_options
          : context.destination_store_options
        : context.source_store_options,
      dependsOn: currentValues.entry_type === "ISSUE" ? ["from_location", "issue_target"] : [],
      optionSource: "stockEntry.destinationLocations",
      resolver: "search_form_options",
    },
    {
      name: "issued_to",
      label: currentValues.entry_type === "ISSUE" ? "Receiving person" : "Returning person",
      type: "select",
      options: currentValues.entry_type === "ISSUE"
        ? context.receiving_person_options
        : context.returning_person_options,
      dependsOn: currentValues.entry_type === "ISSUE"
        ? ["from_location", "issue_target"]
        : ["to_location", "return_source"],
      optionSource: "stockEntry.people",
      resolver: "search_form_options",
    },
    {
      name: "items",
      label: "Line items",
      type: "array",
      arrayItemFields: [
        {
          name: "item",
          label: "Item",
          type: "select",
          options: line?.item_options ?? [],
          dependsOn: currentValues.entry_type === "ISSUE"
            ? ["from_location"]
            : ["to_location", currentValues.return_source === "PERSON" ? "issued_to" : "from_location"],
          optionsState: optionsStateFor(line?.item_options ?? [], sourceReady),
          optionSource: "stockEntry.availableItems",
          resolver: "search_form_options",
        },
        {
          name: "batch",
          label: "Batch",
          type: "select",
          options: line?.batch_options ?? [],
          dependsOn: ["items[].item"],
          optionsState: optionsStateFor(line?.batch_options ?? [], itemSelected),
          optionSource: "stockEntry.availableBatches",
          resolver: "search_form_options",
        },
        {
          name: "instances",
          label: "Instances",
          type: "array",
          arrayItemType: "string",
          options: line?.instance_options ?? [],
          dependsOn: currentValues.entry_type === "ISSUE"
            ? ["from_location", "items[].item"]
            : ["to_location", currentValues.return_source === "PERSON" ? "issued_to" : "from_location", "items[].item"],
          optionsState: optionsStateFor(line?.instance_options ?? [], sourceReady && itemSelected),
          optionSource: "stockEntry.availableInstances",
          resolver: "search_form_options",
        },
        {
          name: "stock_register",
          label: "Source register",
          type: "select",
          options: line?.source_register_options ?? context.source_register_options,
          dependsOn: ["from_location"],
          optionSource: "stockEntry.sourceRegisters",
          resolver: "search_form_options",
        },
      ],
    },
  ];
}

export function searchStockEntryCopilotOptions(
  context: StockEntryCopilotReferenceContext,
  request: {
    field: string;
    query?: string;
    currentValues?: Record<string, unknown>;
    limit?: number;
  },
): CopilotFormOptionSearchResult {
  return searchCopilotFormOptions({
    fields: buildSearchFieldsForStockEntry(context, request.field),
    field: request.field,
    query: request.query,
    currentValues: request.currentValues ?? context.current_values as unknown as Record<string, unknown>,
    limit: request.limit,
  });
}
