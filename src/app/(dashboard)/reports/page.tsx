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
            <div className="page-sub">The reports workspace is being refined into a fuller operational reporting module.</div>
          </div>
        </div>

        <section className="reports-construction-card">
          <div className="reports-construction-badge-wrap">
            <span className="reports-construction-badge">Module under construction</span>
          </div>

          <div className="reports-construction-grid">
            <div className="reports-construction-copy">
              <div className="eyebrow">Reporting module</div>
              <h2>We are building a more meaningful reports workspace.</h2>
              <p>
                Dashboards, printable summaries, and deeper operational reporting are still being assembled.
                This area will expand into a fuller reporting surface in upcoming iterations.
              </p>
              <div className="reports-construction-meta">
                <span>Preview state</span>
                <span>Design pass in progress</span>
              </div>
            </div>

            <div className="reports-construction-aside">
              <div className="reports-construction-panel">
                <div className="eyebrow">Available now</div>
                <strong>Inventory Position Report</strong>
                <p>Need a live store-level snapshot today? Open the inventory position report directly.</p>
                <Link href="/reports/inventory-position" className="btn btn-sm btn-primary reports-construction-link">
                  Open inventory position report
                </Link>
              </div>
              <div className="reports-construction-scaffold" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
