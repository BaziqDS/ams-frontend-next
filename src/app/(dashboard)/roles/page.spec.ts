import { describe, expect, it } from "vitest";
import {
  canSelectDependencyLevel,
  getDependencyMinimums,
  normalizeSelectionsForDependencies,
  type ModuleDependencies,
} from "./page";

const dependencies: ModuleDependencies = {
  users: {
    manage: ["roles", "locations"],
    full: ["roles", "locations"],
  },
};

describe("roles page dependency locking", () => {
  it("raises user-management read dependencies to view", () => {
    expect(
      normalizeSelectionsForDependencies(
        { users: "manage", roles: null, locations: null },
        dependencies,
      ),
    ).toEqual({ users: "manage", roles: "view", locations: "view" });
  });

  it("reports dependent modules with view as their minimum selectable level", () => {
    expect(
      getDependencyMinimums(
        { users: "full", roles: null, locations: null },
        dependencies,
      ),
    ).toEqual({ roles: "view", locations: "view" });
  });

  it("prevents selecting no access below a dependency minimum", () => {
    const locks = getDependencyMinimums(
      { users: "manage", roles: "view", locations: "view" },
      dependencies,
    );

    expect(canSelectDependencyLevel("roles", null, locks)).toBe(false);
    expect(canSelectDependencyLevel("locations", null, locks)).toBe(false);
    expect(canSelectDependencyLevel("roles", "view", locks)).toBe(true);
    expect(canSelectDependencyLevel("roles", "manage", locks)).toBe(true);
  });
});
