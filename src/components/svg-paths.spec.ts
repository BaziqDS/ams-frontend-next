import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("inline svg paths", () => {
  it("does not leave the sidebar user icon path truncated", () => {
    const source = readFileSync("src/components/AppSidebar.tsx", "utf8");

    expect(source).not.toContain('M21 19c0-2.7-1.8-5-4.5"');
    expect(source).toContain('M21 19c0-2.7-1.8-5-4.5-5');
  });
});
