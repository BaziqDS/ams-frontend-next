import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("root layout hydration tolerance", () => {
  it("suppresses hydration warnings for extension-injected body attributes", () => {
    const source = readFileSync("src/app/layout.tsx", "utf8");

    expect(source).toMatch(/<body\s+suppressHydrationWarning/);
  });
});
