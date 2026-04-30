"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Topbar } from "@/components/Topbar";
import { useCan, useCapabilities } from "@/contexts/CapabilitiesContext";
import { apiFetch, type Page } from "@/lib/api";
import { formatItemDate, formatItemLabel, formatQuantity, toNumber, type DepreciationSummary } from "@/lib/itemUi";

type DepreciationTab = "register" | "runs" | "classes" | "uncapitalized" | "adjustments";

interface FixedAssetEntry {
  id: number;
  asset_number: string;
  item: number;
  item_name?: string | null;
  item_code?: string | null;
  instance?: number | null;
  instance_serial?: string | null;
  batch?: number | null;
  batch_number?: string | null;
  target_type: "INSTANCE" | "LOT" | string;
  asset_class: number;
  asset_class_name?: string | null;
  original_quantity: number;
  remaining_quantity: number;
  original_cost: string;
  capitalization_date: string;
  status: string;
  depreciation_summary?: DepreciationSummary | null;
}

interface DepreciationEntry {
  id: number;
  asset_number: string;
  item_name?: string | null;
  fiscal_year_start: number;
  rate: string;
  opening_value: string;
  depreciation_amount: string;
  accumulated_depreciation: string;
  closing_value: string;
}

interface DepreciationRun {
  id: number;
  fiscal_year_start: number;
  fiscal_year_label?: string | null;
  status: "DRAFT" | "POSTED" | "REVERSED" | string;
  entry_count?: number | null;
  posted_at?: string | null;
}

interface DepreciationAssetClass {
  id: number;
  name: string;
  code: string;
  category_name?: string | null;
  current_rate?: string | null;
  is_active: boolean;
}

interface DepreciationRate {
  id: number;
  asset_class: number;
  asset_class_name?: string | null;
  rate: string;
  effective_from: string;
  effective_to?: string | null;
  source_reference?: string | null;
}

interface UncapitalizedAsset {
  target_type: "INSTANCE" | "LOT" | string;
  item: number;
  item_name: string;
  item_code: string;
  instance: number | null;
  batch: number | null;
  batch_number?: string | null;
  quantity: number;
}

interface AssetValueAdjustment {
  id: number;
  asset: number;
  asset_number?: string | null;
  item_name?: string | null;
  adjustment_type: string;
  effective_date: string;
  amount: string;
  quantity_delta: number;
  reason: string;
}

const TABS: Array<{ key: DepreciationTab; label: string }> = [
  { key: "register", label: "Register" },
  { key: "runs", label: "Runs" },
  { key: "classes", label: "Classes & Rates" },
  { key: "uncapitalized", label: "Uncapitalized" },
  { key: "adjustments", label: "Adjustments" },
];

const ADJUSTMENT_TYPES = [
  "ADDITION",
  "COST_CORRECTION",
  "DISPOSAL",
  "LOSS",
  "WRITE_OFF",
  "QUANTITY_REDUCTION",
];

const Icon = ({ d, size = 16 }: { d: ReactNode | string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }} aria-hidden="true" focusable="false">
    {typeof d === "string" ? <path d={d} /> : d}
  </svg>
);

function normalizeList<T>(data: Page<T> | T[]) {
  return Array.isArray(data) ? data : data.results;
}

function formatMoney(value: number | string | null | undefined) {
  return new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: "PKR",
    maximumFractionDigits: 0,
  }).format(toNumber(value));
}

function statusPillClass(status: string | null | undefined) {
  if (status === "POSTED" || status === "ACTIVE") return "pill pill-success";
  if (status === "DRAFT") return "pill pill-warning";
  if (status === "REVERSED" || status === "DISPOSED" || status === "LOST" || status === "JUNK") return "pill pill-danger";
  return "pill pill-neutral";
}

function Alert({ children, onDismiss }: { children: ReactNode; onDismiss?: () => void }) {
  return (
    <div style={{ padding: "12px 16px", background: "var(--danger-weak)", border: "1px solid color-mix(in oklch, var(--danger) 30%, transparent)", borderRadius: "var(--radius)", color: "var(--danger)", fontSize: 13, marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <span>{children}</span>
      {onDismiss ? <button type="button" className="btn btn-xs btn-ghost" onClick={onDismiss}>Dismiss</button> : null}
    </div>
  );
}

function EmptyRow({ colSpan, message }: { colSpan: number; message: string }) {
  return (
    <tr>
      <td colSpan={colSpan}>
        <div style={{ padding: "32px 12px", textAlign: "center", color: "var(--text-2)", fontSize: 13 }}>
          {message}
        </div>
      </td>
    </tr>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="stage-form-field">
      <span className="stage-form-label">{label}</span>
      {children}
    </label>
  );
}

function Metric({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="detail-kv">
      <div className="detail-kv-label">{label}</div>
      <div className="detail-kv-value">{value}</div>
      {sub ? <div className="detail-kv-sub">{sub}</div> : null}
    </div>
  );
}

export default function DepreciationPage() {
  const router = useRouter();
  const { isLoading: capsLoading } = useCapabilities();
  const canView = useCan("depreciation");
  const canManage = useCan("depreciation", "manage");
  const canFull = useCan("depreciation", "full");
  const [activeTab, setActiveTab] = useState<DepreciationTab>("register");
  const [assets, setAssets] = useState<FixedAssetEntry[]>([]);
  const [runs, setRuns] = useState<DepreciationRun[]>([]);
  const [classes, setClasses] = useState<DepreciationAssetClass[]>([]);
  const [rates, setRates] = useState<DepreciationRate[]>([]);
  const [uncapitalized, setUncapitalized] = useState<UncapitalizedAsset[]>([]);
  const [adjustments, setAdjustments] = useState<AssetValueAdjustment[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<number | null>(null);
  const [schedule, setSchedule] = useState<DepreciationEntry[]>([]);
  const [previewRunId, setPreviewRunId] = useState<number | null>(null);
  const [previewRows, setPreviewRows] = useState<DepreciationEntry[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runYear, setRunYear] = useState(String(new Date().getFullYear() - (new Date().getMonth() < 6 ? 1 : 0)));
  const [classForm, setClassForm] = useState({ name: "", code: "" });
  const [rateForm, setRateForm] = useState({ asset_class: "", rate: "", effective_from: "", source_reference: "" });
  const [capitalizationForm, setCapitalizationForm] = useState({ rowKey: "", original_cost: "", capitalization_date: "", asset_class: "" });
  const [adjustmentForm, setAdjustmentForm] = useState({ asset: "", adjustment_type: "DISPOSAL", effective_date: "", amount: "", quantity_delta: "0", reason: "" });

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [assetData, runData, classData, rateData, uncapitalizedData, adjustmentData] = await Promise.all([
        apiFetch<Page<FixedAssetEntry> | FixedAssetEntry[]>("/api/inventory/depreciation/assets/?page_size=500"),
        apiFetch<Page<DepreciationRun> | DepreciationRun[]>("/api/inventory/depreciation/runs/?page_size=200"),
        apiFetch<Page<DepreciationAssetClass> | DepreciationAssetClass[]>("/api/inventory/depreciation/asset-classes/?page_size=500"),
        apiFetch<Page<DepreciationRate> | DepreciationRate[]>("/api/inventory/depreciation/rates/?page_size=500"),
        apiFetch<UncapitalizedAsset[]>("/api/inventory/depreciation/assets/uncapitalized/"),
        apiFetch<Page<AssetValueAdjustment> | AssetValueAdjustment[]>("/api/inventory/depreciation/adjustments/?page_size=500"),
      ]);
      setAssets(normalizeList(assetData));
      setRuns(normalizeList(runData));
      setClasses(normalizeList(classData));
      setRates(normalizeList(rateData));
      setUncapitalized(uncapitalizedData);
      setAdjustments(normalizeList(adjustmentData));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load depreciation data.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (capsLoading) return;
    if (!canView) {
      router.replace("/403");
      return;
    }
    load();
  }, [canView, capsLoading, load, router]);

  const selectedAsset = useMemo(
    () => assets.find(asset => asset.id === selectedAssetId) ?? null,
    [assets, selectedAssetId],
  );

  const filteredAssets = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return assets;
    return assets.filter(asset => [
      asset.asset_number,
      asset.item_name ?? "",
      asset.item_code ?? "",
      asset.asset_class_name ?? "",
      asset.batch_number ?? "",
      asset.instance_serial ?? "",
    ].join(" ").toLowerCase().includes(q));
  }, [assets, search]);

  const summary = useMemo(() => assets.reduce((totals, asset) => {
    const depreciation = asset.depreciation_summary;
    totals.count += 1;
    totals.originalCost += toNumber(asset.original_cost);
    totals.currentWdv += toNumber(depreciation?.current_wdv ?? asset.original_cost);
    totals.accumulated += toNumber(depreciation?.accumulated_depreciation);
    return totals;
  }, { count: 0, originalCost: 0, accumulated: 0, currentWdv: 0 }), [assets]);

  const loadSchedule = async (assetId: number) => {
    setSelectedAssetId(assetId);
    setBusy(`schedule-${assetId}`);
    setError(null);
    try {
      setSchedule(await apiFetch<DepreciationEntry[]>(`/api/inventory/depreciation/assets/${assetId}/schedule/`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load depreciation schedule.");
    } finally {
      setBusy(null);
    }
  };

  const createRun = async () => {
    if (!canManage) return;
    setBusy("create-run");
    setError(null);
    try {
      const run = await apiFetch<DepreciationRun>("/api/inventory/depreciation/runs/", {
        method: "POST",
        body: JSON.stringify({ fiscal_year_start: Number(runYear) }),
      });
      setRuns(prev => [run, ...prev.filter(row => row.id !== run.id)]);
      setActiveTab("runs");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create depreciation run.");
    } finally {
      setBusy(null);
    }
  };

  const previewRun = async (runId: number) => {
    setPreviewRunId(runId);
    setBusy(`preview-${runId}`);
    setError(null);
    try {
      setPreviewRows(await apiFetch<DepreciationEntry[]>(`/api/inventory/depreciation/runs/${runId}/preview/`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to preview depreciation run.");
    } finally {
      setBusy(null);
    }
  };

  const postRun = async (runId: number) => {
    if (!canFull) return;
    setBusy(`post-${runId}`);
    setError(null);
    try {
      const run = await apiFetch<DepreciationRun>(`/api/inventory/depreciation/runs/${runId}/post/`, { method: "POST", body: "{}" });
      setRuns(prev => prev.map(row => row.id === run.id ? run : row));
      await load();
      if (previewRunId === runId) await previewRun(runId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to post depreciation run.");
    } finally {
      setBusy(null);
    }
  };

  const reverseRun = async (runId: number) => {
    if (!canFull) return;
    setBusy(`reverse-${runId}`);
    setError(null);
    try {
      const run = await apiFetch<DepreciationRun>(`/api/inventory/depreciation/runs/${runId}/reverse/`, { method: "POST", body: "{}" });
      setRuns(prev => prev.map(row => row.id === run.id ? run : row));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reverse depreciation run.");
    } finally {
      setBusy(null);
    }
  };

  const createAssetClass = async () => {
    if (!canFull || !classForm.name.trim() || !classForm.code.trim()) return;
    setBusy("create-class");
    setError(null);
    try {
      await apiFetch<DepreciationAssetClass>("/api/inventory/depreciation/asset-classes/", {
        method: "POST",
        body: JSON.stringify({ name: classForm.name.trim(), code: classForm.code.trim().toUpperCase() }),
      });
      setClassForm({ name: "", code: "" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create asset class.");
    } finally {
      setBusy(null);
    }
  };

  const createRate = async () => {
    if (!canFull || !rateForm.asset_class || !rateForm.rate || !rateForm.effective_from) return;
    setBusy("create-rate");
    setError(null);
    try {
      await apiFetch<DepreciationRate>("/api/inventory/depreciation/rates/", {
        method: "POST",
        body: JSON.stringify({
          asset_class: Number(rateForm.asset_class),
          rate: rateForm.rate,
          effective_from: rateForm.effective_from,
          source_reference: rateForm.source_reference.trim(),
        }),
      });
      setRateForm({ asset_class: "", rate: "", effective_from: "", source_reference: "" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create rate version.");
    } finally {
      setBusy(null);
    }
  };

  const createCapitalization = async () => {
    if (!canManage) return;
    const row = uncapitalized.find(candidate => `${candidate.target_type}-${candidate.instance ?? candidate.batch}` === capitalizationForm.rowKey);
    if (!row || !capitalizationForm.original_cost || !capitalizationForm.capitalization_date) return;
    setBusy("capitalize");
    setError(null);
    try {
      await apiFetch<FixedAssetEntry>("/api/inventory/depreciation/assets/", {
        method: "POST",
        body: JSON.stringify({
          item: row.item,
          instance: row.instance,
          batch: row.batch,
          target_type: row.target_type,
          asset_class: capitalizationForm.asset_class ? Number(capitalizationForm.asset_class) : undefined,
          original_quantity: row.quantity,
          remaining_quantity: row.quantity,
          original_cost: capitalizationForm.original_cost,
          capitalization_date: capitalizationForm.capitalization_date,
          depreciation_start_date: capitalizationForm.capitalization_date,
        }),
      });
      setCapitalizationForm({ rowKey: "", original_cost: "", capitalization_date: "", asset_class: "" });
      await load();
      setActiveTab("register");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to capitalize fixed asset.");
    } finally {
      setBusy(null);
    }
  };

  const createAdjustment = async () => {
    if (!canManage || !adjustmentForm.asset || !adjustmentForm.amount || !adjustmentForm.effective_date || !adjustmentForm.reason.trim()) return;
    setBusy("adjust");
    setError(null);
    try {
      await apiFetch<AssetValueAdjustment>("/api/inventory/depreciation/adjustments/", {
        method: "POST",
        body: JSON.stringify({
          asset: Number(adjustmentForm.asset),
          adjustment_type: adjustmentForm.adjustment_type,
          effective_date: adjustmentForm.effective_date,
          amount: adjustmentForm.amount,
          quantity_delta: Number(adjustmentForm.quantity_delta || 0),
          reason: adjustmentForm.reason.trim(),
        }),
      });
      setAdjustmentForm({ asset: "", adjustment_type: "DISPOSAL", effective_date: "", amount: "", quantity_delta: "0", reason: "" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create value adjustment.");
    } finally {
      setBusy(null);
    }
  };

  const selectedCapitalizationRow = useMemo(
    () => uncapitalized.find(candidate => `${candidate.target_type}-${candidate.instance ?? candidate.batch}` === capitalizationForm.rowKey) ?? null,
    [capitalizationForm.rowKey, uncapitalized],
  );

  return (
    <div data-density="compact">
      <Topbar breadcrumb={["Inventory", "Depreciation"]} />
      <div className="page">
        {error ? <Alert onDismiss={() => setError(null)}>{error}</Alert> : null}

        <div className="page-head">
          <div className="page-title-group">
            <div className="eyebrow">Finance</div>
            <h1>Depreciation</h1>
            <div className="page-sub">Fixed asset register, fiscal-year runs, asset classes, and adjustments.</div>
          </div>
          <div className="page-head-actions">
            <button type="button" className="btn btn-sm" onClick={() => load()} disabled={isLoading || busy !== null}>
              <Icon d="M21 12a9 9 0 11-2.64-6.36M21 3v6h-6" size={14} />
              Refresh
            </button>
          </div>
        </div>

        <div className="detail-kv-grid" style={{ marginBottom: 16 }}>
          <Metric label="Register entries" value={<span className="mono">{formatQuantity(summary.count)}</span>} sub="capitalized fixed assets" />
          <Metric label="Original cost" value={formatMoney(summary.originalCost)} sub="gross capitalization value" />
          <Metric label="Accumulated depreciation" value={formatMoney(summary.accumulated)} sub="posted depreciation to date" />
          <Metric label="Current WDV / NBV" value={formatMoney(summary.currentWdv)} sub="latest posted value" />
        </div>

        <div className="filter-bar">
          <div className="filter-bar-left">
            <div className="chip-filter">
              {TABS.map(tab => (
                <button key={tab.key} type="button" className={"chip-filter-btn" + (activeTab === tab.key ? " active" : "")} onClick={() => setActiveTab(tab.key)}>
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
          <div className="filter-bar-right">
            <span className="pill pill-neutral">{canFull ? "Full access" : canManage ? "Manage access" : "View access"}</span>
          </div>
        </div>

        {activeTab === "register" ? (
          <div style={{ display: "grid", gap: 16 }}>
            <div className="filter-bar">
              <div className="filter-bar-left">
                <div className="search-input">
                  <Icon d={<><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></>} size={14} />
                  <input placeholder="Search asset number, item, class, serial, or lot..." value={search} onChange={event => setSearch(event.target.value)} />
                  {search ? <button type="button" className="clear-search" onClick={() => setSearch("")}>x</button> : null}
                </div>
              </div>
            </div>

            <div className="table-card">
              <div className="table-card-head">
                <div className="table-card-head-left">
                  <div className="eyebrow">Fixed Asset Register</div>
                  <div className="table-count"><span className="mono">{filteredAssets.length}</span><span>of</span><span className="mono">{assets.length}</span><span>entries</span></div>
                </div>
              </div>
              {isLoading ? (
                <div style={{ padding: 32, textAlign: "center", color: "var(--muted)", borderTop: "1px solid var(--hairline)" }}>Loading register...</div>
              ) : (
                <div className="h-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Asset</th>
                        <th>Item</th>
                        <th>Class</th>
                        <th>Type</th>
                        <th>Qty</th>
                        <th>Original cost</th>
                        <th>Accumulated</th>
                        <th>WDV / NBV</th>
                        <th>Status</th>
                        <th>Schedule</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAssets.length === 0 ? (
                        <EmptyRow colSpan={10} message="No fixed asset register entries match the current filters." />
                      ) : filteredAssets.map(asset => (
                        <tr key={asset.id}>
                          <td className="col-user">
                            <div className="identity-cell">
                              <div className="user-name mono">{asset.asset_number}</div>
                              <div className="user-username">{asset.instance_serial || asset.batch_number || formatItemDate(asset.capitalization_date)}</div>
                            </div>
                          </td>
                          <td>
                            <div className="login-cell">
                              <div>{asset.item_name ?? "-"}</div>
                              <div className="login-cell-sub mono">{asset.item_code ?? "-"}</div>
                            </div>
                          </td>
                          <td>{asset.asset_class_name ?? "-"}</td>
                          <td><span className="chip">{asset.target_type === "LOT" ? "Asset Lot" : "Instance"}</span></td>
                          <td>{formatQuantity(asset.remaining_quantity)} / {formatQuantity(asset.original_quantity)}</td>
                          <td>{formatMoney(asset.original_cost)}</td>
                          <td>{formatMoney(asset.depreciation_summary?.accumulated_depreciation)}</td>
                          <td>{formatMoney(asset.depreciation_summary?.current_wdv ?? asset.original_cost)}</td>
                          <td><span className={statusPillClass(asset.status)}>{formatItemLabel(asset.status)}</span></td>
                          <td>
                            <button type="button" className="btn btn-xs btn-ghost" onClick={() => loadSchedule(asset.id)} disabled={busy === `schedule-${asset.id}`}>
                              View
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {selectedAsset ? (
              <div className="table-card">
                <div className="table-card-head">
                  <div className="table-card-head-left">
                    <div className="eyebrow">Schedule</div>
                    <div className="table-count"><span>{selectedAsset.asset_number}</span><span>{selectedAsset.item_name}</span></div>
                  </div>
                </div>
                <div className="h-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Fiscal year</th>
                        <th>Rate</th>
                        <th>Opening WDV</th>
                        <th>Depreciation</th>
                        <th>Accumulated</th>
                        <th>Closing WDV</th>
                      </tr>
                    </thead>
                    <tbody>
                      {schedule.length === 0 ? (
                        <EmptyRow colSpan={6} message="No posted depreciation entries exist for this asset yet." />
                      ) : schedule.map(entry => (
                        <tr key={entry.id}>
                          <td className="mono">{entry.fiscal_year_start}-{String(entry.fiscal_year_start + 1).slice(-2)}</td>
                          <td>{entry.rate}%</td>
                          <td>{formatMoney(entry.opening_value)}</td>
                          <td>{formatMoney(entry.depreciation_amount)}</td>
                          <td>{formatMoney(entry.accumulated_depreciation)}</td>
                          <td>{formatMoney(entry.closing_value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {activeTab === "runs" ? (
          <div style={{ display: "grid", gap: 16 }}>
            {canManage ? (
              <div className="stage-form-row">
                <div className="stage-form-fields stage-form-fields-3">
                  <Field label="Fiscal year start">
                    <input type="number" min={2001} value={runYear} onChange={event => setRunYear(event.target.value)} />
                  </Field>
                  <div style={{ alignSelf: "end" }}>
                    <button type="button" className="btn btn-sm" onClick={createRun} disabled={busy === "create-run"}>
                      Create draft run
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="table-card">
              <div className="table-card-head">
                <div className="table-card-head-left">
                  <div className="eyebrow">Depreciation Runs</div>
                  <div className="table-count"><span className="mono">{runs.length}</span><span>runs</span></div>
                </div>
              </div>
              <div className="h-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Fiscal year</th>
                      <th>Status</th>
                      <th>Entries</th>
                      <th>Posted</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.length === 0 ? (
                      <EmptyRow colSpan={5} message="No depreciation runs have been created." />
                    ) : runs.map(run => (
                      <tr key={run.id}>
                        <td className="mono">{run.fiscal_year_label ?? `${run.fiscal_year_start}-${String(run.fiscal_year_start + 1).slice(-2)}`}</td>
                        <td><span className={statusPillClass(run.status)}>{formatItemLabel(run.status)}</span></td>
                        <td>{formatQuantity(run.entry_count)}</td>
                        <td>{formatItemDate(run.posted_at)}</td>
                        <td className="col-actions">
                          <button type="button" className="btn btn-xs btn-ghost row-action" onClick={() => previewRun(run.id)} disabled={busy === `preview-${run.id}`}>
                            Preview
                          </button>
                          {canFull && run.status === "DRAFT" ? (
                            <button type="button" className="btn btn-xs row-action" onClick={() => postRun(run.id)} disabled={busy === `post-${run.id}`}>
                              Post
                            </button>
                          ) : null}
                          {canFull && run.status === "POSTED" ? (
                            <button type="button" className="btn btn-xs btn-danger-ghost row-action" onClick={() => reverseRun(run.id)} disabled={busy === `reverse-${run.id}`}>
                              Reverse
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {previewRunId ? (
              <div className="table-card">
                <div className="table-card-head">
                  <div className="table-card-head-left">
                    <div className="eyebrow">Run preview</div>
                    <div className="table-count"><span className="mono">{previewRows.length}</span><span>pending entries</span></div>
                  </div>
                </div>
                <div className="h-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Asset</th>
                        <th>Item</th>
                        <th>Rate</th>
                        <th>Opening WDV</th>
                        <th>Depreciation</th>
                        <th>Closing WDV</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.length === 0 ? (
                        <EmptyRow colSpan={6} message="No eligible assets remain for this fiscal-year run." />
                      ) : previewRows.map((row, index) => (
                        <tr key={`${row.asset_number}-${index}`}>
                          <td className="mono">{row.asset_number}</td>
                          <td>{row.item_name ?? "-"}</td>
                          <td>{row.rate}%</td>
                          <td>{formatMoney(row.opening_value)}</td>
                          <td>{formatMoney(row.depreciation_amount)}</td>
                          <td>{formatMoney(row.closing_value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {activeTab === "classes" ? (
          <div style={{ display: "grid", gap: 16 }}>
            {canFull ? (
              <div className="stage-form-row">
                <div className="stage-form-fields stage-form-fields-3">
                  <Field label="Class name">
                    <input value={classForm.name} onChange={event => setClassForm(prev => ({ ...prev, name: event.target.value }))} placeholder="Furniture" />
                  </Field>
                  <Field label="Class code">
                    <input value={classForm.code} onChange={event => setClassForm(prev => ({ ...prev, code: event.target.value.toUpperCase() }))} placeholder="FURN" />
                  </Field>
                  <div style={{ alignSelf: "end" }}>
                    <button type="button" className="btn btn-sm" onClick={createAssetClass} disabled={busy === "create-class"}>
                      Add class
                    </button>
                  </div>
                </div>
                <div className="stage-form-fields stage-form-fields-4" style={{ marginTop: 12 }}>
                  <Field label="Rate class">
                    <select value={rateForm.asset_class} onChange={event => setRateForm(prev => ({ ...prev, asset_class: event.target.value }))}>
                      <option value="">Select class</option>
                      {classes.map(assetClass => <option key={assetClass.id} value={assetClass.id}>{assetClass.name} ({assetClass.code})</option>)}
                    </select>
                  </Field>
                  <Field label="Rate %">
                    <input type="number" min={0} step="0.01" value={rateForm.rate} onChange={event => setRateForm(prev => ({ ...prev, rate: event.target.value }))} />
                  </Field>
                  <Field label="Effective from">
                    <input type="date" value={rateForm.effective_from} onChange={event => setRateForm(prev => ({ ...prev, effective_from: event.target.value }))} />
                  </Field>
                  <Field label="Reference">
                    <input value={rateForm.source_reference} onChange={event => setRateForm(prev => ({ ...prev, source_reference: event.target.value }))} placeholder="FBR reference" />
                  </Field>
                  <div style={{ alignSelf: "end" }}>
                    <button type="button" className="btn btn-sm" onClick={createRate} disabled={busy === "create-rate"}>
                      Add rate
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="table-card">
              <div className="table-card-head"><div className="table-card-head-left"><div className="eyebrow">Asset Classes</div></div></div>
              <div className="h-scroll">
                <table className="data-table">
                  <thead><tr><th>Class</th><th>Code</th><th>Category</th><th>Current rate</th><th>Active</th></tr></thead>
                  <tbody>
                    {classes.length === 0 ? <EmptyRow colSpan={5} message="No depreciation asset classes are configured." /> : classes.map(assetClass => (
                      <tr key={assetClass.id}>
                        <td>{assetClass.name}</td>
                        <td className="mono">{assetClass.code}</td>
                        <td>{assetClass.category_name ?? "-"}</td>
                        <td>{assetClass.current_rate ? `${assetClass.current_rate}%` : "-"}</td>
                        <td><span className={assetClass.is_active ? "pill pill-success" : "pill pill-neutral"}>{assetClass.is_active ? "Active" : "Inactive"}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="table-card">
              <div className="table-card-head"><div className="table-card-head-left"><div className="eyebrow">Rate History</div></div></div>
              <div className="h-scroll">
                <table className="data-table">
                  <thead><tr><th>Class</th><th>Rate</th><th>Effective from</th><th>Effective to</th><th>Reference</th></tr></thead>
                  <tbody>
                    {rates.length === 0 ? <EmptyRow colSpan={5} message="No depreciation rate versions are configured." /> : rates.map(rate => (
                      <tr key={rate.id}>
                        <td>{rate.asset_class_name ?? "-"}</td>
                        <td>{rate.rate}%</td>
                        <td>{formatItemDate(rate.effective_from)}</td>
                        <td>{formatItemDate(rate.effective_to)}</td>
                        <td>{rate.source_reference || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : null}

        {activeTab === "uncapitalized" ? (
          <div style={{ display: "grid", gap: 16 }}>
            {canManage ? (
              <div className="stage-form-row">
                <div className="stage-form-fields stage-form-fields-4">
                  <Field label="Fixed asset">
                    <select value={capitalizationForm.rowKey} onChange={event => setCapitalizationForm(prev => ({ ...prev, rowKey: event.target.value }))}>
                      <option value="">Select uncapitalized asset</option>
                      {uncapitalized.map(row => {
                        const key = `${row.target_type}-${row.instance ?? row.batch}`;
                        return <option key={key} value={key}>{row.item_name} / {row.target_type === "LOT" ? row.batch_number : `Instance #${row.instance}`}</option>;
                      })}
                    </select>
                  </Field>
                  <Field label="Asset class">
                    <select value={capitalizationForm.asset_class} onChange={event => setCapitalizationForm(prev => ({ ...prev, asset_class: event.target.value }))}>
                      <option value="">Auto/default class</option>
                      {classes.map(assetClass => <option key={assetClass.id} value={assetClass.id}>{assetClass.name} ({assetClass.code})</option>)}
                    </select>
                  </Field>
                  <Field label="Cost">
                    <input type="number" min={0} step="0.01" value={capitalizationForm.original_cost} onChange={event => setCapitalizationForm(prev => ({ ...prev, original_cost: event.target.value }))} placeholder={selectedCapitalizationRow ? String(selectedCapitalizationRow.quantity) : "0.00"} />
                  </Field>
                  <Field label="Capitalization date">
                    <input type="date" value={capitalizationForm.capitalization_date} onChange={event => setCapitalizationForm(prev => ({ ...prev, capitalization_date: event.target.value }))} />
                  </Field>
                  <div style={{ alignSelf: "end" }}>
                    <button type="button" className="btn btn-sm" onClick={createCapitalization} disabled={busy === "capitalize"}>
                      Capitalize
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="table-card">
              <div className="table-card-head">
                <div className="table-card-head-left">
                  <div className="eyebrow">Uncapitalized Fixed Assets</div>
                  <div className="table-count"><span className="mono">{uncapitalized.length}</span><span>records</span></div>
                </div>
              </div>
              <div className="h-scroll">
                <table className="data-table">
                  <thead><tr><th>Item</th><th>Type</th><th>Instance / Lot</th><th>Quantity</th></tr></thead>
                  <tbody>
                    {uncapitalized.length === 0 ? <EmptyRow colSpan={4} message="No uncapitalized fixed assets were found." /> : uncapitalized.map(row => (
                      <tr key={`${row.target_type}-${row.instance ?? row.batch}`}>
                        <td><div className="login-cell"><div>{row.item_name}</div><div className="login-cell-sub mono">{row.item_code}</div></div></td>
                        <td><span className="chip">{row.target_type === "LOT" ? "Asset Lot" : "Instance"}</span></td>
                        <td>{row.batch_number ?? (row.instance ? `Instance #${row.instance}` : "-")}</td>
                        <td>{formatQuantity(row.quantity)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : null}

        {activeTab === "adjustments" ? (
          <div style={{ display: "grid", gap: 16 }}>
            {canManage ? (
              <div className="stage-form-row">
                <div className="stage-form-fields stage-form-fields-4">
                  <Field label="Asset">
                    <select value={adjustmentForm.asset} onChange={event => setAdjustmentForm(prev => ({ ...prev, asset: event.target.value }))}>
                      <option value="">Select asset</option>
                      {assets.map(asset => <option key={asset.id} value={asset.id}>{asset.asset_number} / {asset.item_name}</option>)}
                    </select>
                  </Field>
                  <Field label="Type">
                    <select value={adjustmentForm.adjustment_type} onChange={event => setAdjustmentForm(prev => ({ ...prev, adjustment_type: event.target.value }))}>
                      {ADJUSTMENT_TYPES.map(type => <option key={type} value={type}>{formatItemLabel(type)}</option>)}
                    </select>
                  </Field>
                  <Field label="Effective date">
                    <input type="date" value={adjustmentForm.effective_date} onChange={event => setAdjustmentForm(prev => ({ ...prev, effective_date: event.target.value }))} />
                  </Field>
                  <Field label="Amount">
                    <input type="number" step="0.01" value={adjustmentForm.amount} onChange={event => setAdjustmentForm(prev => ({ ...prev, amount: event.target.value }))} placeholder="-10000.00" />
                  </Field>
                  <Field label="Quantity delta">
                    <input type="number" step={1} value={adjustmentForm.quantity_delta} onChange={event => setAdjustmentForm(prev => ({ ...prev, quantity_delta: event.target.value }))} />
                  </Field>
                  <Field label="Reason">
                    <input value={adjustmentForm.reason} onChange={event => setAdjustmentForm(prev => ({ ...prev, reason: event.target.value }))} placeholder="Reason" />
                  </Field>
                  <div style={{ alignSelf: "end" }}>
                    <button type="button" className="btn btn-sm" onClick={createAdjustment} disabled={busy === "adjust"}>
                      Add adjustment
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="table-card">
              <div className="table-card-head"><div className="table-card-head-left"><div className="eyebrow">Adjustments / Disposals</div></div></div>
              <div className="h-scroll">
                <table className="data-table">
                  <thead><tr><th>Asset</th><th>Item</th><th>Type</th><th>Date</th><th>Amount</th><th>Qty</th><th>Reason</th></tr></thead>
                  <tbody>
                    {adjustments.length === 0 ? <EmptyRow colSpan={7} message="No asset value adjustments have been recorded." /> : adjustments.map(adjustment => (
                      <tr key={adjustment.id}>
                        <td className="mono">{adjustment.asset_number ?? adjustment.asset}</td>
                        <td>{adjustment.item_name ?? "-"}</td>
                        <td><span className="chip">{formatItemLabel(adjustment.adjustment_type)}</span></td>
                        <td>{formatItemDate(adjustment.effective_date)}</td>
                        <td>{formatMoney(adjustment.amount)}</td>
                        <td>{adjustment.quantity_delta}</td>
                        <td>{adjustment.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
