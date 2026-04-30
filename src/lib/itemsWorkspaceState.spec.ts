import { describe, expect, it } from "vitest";
import {
  buildItemsWorkspaceHref,
  normalizeItemsWorkspaceState,
  parseItemsWorkspaceSearch,
} from "./itemsWorkspaceState";

describe("items workspace state helpers", () => {
  it("parses selected item and default distribution tab from search params", () => {
    const state = parseItemsWorkspaceSearch(new URLSearchParams("item=42"));

    expect(state).toEqual({
      itemId: "42",
      tab: "distribution",
      locationId: null,
    });
  });

  it("drops location when the active tab is not distribution", () => {
    const state = parseItemsWorkspaceSearch(new URLSearchParams("item=42&tab=instances&location=17"));

    expect(state).toEqual({
      itemId: "42",
      tab: "instances",
      locationId: null,
    });
  });

  it("normalizes unsupported tabs back to distribution for the selected item", () => {
    expect(
      normalizeItemsWorkspaceState(
        {
          itemId: "42",
          tab: "instances",
          locationId: null,
        },
        {
          canShowInstances: false,
          canShowBatches: false,
        },
      ),
    ).toEqual({
      itemId: "42",
      tab: "distribution",
      locationId: null,
    });
  });

  it("builds canonical workspace hrefs for compatibility redirects", () => {
    expect(buildItemsWorkspaceHref({ itemId: "42" })).toBe("/items?item=42&tab=distribution");
    expect(buildItemsWorkspaceHref({ itemId: "42", tab: "instances" })).toBe("/items?item=42&tab=instances");
    expect(buildItemsWorkspaceHref({ itemId: "42", tab: "distribution", locationId: "17" })).toBe("/items?item=42&tab=distribution&location=17");
  });
});
