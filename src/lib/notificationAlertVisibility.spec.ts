import { describe, expect, it } from "vitest";
import {
  buildVisibleAlertModuleCounts,
  getActiveSeenAlertKeys,
  getSeenAlertKeysAfterViewingModule,
  getSeenAlertKeysAfterViewing,
  type SidebarAlertRecord,
} from "./notificationAlertVisibility";

const alert = (key: string, module: string, severity: SidebarAlertRecord["severity"] = "warning"): SidebarAlertRecord => ({
  key,
  module,
  severity,
});

describe("notification alert visibility", () => {
  it("counts only alert groups that have not been viewed", () => {
    const counts = buildVisibleAlertModuleCounts(
      [
        alert("depreciation-uncapitalized", "depreciation"),
        alert("maintenance-overdue", "maintenance", "critical"),
        alert("maintenance-critical", "maintenance"),
      ],
      new Set(["depreciation-uncapitalized", "maintenance-critical"]),
    );

    expect(counts).toEqual({
      maintenance: { count: 1, critical: 1 },
    });
  });

  it("marks every currently visible alert as viewed", () => {
    const seen = getSeenAlertKeysAfterViewing(
      new Set(["items-low-stock"]),
      [
        alert("depreciation-uncapitalized", "depreciation"),
        alert("maintenance-overdue", "maintenance", "critical"),
      ],
    );

    expect([...seen].sort()).toEqual([
      "depreciation-uncapitalized",
      "items-low-stock",
      "maintenance-overdue",
    ]);
  });

  it("drops stale viewed keys when their alert is no longer active", () => {
    const seen = getActiveSeenAlertKeys(
      new Set(["depreciation-uncapitalized", "items-low-stock"]),
      [alert("depreciation-uncapitalized", "depreciation")],
    );

    expect([...seen]).toEqual(["depreciation-uncapitalized"]);
  });

  it("marks active alerts for the viewed module only", () => {
    const seen = getSeenAlertKeysAfterViewingModule(
      new Set(["items-low-stock"]),
      [
        alert("depreciation-uncapitalized", "depreciation"),
        alert("maintenance-overdue", "maintenance", "critical"),
      ],
      "depreciation",
    );

    expect([...seen].sort()).toEqual(["depreciation-uncapitalized", "items-low-stock"]);
  });
});
