import { describe, expect, it } from "vitest";
import { shouldLoadUserAssignmentSelectors } from "./page";

describe("users page assignment selector semantics", () => {
  it("loads assignment selectors for create when create_user_accounts is present", () => {
    expect(shouldLoadUserAssignmentSelectors("create", true, false)).toBe(true);
  });

  it("loads assignment selectors for edit when edit_user_accounts is present", () => {
    expect(shouldLoadUserAssignmentSelectors("edit", false, true)).toBe(true);
  });

  it("does not load assignment selectors without the matching account capability", () => {
    expect(shouldLoadUserAssignmentSelectors("create", false, true)).toBe(false);
    expect(shouldLoadUserAssignmentSelectors("edit", true, false)).toBe(false);
  });
});
