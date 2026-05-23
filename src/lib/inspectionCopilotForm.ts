import type { CopilotFormField } from "@/hooks/useCopilotForm";

type SelectOption = {
  id: number;
  register_number?: string;
  name?: string;
  code?: string | null;
  category_type?: string | null;
  tracking_type?: string | null;
  category_display?: string | null;
  description?: string | null;
  specifications?: string | null;
  acct_unit?: string | null;
};

type InspectionCopilotItem = object;
type InspectionReferenceItem = InspectionCopilotItem & {
  item?: unknown;
  item_description?: unknown;
  item_name?: unknown;
  item_code?: unknown;
  item_category_type?: unknown;
  item_tracking_type?: unknown;
  stock_register?: unknown;
  stock_register_no?: unknown;
  central_register?: unknown;
  central_register_no?: unknown;
};
type InspectionCreateItem = {
  item_description?: string | null;
  tendered_quantity?: number | string | null;
  accepted_quantity?: number | string | null;
  rejected_quantity?: number | string | null;
};
type InspectionFinanceItem = {
  item_description?: string | null;
  item_name?: string | null;
  accepted_quantity?: number | string | null;
  item_category_type?: string | null;
};

const ITEM_FIELD_PATH_RE = /^items(?:\[(\d+)\]|\.(\d+))\.([A-Za-z_][A-Za-z0-9_]*)$/;
const ID_FIELDS = new Set(["item", "stock_register", "central_register", "depreciation_asset_class"]);
const NUMBER_FIELDS = new Set(["tendered_quantity", "accepted_quantity", "rejected_quantity"]);
const BULK_PATCH_META_FIELDS = new Set(["index"]);

export function parseInspectionItemFieldPath(path: string) {
  const match = ITEM_FIELD_PATH_RE.exec(path);
  if (!match) return null;
  const index = Number(match[1] ?? match[2]);
  if (!Number.isInteger(index) || index < 0) return null;
  return { index, field: match[3] };
}

function normalizeItemFieldValue(field: string, value: unknown) {
  if (ID_FIELDS.has(field)) {
    if (value === "" || value === null || value === undefined) return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : value;
  }

  if (NUMBER_FIELDS.has(field)) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : value;
  }

  return value;
}

function getBulkPatchTargetIndex<T extends InspectionCopilotItem>(
  currentItems: T[],
  incoming: Record<string, unknown>,
  fallbackIndex: number,
) {
  const explicitIndex = Number(incoming.index);
  if (Number.isInteger(explicitIndex) && explicitIndex >= 0) {
    return explicitIndex;
  }

  const explicitId = Number(incoming.id);
  if (Number.isFinite(explicitId)) {
    const idIndex = currentItems.findIndex(item => {
      const itemId = Number((item as Record<string, unknown>).id);
      return Number.isFinite(itemId) && itemId === explicitId;
    });
    if (idIndex >= 0) return idIndex;
  }

  return fallbackIndex;
}

export function applyInspectionItemCopilotPatches<T extends InspectionCopilotItem>({
  currentItems,
  values,
  blankItem,
}: {
  currentItems: T[];
  values: Record<string, unknown>;
  blankItem: () => T;
}) {
  let nextItems = [...currentItems];
  const applied: string[] = [];
  const ignored: string[] = [];

  if (Array.isArray(values.items)) {
    const incomingItems = values.items as unknown[];
    if (incomingItems.length > 0) {
      nextItems = [...currentItems];
      incomingItems.forEach((row, index) => {
        const incoming = row && typeof row === "object"
          ? row as Record<string, unknown>
          : {};
        const targetIndex = getBulkPatchTargetIndex(currentItems, incoming, index);
        const existing = nextItems[targetIndex] ?? blankItem();
        const normalized = Object.fromEntries(
          Object.entries(incoming)
            .filter(([field]) => !BULK_PATCH_META_FIELDS.has(field))
            .map(([field, value]) => [
              field,
              normalizeItemFieldValue(field, value),
            ]),
        );
        nextItems[targetIndex] = { ...existing, ...normalized } as T;
      });
    } else {
      nextItems = [blankItem()];
    }
    applied.push("items");
  }

  for (const [path, value] of Object.entries(values)) {
    if (path === "items") continue;
    const parsed = parseInspectionItemFieldPath(path);
    if (!parsed) continue;

    const existing = nextItems[parsed.index];
    if (!existing) {
      ignored.push(path);
      continue;
    }

    nextItems[parsed.index] = {
      ...existing,
      [parsed.field]: normalizeItemFieldValue(parsed.field, value),
    };
    applied.push(path);
  }

  return { nextItems, applied, ignored };
}

function optionLabel(option: SelectOption) {
  if (option.register_number) return option.register_number;
  if (option.name && option.code) return `${option.name} (${option.code})`;
  return option.name ?? String(option.id);
}

function selectOptions(options: SelectOption[]) {
  return options.map(option => ({
    label: optionLabel(option),
    value: option.id,
    ...(option.description ? { description: option.description } : {}),
    ...(option.specifications ? { specifications: option.specifications } : {}),
    ...(option.category_display ? { category_display: option.category_display } : {}),
    ...(option.category_type ? { category_type: option.category_type } : {}),
    ...(option.tracking_type ? { tracking_type: option.tracking_type } : {}),
    ...(option.acct_unit ? { acct_unit: option.acct_unit } : {}),
  }));
}

function optionResolverMeta(optionSource: string) {
  return {
    optionSource,
    resolver: "search_form_options" as const,
  };
}

function normalizeLookupKey(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function optionById(options: SelectOption[]) {
  return new Map(options.map(option => [option.id, option]));
}

function optionByLabels(options: SelectOption[]) {
  const byLabel = new Map<string, SelectOption>();
  options.forEach(option => {
    [option.register_number, option.name, option.code]
      .map(normalizeLookupKey)
      .filter(Boolean)
      .forEach(label => byLabel.set(label, option));
  });
  return byLabel;
}

function resolveOptionByIdOrLabel(
  value: unknown,
  label: unknown,
  byId: Map<number, SelectOption>,
  byLabel: Map<string, SelectOption>,
) {
  if (value !== "" && value !== null && value !== undefined) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      const option = byId.get(numeric);
      if (option) return option;
    }
  }

  const labelKey = normalizeLookupKey(label);
  return labelKey ? byLabel.get(labelKey) ?? null : null;
}

function resolveCatalogOption(
  item: InspectionReferenceItem,
  byId: Map<number, SelectOption>,
  byLabel: Map<string, SelectOption>,
) {
  const idMatch = resolveOptionByIdOrLabel(item.item, null, byId, byLabel);
  if (idMatch) return idMatch;

  for (const label of [item.item_code, item.item_name, item.item_description]) {
    const key = normalizeLookupKey(label);
    if (!key) continue;
    const option = byLabel.get(key);
    if (option) return option;
  }

  return null;
}

export function syncInspectionItemReferences<T extends InspectionReferenceItem>({
  items,
  departmentRegisterOptions,
  centralRegisterOptions,
  itemOptions,
}: {
  items: T[];
  departmentRegisterOptions: SelectOption[];
  centralRegisterOptions: SelectOption[];
  itemOptions: SelectOption[];
}) {
  const departmentRegistersById = optionById(departmentRegisterOptions);
  const departmentRegistersByLabel = optionByLabels(departmentRegisterOptions);
  const centralRegistersById = optionById(centralRegisterOptions);
  const centralRegistersByLabel = optionByLabels(centralRegisterOptions);
  const itemsById = optionById(itemOptions);
  const itemsByLabel = optionByLabels(itemOptions);

  return items.map(item => {
    const departmentRegister = resolveOptionByIdOrLabel(
      item.stock_register,
      item.stock_register_no,
      departmentRegistersById,
      departmentRegistersByLabel,
    );
    const centralRegister = resolveOptionByIdOrLabel(
      item.central_register,
      item.central_register_no,
      centralRegistersById,
      centralRegistersByLabel,
    );
    const catalogItem = resolveCatalogOption(item, itemsById, itemsByLabel);

    return {
      ...item,
      ...(departmentRegister
        ? {
            stock_register: departmentRegister.id,
            stock_register_no: departmentRegister.register_number ?? item.stock_register_no,
          }
        : {}),
      ...(centralRegister
        ? {
            central_register: centralRegister.id,
            central_register_no: centralRegister.register_number ?? item.central_register_no,
          }
        : {}),
      ...(catalogItem
        ? {
            item: catalogItem.id,
            item_name: catalogItem.name,
            item_code: catalogItem.code,
            item_category_type: catalogItem.category_type ?? null,
            item_tracking_type: catalogItem.tracking_type ?? null,
          }
        : {}),
    } as T;
  });
}

export function buildInspectionItemCopilotFields({
  items,
  canEditStock,
  canEditCentral,
  departmentRegisterOptions,
  centralRegisterOptions,
  itemOptions,
}: {
  items: Array<{ item_description?: string | null; accepted_quantity?: number | string | null }>;
  canEditStock: boolean;
  canEditCentral: boolean;
  departmentRegisterOptions: SelectOption[];
  centralRegisterOptions: SelectOption[];
  itemOptions: SelectOption[];
}): CopilotFormField[] {
  return items.flatMap((item, index) => {
    if ((canEditStock || canEditCentral) && Number(item.accepted_quantity || 0) <= 0) {
      return [];
    }

    const labelPrefix = item.item_description?.trim()
      ? `Item ${index + 1} (${item.item_description.trim()})`
      : `Item ${index + 1}`;
    const fields: CopilotFormField[] = [];

    if (canEditStock) {
      fields.push(
        {
          name: `items.${index}.stock_register`,
          label: `${labelPrefix} Stock Register`,
          type: "select",
          required: true,
          options: selectOptions(departmentRegisterOptions),
          ...optionResolverMeta("inspection.departmentStockRegisters"),
          description: "Patch this exact item row without replacing the full items array.",
        },
        {
          name: `items.${index}.stock_register_page_no`,
          label: `${labelPrefix} Stock Page Number`,
          type: "string",
          required: true,
          description: "Patch this exact item row without replacing the full items array.",
        },
        {
          name: `items.${index}.stock_entry_date`,
          label: `${labelPrefix} Stock Recording Date`,
          type: "date",
          required: true,
          description: "Patch this exact item row without replacing the full items array.",
        },
      );
    }

    if (canEditCentral) {
      fields.push(
        {
          name: `items.${index}.central_register`,
          label: `${labelPrefix} Central Register`,
          type: "select",
          required: true,
          options: selectOptions(centralRegisterOptions),
          ...optionResolverMeta("inspection.centralRegisters"),
          description: "Patch this exact item row without replacing the full items array.",
        },
        {
          name: `items.${index}.central_register_page_no`,
          label: `${labelPrefix} Central Page Number`,
          type: "string",
          required: true,
          description: "Patch this exact item row without replacing the full items array.",
        },
        {
          name: `items.${index}.item`,
          label: `${labelPrefix} System Item`,
          type: "select",
          required: true,
          options: selectOptions(itemOptions),
          ...optionResolverMeta("inspection.catalogItems"),
          description:
            "Link this inspection row to an existing AMS item catalog record only when the catalog item is a real match. Compare the inspection row item_description/item_specifications with option name/code/description and specifications. If a close existing item exists, use it to avoid redundancy. If no genuine match exists, do not create a new item silently; ask the user whether to link the closest existing item or create a new catalog item.",
        },
        {
          name: `items.${index}.batch_number`,
          label: `${labelPrefix} Batch Number`,
          type: "string",
        },
        {
          name: `items.${index}.manufactured_date`,
          label: `${labelPrefix} Manufactured Date`,
          type: "date",
        },
        {
          name: `items.${index}.expiry_date`,
          label: `${labelPrefix} Expiry Date`,
          type: "date",
        },
      );
    }

    return fields;
  });
}

export function buildInspectionFinanceCopilotFields({
  items,
  assetClassOptions,
}: {
  items: InspectionFinanceItem[];
  assetClassOptions: SelectOption[];
}): CopilotFormField[] {
  return items.flatMap((item, index) => {
    if (
      Number(item.accepted_quantity || 0) <= 0 ||
      item.item_category_type !== "FIXED_ASSET"
    ) {
      return [];
    }

    const labelSource = item.item_name || item.item_description;
    const labelPrefix = labelSource?.trim()
      ? `Item ${index + 1} (${labelSource.trim()})`
      : `Item ${index + 1}`;

    return [
      {
        name: `items.${index}.depreciation_asset_class`,
        label: `${labelPrefix} Depreciation Asset Class`,
        type: "select",
        required: true,
        options: selectOptions(assetClassOptions),
        ...optionResolverMeta("inspection.assetClasses"),
        description: "Patch this exact finance-review item row without replacing the full items array.",
      },
      {
        name: `items.${index}.capitalization_date`,
        label: `${labelPrefix} Capitalization Date`,
        type: "date",
        required: true,
        description: "Patch this exact finance-review item row without replacing the full items array.",
      },
      {
        name: `items.${index}.capitalization_cost`,
        label: `${labelPrefix} Capitalized Cost`,
        type: "number",
        required: true,
        description: "Patch this exact finance-review item row without replacing the full items array.",
      },
    ];
  });
}

export function buildInspectionCertificateItemCopilotFields({
  items,
  canEditItems,
  canEditStock,
  canEditCentral,
  departmentRegisterOptions,
  centralRegisterOptions,
  itemOptions,
}: {
  items: InspectionCreateItem[];
  canEditItems: boolean;
  canEditStock: boolean;
  canEditCentral: boolean;
  departmentRegisterOptions: SelectOption[];
  centralRegisterOptions: SelectOption[];
  itemOptions: SelectOption[];
}): CopilotFormField[] {
  return items.flatMap((item, index) => {
    const labelPrefix = item.item_description?.trim()
      ? `Item ${index + 1} (${item.item_description.trim()})`
      : `Item ${index + 1}`;
    const fields: CopilotFormField[] = [];

    if (canEditItems) {
      fields.push(
        {
          name: `items.${index}.item_description`,
          label: `${labelPrefix} Description`,
          type: "string",
          required: true,
          description: "Patch this exact item row without replacing the full items array.",
        },
        {
          name: `items.${index}.tendered_quantity`,
          label: `${labelPrefix} Tendered Quantity`,
          type: "number",
          required: true,
          description: "Must be greater than or equal to accepted + rejected quantity.",
        },
        {
          name: `items.${index}.accepted_quantity`,
          label: `${labelPrefix} Accepted Quantity`,
          type: "number",
          required: true,
        },
        {
          name: `items.${index}.rejected_quantity`,
          label: `${labelPrefix} Rejected Quantity`,
          type: "number",
          required: true,
        },
        {
          name: `items.${index}.unit_price`,
          label: `${labelPrefix} Unit Price`,
          type: "number",
          required: true,
        },
        {
          name: `items.${index}.remarks`,
          label: `${labelPrefix} Remarks / Rejection Reason`,
          type: "string",
          required: Number(item.rejected_quantity || 0) > 0,
        },
      );
    }

    if ((canEditStock || canEditCentral) && Number(item.accepted_quantity || 0) > 0) {
      fields.push(...buildInspectionItemCopilotFields({
        items: [item],
        canEditStock,
        canEditCentral,
        departmentRegisterOptions,
        centralRegisterOptions,
        itemOptions,
      }).map(field => ({
        ...field,
        name: field.name.replace(/^items\.0\./, `items.${index}.`),
        label: field.label.replace(/^Item 1\b/, `Item ${index + 1}`),
      })));
    }

    return fields;
  });
}

export function buildInspectionItemArrayCopilotFields({
  canEditItems,
  canEditStock,
  canEditCentral,
  canEditFinance = false,
}: {
  canEditItems: boolean;
  canEditStock: boolean;
  canEditCentral: boolean;
  canEditFinance?: boolean;
}): CopilotFormField[] {
  const fields: CopilotFormField[] = [];

  if (canEditItems) {
    fields.push(
      { name: "item_description", label: "Item Description", type: "string", required: true },
      { name: "item_specifications", label: "Item Specifications", type: "string" },
      { name: "tendered_quantity", label: "Tendered Quantity", type: "number", required: true },
      { name: "accepted_quantity", label: "Accepted Quantity", type: "number", required: true },
      { name: "rejected_quantity", label: "Rejected Quantity", type: "number", required: true },
      { name: "unit_price", label: "Unit Price", type: "number", required: true },
      { name: "remarks", label: "Remarks / Rejection Reason", type: "string" },
    );
  }

  if (canEditStock) {
    fields.push(
      { name: "stock_register", label: "Stock Register ID", type: "number" },
      { name: "stock_register_no", label: "Stock Register Number", type: "string" },
      { name: "stock_register_page_no", label: "Stock Register Page Number", type: "string" },
      { name: "stock_entry_date", label: "Stock Entry Date", type: "date" },
    );
  }

  if (canEditCentral) {
    fields.push(
      { name: "central_register", label: "Central Register ID", type: "number" },
      { name: "central_register_no", label: "Central Register Number", type: "string" },
      { name: "central_register_page_no", label: "Central Register Page Number", type: "string" },
      { name: "item", label: "System Item ID", type: "number" },
      { name: "batch_number", label: "Batch Number", type: "string" },
      { name: "manufactured_date", label: "Manufactured Date", type: "date" },
      { name: "expiry_date", label: "Expiry Date", type: "date" },
    );
  }

  if (canEditFinance) {
    fields.push(
      { name: "depreciation_asset_class", label: "Depreciation Asset Class ID", type: "number" },
      { name: "capitalization_cost", label: "Capitalization Cost", type: "number" },
      { name: "capitalization_date", label: "Capitalization Date", type: "date" },
    );
  }

  return fields;
}
