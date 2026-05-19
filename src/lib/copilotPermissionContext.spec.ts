import { describe, expect, it } from "vitest";
import {
  buildCopilotPermissionSnapshot,
  getCopilotActionAccess,
} from "./copilotPermissionContext";

describe("copilot permission context", () => {
  const capabilities = {
    modules: {
      categories: "view",
      items: "manage",
      inspections: null,
    },
    manifest: {
      categories: ["view", "manage", "full"],
      items: ["view", "manage", "full"],
      inspections: ["view", "manage", "full"],
    },
    isSuperuser: false,
    inspectionStages: {
      available: ["fill_stock_details"],
      held: [],
    },
  } as const;

  it("explains why a registered action is blocked by missing capability", () => {
    const access = getCopilotActionAccess(
      {
        name: "open_create_category_form",
        description: "Open category modal",
        parameters: {},
        requiredCapabilities: [{ module: "categories", level: "manage" }],
      },
      {
        permissionValues: [],
        capabilities,
      },
    );

    expect(access).toEqual({
      allowed: false,
      blockedReason:
        "Requires capability categories:manage, current level is view.",
    });
  });

  it("builds a compact permission snapshot for the agent", () => {
    const permissionValues = Array.from(
      { length: 45 },
      (_, index) => `inventory.permission_${index}`,
    );
    const snapshot = buildCopilotPermissionSnapshot({
      user: {
        id: 9,
        username: "operator",
        is_superuser: false,
        is_staff: true,
        groups_display: ["Inventory"],
        assigned_locations: ["Main Store"],
      },
      permissionValues,
      capabilities,
      actions: [
        {
          name: "open_create_category_form",
          description: "Open category modal",
          parameters: {},
          requiredCapabilities: [{ module: "categories", level: "manage" }],
        },
        {
          name: "open_create_item_form",
          description: "Open item modal",
          parameters: {},
          requiredCapabilities: [{ module: "items", level: "manage" }],
        },
      ],
    });

    expect(snapshot.permissions.count).toBe(45);
    expect(snapshot.permissions.values).toHaveLength(40);
    expect(snapshot.capabilities.canManage).toEqual(["items"]);
    expect(snapshot.capabilities.cannotManage).toEqual([
      "categories",
      "inspections",
    ]);
    expect(
      snapshot.frontendActions.allowed.map((action) => action.name),
    ).toEqual(["open_create_item_form"]);
    expect(snapshot.frontendActions.blocked).toMatchObject([
      {
        name: "open_create_category_form",
        blockedReason:
          "Requires capability categories:manage, current level is view.",
      },
    ]);
  });
});
