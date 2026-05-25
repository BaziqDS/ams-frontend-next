"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Topbar } from "@/components/Topbar";
import { Button } from "@/components/ui/button";
import { ApiError, apiFetch } from "@/lib/api";
import { useCapabilities } from "@/contexts/CapabilitiesContext";
import { flattenDistributionDetails, formatQuantity, type ItemDistributionUnit } from "@/lib/itemUi";
import { formatInspectionDate } from "@/lib/inspectionUi";

type InspectionDistributionPayload = {
  inspection: {
    id: number;
    contract_no: string;
    department_id: number | null;
    department_name: string | null;
    stage: string;
    status: string;
  };
  inspection_item: {
    id: number;
    item_id: number;
    item_name: string;
    item_code: string;
    accepted_quantity: number;
    tracking_type: string;
    tracking_lot: string;
    manufactured_date: string | null;
    expiry_date: string | null;
  };
  batch: {
    id: number;
    batch_number: string;
    manufactured_date: string | null;
    expiry_date: string | null;
  };
  units: ItemDistributionUnit[];
};

function formatDate(value: string | null | undefined) {
  return value ? formatInspectionDate(value) : "—";
}

function detailKindLabel(kind: "store" | "person" | "location") {
  if (kind === "store") return "Store";
  if (kind === "person") return "Employee";
  return "Location";
}

function rowStateLabel(row: { kind: "store" | "person" | "location"; availableQuantity: number | null; allocatedQuantity: number | null; inTransitQuantity: number | null }) {
  if (row.kind !== "store") return "Allocated";
  if ((row.inTransitQuantity ?? 0) > 0) return "In transit";
  if ((row.allocatedQuantity ?? 0) > 0 && (row.availableQuantity ?? 0) > 0) return "Partly allocated";
  if ((row.allocatedQuantity ?? 0) > 0) return "Allocated from store";
  return "Available";
}

export default function InspectionItemDistributionPage() {
  const params = useParams<{ id: string; itemId: string }>();
  const router = useRouter();
  const { can, isLoading: capsLoading } = useCapabilities();
  const canView = can("inspections", "view");

  const [payload, setPayload] = useState<InspectionDistributionPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (capsLoading) return;
    if (!canView) {
      router.replace("/403");
      return;
    }

    let ignore = false;
    setLoading(true);
    setError(null);

    apiFetch<InspectionDistributionPayload>(
      `/api/inventory/inspections/${params.id}/items/${params.itemId}/distribution/`,
    )
      .then(data => {
        if (!ignore) setPayload(data);
      })
      .catch(err => {
        if (!ignore) setError(err instanceof ApiError ? err.message : "Failed to load inspection item distribution");
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [canView, capsLoading, params.id, params.itemId, router]);

  const detailUnits = useMemo(() => {
    if (!payload) return [];
    return payload.units.map(unit => ({
      ...unit,
      rows: flattenDistributionDetails(unit),
    }));
  }, [payload]);
  const totals = useMemo(() => {
    if (!payload) return { total: 0, available: 0, allocated: 0, inTransit: 0, rows: 0 };
    return payload.units.reduce((acc, unit) => {
      acc.total += unit.totalQuantity;
      acc.available += unit.availableQuantity;
      acc.allocated += unit.allocatedQuantity;
      acc.inTransit += unit.inTransitQuantity;
      acc.rows += flattenDistributionDetails(unit).length;
      return acc;
    }, { total: 0, available: 0, allocated: 0, inTransit: 0, rows: 0 });
  }, [payload]);
  const trackingBatch = payload?.inspection_item.tracking_lot ?? "—";

  return (
    <div>
      <Topbar
        breadcrumb={[
          "Operations",
          "Inspection Certificates",
          payload?.inspection.contract_no ?? "Distribution",
          payload?.inspection_item.item_name ?? "Quantity Trace",
        ]}
      />

      <div className="page" id="page-inspection-distribution">
        {error ? (
          <div className="detail-alert">
            <strong>Unable to load distribution</strong>
            <span>{error}</span>
          </div>
        ) : null}

        {loading ? (
          <div className="detail-card detail-card-body">Loading quantity distribution...</div>
        ) : payload ? (
          <>
            <div className="page-head-detail">
              <div className="page-title-group">
                <div className="eyebrow">Quantity Trace</div>
                <h1>{payload.inspection_item.item_name}</h1>
                <div className="page-sub">
                  {payload.inspection.contract_no} / {payload.inspection.department_name ?? "Unknown department"} / {payload.inspection_item.item_code}
                </div>
                <div className="page-id-row">
                  <span className="doc-no">{trackingBatch}</span>
                  <span className="chip">{formatQuantity(payload.inspection_item.accepted_quantity)} accepted</span>
                </div>
              </div>
              <div className="page-head-actions">
                <Button asChild variant="outline" size="sm" className="page-head-back">
                  <Link href={`/inspections/${params.id}`}>Back to Inspection</Link>
                </Button>
              </div>
            </div>

            <section className="detail-card inspection-distribution-summary" style={{ marginTop: 16 }}>
              <div className="detail-card-body">
                <div className="detail-stat-strip">
                  <div className="detail-stat">
                    <div className="detail-stat-label">Current total</div>
                    <div className="detail-stat-value">{formatQuantity(totals.total)}</div>
                  </div>
                  <div className="detail-stat">
                    <div className="detail-stat-label">Available</div>
                    <div className="detail-stat-value">{formatQuantity(totals.available)}</div>
                  </div>
                  <div className="detail-stat">
                    <div className="detail-stat-label">Allocated</div>
                    <div className="detail-stat-value">{formatQuantity(totals.allocated)}</div>
                  </div>
                  <div className="detail-stat">
                    <div className="detail-stat-label">In transit</div>
                    <div className="detail-stat-value">{formatQuantity(totals.inTransit)}</div>
                  </div>
                </div>
                {(payload.batch.manufactured_date || payload.batch.expiry_date) ? (
                  <div className="detail-empty-copy" style={{ marginTop: 12 }}>
                    Manufactured {formatDate(payload.batch.manufactured_date)} · Expires {formatDate(payload.batch.expiry_date)}
                  </div>
                ) : null}
              </div>
            </section>

            {detailUnits.length === 0 ? (
              <section className="detail-card" style={{ marginTop: 16 }}>
                <div className="detail-card-body">
                  <div className="detail-empty-copy">
                    No current store balances or allocations are attached to this inspection batch.
                  </div>
                </div>
              </section>
            ) : detailUnits.map(unit => (
              <section key={unit.id} className="detail-card" style={{ marginTop: 16 }}>
                <header className="detail-card-head">
                  <div>
                    <div className="eyebrow">Current holder group</div>
                    <h2>{unit.name}</h2>
                  </div>
                  <div className="detail-card-head-meta">{formatQuantity(unit.totalQuantity)}</div>
                </header>
                <div className="detail-card-body">
                  <div className="h-scroll">
                    <table className="inspection-line-table inspection-line-table-review">
                      <thead>
                        <tr>
                          <th>Holder</th>
                          <th>Type</th>
                          <th>Status</th>
                          <th className="num center">Qty</th>
                          <th>Stock Entries</th>
                        </tr>
                      </thead>
                      <tbody>
                        {unit.rows.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="detail-empty-copy">No active stock or allocation rows in this group.</td>
                          </tr>
                        ) : unit.rows.map(row => (
                          <tr key={row.id}>
                            <td>
                              <div className="inspection-line-primary">{row.name}</div>
                              {row.sourceStoreName ? <div className="inspection-line-secondary">From {row.sourceStoreName}</div> : null}
                            </td>
                            <td>{detailKindLabel(row.kind)}</td>
                            <td>{rowStateLabel(row)}</td>
                            <td className="num center">{formatQuantity(row.quantity)}</td>
                            <td>{row.stockEntryIds.length ? row.stockEntryIds.map(id => <Link key={id} className="link-inline" href={`/stock-entries/${id}`}>#{id}</Link>).reduce((prev, curr) => <>{prev}, {curr}</>) : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            ))}
          </>
        ) : (
          <div className="detail-card detail-card-body">Distribution record not found.</div>
        )}
      </div>
    </div>
  );
}
