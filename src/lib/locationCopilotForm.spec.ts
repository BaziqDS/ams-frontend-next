import { describe, expect, it } from "vitest";
import { buildLocationCopilotValuePatch } from "./locationCopilotForm";

describe("buildLocationCopilotValuePatch", () => {
  it("normalizes only known location form fields", () => {
    expect(buildLocationCopilotValuePatch({
      name: "Workshop",
      code: "ws-1",
      main_store_name: "Workshop Main Store",
      parent_location: 42,
      tags: [7, "8"],
      location_type: "LAB",
      create_main_store: true,
      is_store: true,
      is_active: false,
      description: "Repair area",
      address: "Block A",
      in_charge: "A. Khan",
      contact_number: "555-0100",
      extra: "ignored",
    })).toEqual({
      name: "Workshop",
      code: "ws-1",
      main_store_name: "Workshop Main Store",
      parent_location: "42",
      tags: ["7", "8"],
      location_type: "LAB",
      create_main_store: true,
      is_store: true,
      is_active: false,
      description: "Repair area",
      address: "Block A",
      in_charge: "A. Khan",
      contact_number: "555-0100",
    });
  });

  it("keeps empty parent location selectable as a root location", () => {
    expect(buildLocationCopilotValuePatch({ parent_location: "" })).toEqual({
      parent_location: "",
    });
  });
});
