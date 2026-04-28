"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Topbar } from "@/components/Topbar";
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
  if (kind === "person") return "Person";
  return "Location";
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
        <Link className="detail-page-back" href={`/inspections/${params.id}`}>
          Back to Inspection
        </Link>

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
                <div className="eyebrow">Inspection Quantity Distribution</div>
                <h1>{payload.inspection_item.item_name}</h1>
                <div className="page-sub">
                  {payload.inspection.contract_no} / {payload.inspection.department_name ?? "Unknown department"} / {payload.inspection_item.item_code}
                </div>
                <div className="page-id-row">
                  <span className="doc-no">{trackingBatch}</span>
                  <span className="chip">Quantity Tracking</span>
                </div>
              </div>
            </div>

            <section className="detail-card" style={{ marginTop: 16 }}>
              <header className="detail-card-head">
                <div>
                  <div className="eyebrow">Batch summary</div>
                  <h2>Inspection provenance and batch metadata</h2>
                </div>
              </header>
              <div className="detail-card-body">
                <div className="detail-kv-grid">
                  <div className="detail-kv">
                    <div className="detail-kv-label">Inspection certificate</div>
                    <div className="detail-kv-value">{payload.inspection.contract_no}</div>
                  </div>
                  <div className="detail-kv">
                    <div className="detail-kv-label">Tracking batch</div>
                    <div className="detail-kv-value">{trackingBatch}</div>
                  </div>
                  <div className="detail-kv">
                    <div className="detail-kv-label">Accepted quantity</div>
                    <div className="detail-kv-value">{formatQuantity(payload.inspection_item.accepted_quantity)}</div>
                  </div>
                  <div className="detail-kv">
                    <div className="detail-kv-label">Manufactured date</div>
                    <div className="detail-kv-value">{formatDate(payload.batch.manufactured_date)}</div>
                  </div>
                  <div className="detail-kv">
                    <div className="detail-kv-label">Expiry date</div>
                    <div className="detail-kv-value">{formatDate(payload.batch.expiry_date)}</div>
                  </div>
                </div>
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
                    <div className="eyebrow">Standalone location</div>
                    <h2>{unit.name}</h2>
                  </div>
                  <div className="detail-card-head-meta">{unit.code}</div>
                </header>
                <div className="detail-card-body">
                  <div className="detail-kv-grid" style={{ marginBottom: 18 }}>
                    <div className="detail-kv">
                      <div className="detail-kv-label">Total</div>
                      <div className="detail-kv-value">{formatQuantity(unit.totalQuantity)}</div>
                    </div>
                    <div className="detail-kv">
                      <div className="detail-kv-label">Available</div>
                      <div className="detail-kv-value">{formatQuantity(unit.availableQuantity)}</div>
                    </div>
                    <div className="detail-kv">
                      <div className="detail-kv-label">Allocated</div>
                      <div className="detail-kv-value">{formatQuantity(unit.allocatedQuantity)}</div>
                    </div>
                    <div className="detail-kv">
                      <div className="detail-kv-label">In transit</div>
                      <div className="detail-kv-value">{formatQuantity(unit.inTransitQuantity)}</div>
                    </div>
                  </div>

                  <div className="h-scroll">
                    <table className="inspection-line-table inspection-line-table-review">
                      <thead>
                        <tr>
                          <th>Destination</th>
                          <th>Type</th>
                          <th>Source Store</th>
                          <th className="num center">Quantity</th>
                          <th className="num center">Available</th>
                          <th className="num center">Allocated</th>
                          <th className="num center">In Transit</th>
                          <th>Batch</th>
                          <th>Stock Entries</th>
                        </tr>
                      </thead>
                      <tbody>
                        {unit.rows.length === 0 ? (
                          <tr>
                            <td colSpan={9} className="detail-empty-copy">No active stock or allocation rows in this standalone location.</td>
                          </tr>
                        ) : unit.rows.map(row => (
                          <tr key={row.id}>
                            <td>{row.name}</td>
                            <td>{detailKindLabel(row.kind)}</td>
                            <td>{row.sourceStoreName ?? "Current store row"}</td>
                            <td className="num center">{formatQuantity(row.quantity)}</td>
                            <td className="num center">{row.availableQuantity == null ? "—" : formatQuantity(row.availableQuantity)}</td>
                            <td className="num center">{row.allocatedQuantity == null ? "—" : formatQuantity(row.allocatedQuantity)}</td>
                            <td className="num center">{row.inTransitQuantity == null ? "—" : formatQuantity(row.inTransitQuantity)}</td>
                            <td>{row.batchNumber ?? "—"}</td>
                            <td>{row.stockEntryIds.length ? row.stockEntryIds.join(", ") : "—"}</td>
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
