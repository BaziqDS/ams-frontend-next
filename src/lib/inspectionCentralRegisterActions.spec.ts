import { describe, expect, it } from "vitest";
import { resolveCentralRegisterCreateItemTarget } from "./inspectionCentralRegisterActions";

describe("inspection central register copilot actions", () => {
  const rows = [
    {
      item_description: "Rejected chair",
      item_name: "",
      accepted_quantity: 0,
    },
    {
      item_description: "Core i5 desktop computer",
      item_name: "",
      accepted_quantity: 3,
    },
    {
      item_description: "UPS battery",
      item_name: "Backup UPS",
      accepted_quantity: 1,
    },
  ];

  it("uses an explicit source row index when the row has accepted quantity", () => {
    expect(resolveCentralRegisterCreateItemTarget({ rows, rowIndex: 1 })).toEqual({
      ok: true,
      sourceIndex: 1,
      matchedBy: "row_index",
    });
  });

  it("rejects explicit row indexes that are not accepted rows", () => {
    expect(resolveCentralRegisterCreateItemTarget({ rows, rowIndex: 0 })).toMatchObject({
      ok: false,
      errorType: "row_not_accepted",
    });
  });

  it("matches accepted rows by inspection description or linked item name", () => {
    expect(resolveCentralRegisterCreateItemTarget({ rows, itemDescription: "core i5" })).toEqual({
      ok: true,
      sourceIndex: 1,
      matchedBy: "item_description",
    });
    expect(resolveCentralRegisterCreateItemTarget({ rows, itemDescription: "backup" })).toEqual({
      ok: true,
      sourceIndex: 2,
      matchedBy: "item_description",
    });
  });

  it("returns a clear error when no accepted row matches", () => {
    expect(resolveCentralRegisterCreateItemTarget({ rows, itemDescription: "scanner" })).toMatchObject({
      ok: false,
      errorType: "row_not_found",
    });
  });
});
