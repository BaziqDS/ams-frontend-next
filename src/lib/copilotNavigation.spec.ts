import { describe, expect, it } from "vitest";
import { isSameCopilotRoute, normalizeCopilotRoute } from "./copilotNavigation";

describe("normalizeCopilotRoute", () => {
  it("accepts relative AMS routes", () => {
    expect(normalizeCopilotRoute("/inspections")).toBe("/inspections");
    expect(normalizeCopilotRoute("/items/12?tab=instances")).toBe("/items/12?tab=instances");
  });

  it("rejects external or malformed routes", () => {
    expect(normalizeCopilotRoute("https://example.com")).toBeNull();
    expect(normalizeCopilotRoute("//example.com")).toBeNull();
    expect(normalizeCopilotRoute("javascript:alert(1)")).toBeNull();
  });

  it("detects duplicate navigation to the current route", () => {
    expect(isSameCopilotRoute("/inspections", "/inspections")).toBe(true);
    expect(isSameCopilotRoute("/inspections", "/items")).toBe(false);
    expect(isSameCopilotRoute("/inspections", "https://example.com")).toBe(false);
  });
});
