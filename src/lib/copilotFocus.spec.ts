import { beforeEach, describe, expect, it, vi } from "vitest";
import { focusCopilotFormField } from "./copilotFocus";

describe("focusCopilotFormField", () => {
  const scrollIntoView = vi.fn();

  beforeEach(() => {
    document.body.innerHTML = "";
    scrollIntoView.mockReset();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
  });

  it("focuses and scrolls the first interactive control for a copilot field", () => {
    document.body.innerHTML = `
      <div data-copilot-field="name">
        <label>Name</label>
        <input value="" />
      </div>
    `;

    expect(focusCopilotFormField("name")).toEqual({ ok: true, field: "name" });
    expect(document.activeElement).toBe(document.querySelector("input"));
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "center", behavior: "smooth" });
  });

  it("returns a clear failure when the field is not focusable", () => {
    expect(focusCopilotFormField("missing")).toEqual({
      ok: false,
      reason: "Field missing is not focusable.",
    });
  });
});
