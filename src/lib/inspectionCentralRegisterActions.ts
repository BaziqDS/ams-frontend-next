type CentralRegisterRowLike = {
  item_description?: string | null;
  item_name?: string | null;
  item_code?: string | null;
  accepted_quantity?: number | string | null;
};

type ResolveTargetArgs = {
  rows: CentralRegisterRowLike[];
  rowIndex?: number | null;
  itemDescription?: string | null;
};

type ResolveTargetResult =
  | { ok: true; sourceIndex: number; matchedBy: "row_index" | "item_description" }
  | { ok: false; errorType: "row_not_found" | "row_not_accepted" | "missing_row_reference"; message: string };

function normalizeSearch(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function acceptedQuantity(row: CentralRegisterRowLike) {
  const value = Number(row.accepted_quantity || 0);
  return Number.isFinite(value) ? value : 0;
}

function rowLabels(row: CentralRegisterRowLike) {
  return [row.item_description, row.item_name, row.item_code]
    .map(normalizeSearch)
    .filter(Boolean);
}

export function resolveCentralRegisterCreateItemTarget({
  rows,
  rowIndex,
  itemDescription,
}: ResolveTargetArgs): ResolveTargetResult {
  if (rowIndex !== null && rowIndex !== undefined) {
    if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= rows.length) {
      return {
        ok: false,
        errorType: "row_not_found",
        message: "The requested inspection item row was not found.",
      };
    }

    if (acceptedQuantity(rows[rowIndex]) <= 0) {
      return {
        ok: false,
        errorType: "row_not_accepted",
        message: "Only accepted inspection item rows can be linked to a catalog item.",
      };
    }

    return { ok: true, sourceIndex: rowIndex, matchedBy: "row_index" };
  }

  const query = normalizeSearch(itemDescription);
  if (!query) {
    const acceptedRows = rows
      .map((row, sourceIndex) => ({ row, sourceIndex }))
      .filter(({ row }) => acceptedQuantity(row) > 0);

    if (acceptedRows.length === 1) {
      return {
        ok: true,
        sourceIndex: acceptedRows[0].sourceIndex,
        matchedBy: "item_description",
      };
    }

    return {
      ok: false,
      errorType: "missing_row_reference",
      message: "Provide a row index or item description so the correct accepted inspection row can be selected.",
    };
  }

  const match = rows
    .map((row, sourceIndex) => ({ row, sourceIndex }))
    .filter(({ row }) => acceptedQuantity(row) > 0)
    .find(({ row }) => {
      return rowLabels(row).some(label => label === query || label.includes(query) || query.includes(label));
    });

  if (!match) {
    return {
      ok: false,
      errorType: "row_not_found",
      message: "No accepted inspection item row matched that description.",
    };
  }

  return {
    ok: true,
    sourceIndex: match.sourceIndex,
    matchedBy: "item_description",
  };
}
