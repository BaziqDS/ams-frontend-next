import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("modal textarea fields", () => {
  it("uses the centered textarea class on location detail textareas", () => {
    const source = readFileSync("src/components/LocationModal.tsx", "utf8");

    expect(source).toContain('className="textarea-field"');
    expect(source.match(/className="textarea-field"/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("uses the centered textarea class on category notes", () => {
    const source = readFileSync("src/components/CategoryModal.tsx", "utf8");

    expect(source).toContain('className="textarea-field"');
  });

  it("gives textarea placeholders input-like vertical inset", () => {
    const css = readFileSync("src/app/globals.css", "utf8");

    expect(css).toContain(".form-section-body textarea.textarea-field");
    expect(css).toContain("padding: 10px 12px");
    expect(css).toContain("line-height: 1.45");
  });
});
