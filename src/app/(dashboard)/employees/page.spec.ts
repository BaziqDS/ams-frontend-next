import { describe, expect, it } from "vitest";
import { buildEmployeeForm } from "./page";

const csitLocation = {
  id: 11,
  name: "CSIT",
  code: "CSIT",
  kind: "Dept",
  parent_id: 3,
  depth: 1,
  asset_count: 0,
  item_count: 0,
  custodian: "",
  is_active: true,
  is_standalone: true,
  is_store: false,
};

describe("employee form location defaults", () => {
  it("preselects the only scoped non-root standalone location for create", () => {
    const form = buildEmployeeForm(null, [csitLocation]);

    expect(form.standalone_locations).toEqual([11]);
  });

  it("does not auto-select when multiple standalone locations are available", () => {
    const form = buildEmployeeForm(null, [
      csitLocation,
      { ...csitLocation, id: 12, name: "Electrical", code: "EE" },
    ]);

    expect(form.standalone_locations).toEqual([]);
  });

  it("preserves an existing employee assignment for edit", () => {
    const form = buildEmployeeForm(
      {
        id: 7,
        perse_number: "PERSE-7",
        name: "Test Employee",
        designation: "Lecturer",
        department: null,
        standalone_locations: [12],
        standalone_locations_display: ["Electrical"],
        is_active: true,
        created_at: "",
        updated_at: "",
      },
      [csitLocation],
    );

    expect(form.standalone_locations).toEqual([12]);
  });
});
