import { describe, expect, it, vi } from "vitest";
import { buildNotificationFeedDisplay, formatNotificationRelativeTime } from "@/lib/notificationDisplay";
import type { NotificationFeedItem } from "@/contexts/NotificationsContext";

const baseNotification: NotificationFeedItem = {
  id: 1,
  event_id: 10,
  module: "inspections",
  kind: "inspection.completed",
  severity: "info",
  title: "Inspection IC-001 completed",
  message: "IC-001 was completed and pushed into downstream stock movement.",
  href: "/inspections/1",
  entity_type: "inspection",
  entity_id: 1,
  actor_id: 5,
  actor_name: "finance.user",
  metadata: {},
  created_at: "2026-05-25T08:00:00.000Z",
  is_read: false,
  read_at: null,
};

describe("notification display", () => {
  it("formats inspection rows with contract, department, stage, and time context", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-25T08:05:00.000Z"));

    const display = buildNotificationFeedDisplay({
      ...baseNotification,
      metadata: {
        contract_no: "IC-001",
        department_name: "CSIT",
        contractor_name: "Tech Supplier",
        stage: "COMPLETED",
        stage_label: "Completed",
      },
    });

    expect(display.headline).toBe("Inspection IC-001 completed");
    expect(display.preview).toContain("Department: CSIT");
    expect(display.preview).toContain("Contractor: Tech Supplier");
    expect(display.metaParts).toEqual(["5m ago", "CSIT", "Completed", "by finance.user"]);

    vi.useRealTimers();
  });

  it("formats stock entry rows with movement and item details", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-25T09:00:00.000Z"));

    const display = buildNotificationFeedDisplay({
      ...baseNotification,
      module: "stock-entries",
      kind: "stock_entry.pending_ack",
      severity: "warning",
      title: "Receipt SE-20260525-0001 needs acknowledgement",
      message: "SE-20260525-0001 has reached CSIT Store and is waiting for acknowledgement.",
      href: "/stock-entries/2",
      entity_type: "stock_entry",
      entity_id: 2,
      metadata: {
        entry_number: "SE-20260525-0001",
        entry_type: "RECEIPT",
        status: "PENDING_ACK",
        from_location_name: "Central Store",
        to_location_name: "CSIT Store",
        item_count: 2,
        total_quantity: 10,
      },
      created_at: "2026-05-25T08:45:00.000Z",
    });

    expect(display.headline).toBe("Receipt SE-20260525-0001 needs acknowledgement");
    expect(display.preview).toContain("Central Store to CSIT Store");
    expect(display.preview).toContain("2 line items, 10 units");
    expect(display.metaParts).toEqual(["15m ago", "Pending acknowledgement", "Receipt", "by finance.user"]);

    vi.useRealTimers();
  });

  it("keeps relative time stable for recent notifications", () => {
    expect(formatNotificationRelativeTime("2026-05-25T08:59:20.000Z", Date.parse("2026-05-25T09:00:00.000Z"))).toBe("just now");
    expect(formatNotificationRelativeTime("2026-05-25T08:00:00.000Z", Date.parse("2026-05-25T09:00:00.000Z"))).toBe("1h ago");
  });
});
