import { describe, expect, it } from "vitest";
import { normalizeCopilotRoute } from "./copilotNavigation";

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
});
