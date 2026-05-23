import { describe, expect, it } from "vitest";

import { filterInspectionCatalogItemOptions } from "./InspectionStageForms";
import type { InspectionItemOption } from "@/lib/inspectionUi";

describe("Central Register catalog item search", () => {
  it("matches catalog items by description and specifications, not only name/code", () => {
    const options: InspectionItemOption[] = [
      {
        id: 1,
        name: "Office Supplies",
        code: "STAT-01",
        category_type: "CONSUMABLE",
        tracking_type: "QUANTITY",
        description: "Stationary material",
        specifications: "Paper and pens",
      },
      {
        id: 2,
        name: "Processor",
        code: "CPU-01",
        category_type: "FIXED_ASSET",
        tracking_type: "INDIVIDUAL",
        description: "Computer processor",
        specifications: "Intel Core i5 12th generation",
      },
    ];

    expect(filterInspectionCatalogItemOptions(options, "core i5")).toEqual([
      options[1],
    ]);
    expect(filterInspectionCatalogItemOptions(options, "stationary")).toEqual([
      options[0],
    ]);
  });
});
