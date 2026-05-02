"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Topbar } from "@/components/Topbar";
import { useCan, useCapabilities } from "@/contexts/CapabilitiesContext";

export default function ReportsPage() {
  const router = useRouter();
  const { isLoading: capsLoading } = useCapabilities();
  const canView = useCan("reports");

  useEffect(() => {
    if (capsLoading) return;
    if (!canView) {
      router.replace("/403");
    }
  }, [canView, capsLoading, router]);

  return (
    <div>
      <Topbar breadcrumb={["Operations", "Reports"]} />
      <div className="page">
        <div className="page-head">
          <div className="page-title-group">
            <div className="eyebrow">Operations</div>
            <h1>Reports</h1>
            <div className="page-sub">Generate operational reports for the inventory modules available to your role.</div>
          </div>
        </div>

        <div className="table-card" style={{ padding: 24 }}>
          <div className="table-card-head" style={{ padding: 0, marginBottom: 20 }}>
            <div className="table-card-head-left">
              <div>
                <h3 style={{ margin: 0 }}>Available reports</h3>
                <p style={{ margin: "6px 0 0", color: "var(--text-2)", fontSize: 14 }}>
                  Start with the inventory position report for a store-level PDF snapshot.
                </p>
              </div>
            </div>
          </div>

          <Link
            href="/reports/inventory-position"
            style={{
              display: "block",
              padding: 18,
              border: "1px solid var(--line)",
              borderRadius: "var(--radius-lg)",
              textDecoration: "none",
              color: "inherit",
              background: "var(--panel)",
            }}
          >
            <div className="eyebrow" style={{ marginBottom: 8 }}>Report</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: "var(--ink)", marginBottom: 6 }}>
              Inventory Position Report
            </div>
            <div style={{ color: "var(--text-2)", fontSize: 14 }}>
              Select a store and open its current inventory position PDF in a new tab.
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
