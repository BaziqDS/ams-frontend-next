import type { CopilotFormField } from "@/hooks/useCopilotForm";

type SelectOption = {
  id: number;
  register_number?: string;
  name?: string;
  code?: string | null;
};

type InspectionCopilotItem = object;

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
  }));
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
          options: selectOptions(departmentRegisterOptions),
          description: "Patch this exact item row without replacing the full items array.",
        },
        {
          name: `items.${index}.stock_register_page_no`,
          label: `${labelPrefix} Stock Page Number`,
          type: "string",
          description: "Patch this exact item row without replacing the full items array.",
        },
        {
          name: `items.${index}.stock_entry_date`,
          label: `${labelPrefix} Stock Recording Date`,
          type: "date",
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
          options: selectOptions(centralRegisterOptions),
          description: "Patch this exact item row without replacing the full items array.",
        },
        {
          name: `items.${index}.central_register_page_no`,
          label: `${labelPrefix} Central Page Number`,
          type: "string",
          description: "Patch this exact item row without replacing the full items array.",
        },
        {
          name: `items.${index}.item`,
          label: `${labelPrefix} System Item`,
          type: "select",
          options: selectOptions(itemOptions),
          description: "Link this inspection row to an existing AMS item catalog record.",
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
