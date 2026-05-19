"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ListPagination } from "@/components/ListPagination";
import { ThemedSelect } from "@/components/ThemedSelect";
import { Topbar } from "@/components/Topbar";
import { useCan, useCapabilities } from "@/contexts/CapabilitiesContext";
import { apiFetch, type Page } from "@/lib/api";
import { useClientPagination } from "@/lib/listPagination";
import { formatItemDate, formatItemLabel, formatQuantity, toNumber, type DepreciationSummary } from "@/lib/itemUi";

type DepreciationTab = "setup" | "capitalize" | "register" | "runs" | "adjustments";
type Density = "compact" | "balanced" | "comfortable";
type SetupViewMode = "grid" | "list";

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
  category?: number | null;
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
  depreciation_category?: number | null;
  depreciation_category_name?: string | null;
  depreciation_category_code?: string | null;
  depreciation_setup?: number | null;
  depreciation_setup_name?: string | null;
  depreciation_setup_code?: string | null;
  depreciation_rate?: string | null;
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

interface InventoryCategory {
  id: number;
  name: string;
  code: string;
  parent_category: number | null;
  category_type?: string | null;
  resolved_category_type?: string | null;
  is_active: boolean;
}

interface DepreciationSetupRow {
  key: string;
  categoryId: number | null;
  categoryName: string;
  categoryCode: string;
  assetClass: DepreciationAssetClass | null;
  currentRate: DepreciationRate | null;
  rateCount: number;
}

const TABS: Array<{ key: DepreciationTab; label: string }> = [
  { key: "setup", label: "Setup" },
  { key: "register", label: "Register" },
  { key: "runs", label: "Year-End Runs" },
];

const DEPRECIATION_SETUP_PAGE_SIZE = 10;
const DEPRECIATION_CAPITALIZE_PAGE_SIZE = 10;
const DEPRECIATION_REGISTER_PAGE_SIZE = 12;
const DEPRECIATION_RUNS_PAGE_SIZE = 10;
const DEPRECIATION_ADJUSTMENTS_PAGE_SIZE = 10;

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

function Avatar({ name, tone = 0, size = 32 }: { name: string; tone?: number; size?: number }) {
  const initials = name.split(" ").map(part => part[0]).slice(0, 2).join("").toUpperCase();
  const bg = tone === 0
    ? "linear-gradient(135deg, color-mix(in oklch, var(--primary) 82%, white), var(--primary))"
    : tone === 1
    ? "linear-gradient(135deg, #3b4052, #0e1116)"
    : "linear-gradient(135deg, #8a7b60, #4d442f)";
  return (
    <div className="avatar" style={{ width: size, height: size, background: bg, fontSize: size <= 30 ? 11 : 12 }}>
      {initials}
    </div>
  );
}

function DensityToggle({ density, setDensity }: { density: Density; setDensity: (density: Density) => void }) {
  return (
    <div className="seg">
      {(["compact", "balanced", "comfortable"] as const).map(option => (
        <button type="button" key={option} className={"seg-btn" + (density === option ? " active" : "")} onClick={() => setDensity(option)}>
          {option.charAt(0).toUpperCase() + option.slice(1)}
        </button>
      ))}
    </div>
  );
}

function ViewModeToggle({ value, onChange }: { value: SetupViewMode; onChange: (value: SetupViewMode) => void }) {
  return (
    <div className="seg" aria-label="Setup view mode">
      <button type="button" className={"seg-btn icon-only" + (value === "grid" ? " active" : "")} onClick={() => onChange("grid")} aria-label="Grid view" title="Grid">
        <Icon d={<><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></>} size={14} />
      </button>
      <button type="button" className={"seg-btn icon-only" + (value === "list" ? " active" : "")} onClick={() => onChange("list")} aria-label="List view" title="List">
        <Icon d={<><path d="M8 6h12M8 12h12M8 18h12" /><path d="M4 6h.01M4 12h.01M4 18h.01" /></>} size={14} />
      </button>
    </div>
  );
}

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

function SetupStatusPill({ row }: { row: DepreciationSetupRow }) {
  if (!row.assetClass) return <span className="pill pill-warning">Needs setup</span>;
  if (!row.assetClass.is_active) return <span className="pill pill-neutral">Inactive</span>;
  if (row.currentRate) return <span className="pill pill-success">Active</span>;
  return <span className="pill pill-warning">No rate</span>;
}

function depreciationProfileCode(category: InventoryCategory) {
  const rawCode = category.code || `CAT-${category.id}`;
  return `DEP-${rawCode}`.toUpperCase().slice(0, 50);
}

function todayIsoDate() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isRateActiveOn(rate: DepreciationRate, isoDate: string) {
  return rate.effective_from <= isoDate && (!rate.effective_to || rate.effective_to >= isoDate);
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

function ModalShell({
  eyebrow,
  title,
  children,
  footer,
  onClose,
  maxWidth = "min(760px, calc(100vw - 32px))",
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
  footer: ReactNode;
  onClose: () => void;
  maxWidth?: string;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop">
      <div className="modal modal-lg" role="dialog" aria-modal="true" aria-labelledby="depreciation-modal-title" style={{ maxWidth }}>
        <header className="modal-head">
          <div>
            <div className="eyebrow">{eyebrow}</div>
            <h2 id="depreciation-modal-title">{title}</h2>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            <Icon d="M6 6l12 12M6 18L18 6" size={14} />
          </button>
        </header>
        <div className="modal-body">
          <div style={{ display: "grid", gap: 16, padding: "18px 24px 24px" }}>
            {children}
          </div>
        </div>
        <footer className="modal-foot">
          {footer}
        </footer>
      </div>
    </div>
  );
}

export default function DepreciationPage() {
  const router = useRouter();
  const { isLoading: capsLoading } = useCapabilities();
  const canView = useCan("depreciation");
  const canManage = useCan("depreciation", "manage");
  const canFull = useCan("depreciation", "full");
  const canViewCategories = useCan("categories");
  const [density, setDensity] = useState<Density>("balanced");
  const [setupViewMode, setSetupViewMode] = useState<SetupViewMode>("grid");
  const [activeTab, setActiveTab] = useState<DepreciationTab>("setup");
  const [assets, setAssets] = useState<FixedAssetEntry[]>([]);
  const [runs, setRuns] = useState<DepreciationRun[]>([]);
  const [classes, setClasses] = useState<DepreciationAssetClass[]>([]);
  const [rates, setRates] = useState<DepreciationRate[]>([]);
  const [categories, setCategories] = useState<InventoryCategory[]>([]);
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
  const [rateModalOpen, setRateModalOpen] = useState(false);
  const [capitalizationModalOpen, setCapitalizationModalOpen] = useState(false);
  const [adjustmentModalOpen, setAdjustmentModalOpen] = useState(false);
  const [historyClassId, setHistoryClassId] = useState<number | null>(null);
  const [historyFilters, setHistoryFilters] = useState({ from: "", to: "" });
  const [rateForm, setRateForm] = useState({ category: "", rate: "", effective_from: "", effective_to: "", source_reference: "" });
  const [capitalizationForm, setCapitalizationForm] = useState({ rowKey: "", original_cost: "", capitalization_date: "" });
  const [adjustmentForm, setAdjustmentForm] = useState({ asset: "", adjustment_type: "DISPOSAL", effective_date: "", amount: "", quantity_delta: "0", reason: "" });

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [assetData, runData, classData, rateData, categoryData, uncapitalizedData, adjustmentData] = await Promise.all([
        apiFetch<Page<FixedAssetEntry> | FixedAssetEntry[]>("/api/inventory/depreciation/assets/?page_size=500"),
        apiFetch<Page<DepreciationRun> | DepreciationRun[]>("/api/inventory/depreciation/runs/?page_size=200"),
        apiFetch<Page<DepreciationAssetClass> | DepreciationAssetClass[]>("/api/inventory/depreciation/asset-classes/?page_size=500"),
        apiFetch<Page<DepreciationRate> | DepreciationRate[]>("/api/inventory/depreciation/rates/?page_size=500"),
        canViewCategories
          ? apiFetch<Page<InventoryCategory> | InventoryCategory[]>("/api/inventory/categories/?page_size=500").catch(() => [] as InventoryCategory[])
          : Promise.resolve([] as InventoryCategory[]),
        apiFetch<UncapitalizedAsset[]>("/api/inventory/depreciation/assets/uncapitalized/"),
        apiFetch<Page<AssetValueAdjustment> | AssetValueAdjustment[]>("/api/inventory/depreciation/adjustments/?page_size=500"),
      ]);
      setAssets(normalizeList(assetData));
      setRuns(normalizeList(runData));
      setClasses(normalizeList(classData));
      setRates(normalizeList(rateData));
      setCategories(normalizeList(categoryData));
      setUncapitalized(uncapitalizedData);
      setAdjustments(normalizeList(adjustmentData));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load depreciation data.");
    } finally {
      setIsLoading(false);
    }
  }, [canViewCategories]);

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

  const fixedAssetCategories = useMemo(() => categories
    .filter(category => category.parent_category === null)
    .filter(category => (category.resolved_category_type ?? category.category_type) === "FIXED_ASSET")
    .filter(category => category.is_active)
    .sort((a, b) => a.name.localeCompare(b.name)), [categories]);

  const configuredCategoryIds = useMemo(() => new Set(
    classes
      .map(assetClass => assetClass.category)
      .filter((categoryId): categoryId is number => typeof categoryId === "number"),
  ), [classes]);

  const today = useMemo(() => todayIsoDate(), []);

  const ratesByClass = useMemo(() => {
    const grouped = new Map<number, DepreciationRate[]>();
    rates.forEach(rate => {
      const rows = grouped.get(rate.asset_class) ?? [];
      rows.push(rate);
      grouped.set(rate.asset_class, rows);
    });
    grouped.forEach(rows => rows.sort((a, b) => b.effective_from.localeCompare(a.effective_from) || b.id - a.id));
    return grouped;
  }, [rates]);

  const depreciationSetupRows = useMemo(() => {
    return fixedAssetCategories.map(category => {
      const assetClass = classes.find(candidate => candidate.category === category.id) ?? null;
      const classRates = assetClass ? ratesByClass.get(assetClass.id) ?? [] : [];
      const currentRate = classRates.find(rate => isRateActiveOn(rate, today)) ?? classRates[0] ?? null;
      return {
        key: `category-${category.id}`,
        categoryId: category.id,
        categoryName: category.name,
        categoryCode: category.code,
        assetClass,
        currentRate,
        rateCount: classRates.length,
      };
    });
  }, [classes, fixedAssetCategories, ratesByClass, today]);

  const historyAssetClass = useMemo(
    () => classes.find(assetClass => assetClass.id === historyClassId) ?? null,
    [classes, historyClassId],
  );

  const historyRates = useMemo(() => {
    if (!historyClassId) return [];
    const rows = ratesByClass.get(historyClassId) ?? [];
    return rows.filter(rate => {
      const startsBeforeFilterEnd = !historyFilters.to || rate.effective_from <= historyFilters.to;
      const endsAfterFilterStart = !historyFilters.from || !rate.effective_to || rate.effective_to >= historyFilters.from;
      return startsBeforeFilterEnd && endsAfterFilterStart;
    });
  }, [historyClassId, historyFilters.from, historyFilters.to, ratesByClass]);

  const openRateModal = (categoryId?: number | null) => {
    setError(null);
    setRateForm({ category: categoryId ? String(categoryId) : "", rate: "", effective_from: "", effective_to: "", source_reference: "" });
    setRateModalOpen(true);
  };

  const openCapitalizationModal = (row?: UncapitalizedAsset) => {
    setError(null);
    setCapitalizationForm({
      rowKey: row ? `${row.target_type}-${row.instance ?? row.batch}` : "",
      original_cost: "",
      capitalization_date: "",
    });
    setCapitalizationModalOpen(true);
  };

  const openAdjustmentModal = (assetId?: number) => {
    setError(null);
    setAdjustmentForm({ asset: assetId ? String(assetId) : "", adjustment_type: "DISPOSAL", effective_date: "", amount: "", quantity_delta: "0", reason: "" });
    setAdjustmentModalOpen(true);
  };

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

  const closePreviewModal = () => {
    setPreviewRunId(null);
    setPreviewRows([]);
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

  const createRate = async () => {
    if (!canManage || !rateForm.category || !rateForm.rate || !rateForm.effective_from) return;
    const category = fixedAssetCategories.find(row => row.id === Number(rateForm.category));
    if (!category) return;
    setBusy("create-rate");
    setError(null);
    try {
      const existingSetup = classes.find(assetClass => assetClass.category === category.id);
      const setup = existingSetup ?? await apiFetch<DepreciationAssetClass>("/api/inventory/depreciation/asset-classes/", {
        method: "POST",
        body: JSON.stringify({
          name: category.name,
          code: depreciationProfileCode(category),
          category: category.id,
        }),
      });
      await apiFetch<DepreciationRate>("/api/inventory/depreciation/rates/", {
        method: "POST",
        body: JSON.stringify({
          asset_class: setup.id,
          rate: rateForm.rate,
          effective_from: rateForm.effective_from,
          ...(rateForm.effective_to ? { effective_to: rateForm.effective_to } : {}),
          source_reference: rateForm.source_reference.trim(),
        }),
      });
      setRateForm({ category: "", rate: "", effective_from: "", effective_to: "", source_reference: "" });
      setRateModalOpen(false);
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
          original_quantity: row.quantity,
          remaining_quantity: row.quantity,
          original_cost: capitalizationForm.original_cost,
          capitalization_date: capitalizationForm.capitalization_date,
          depreciation_start_date: capitalizationForm.capitalization_date,
        }),
      });
      setCapitalizationForm({ rowKey: "", original_cost: "", capitalization_date: "" });
      setCapitalizationModalOpen(false);
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
      setAdjustmentModalOpen(false);
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

  const {
    page: setupPage,
    totalPages: setupTotalPages,
    pageItems: pagedSetupRows,
    pageStart: setupPageStart,
    pageEnd: setupPageEnd,
    setPage: setSetupPage,
  } = useClientPagination(depreciationSetupRows, DEPRECIATION_SETUP_PAGE_SIZE);

  const {
    page: capitalizePage,
    totalPages: capitalizeTotalPages,
    pageItems: pagedUncapitalized,
    pageStart: capitalizePageStart,
    pageEnd: capitalizePageEnd,
    setPage: setCapitalizePage,
  } = useClientPagination(uncapitalized, DEPRECIATION_CAPITALIZE_PAGE_SIZE);

  const {
    page: registerPage,
    totalPages: registerTotalPages,
    pageItems: pagedAssets,
    pageStart: registerPageStart,
    pageEnd: registerPageEnd,
    setPage: setRegisterPage,
  } = useClientPagination(filteredAssets, DEPRECIATION_REGISTER_PAGE_SIZE, [search]);

  const {
    page: runsPage,
    totalPages: runsTotalPages,
    pageItems: pagedRuns,
    pageStart: runsPageStart,
    pageEnd: runsPageEnd,
    setPage: setRunsPage,
  } = useClientPagination(runs, DEPRECIATION_RUNS_PAGE_SIZE);

  const {
    page: adjustmentsPage,
    totalPages: adjustmentsTotalPages,
    pageItems: pagedAdjustments,
    pageStart: adjustmentsPageStart,
    pageEnd: adjustmentsPageEnd,
    setPage: setAdjustmentsPage,
  } = useClientPagination(adjustments, DEPRECIATION_ADJUSTMENTS_PAGE_SIZE);

  const previewRowsToShow = previewRows.slice(0, 10);
  const previewRunRecord = runs.find(run => run.id === previewRunId) ?? null;

  return (
    <div data-density={density}>
      <Topbar breadcrumb={["Inventory", "Depreciation"]} />
      <div className="page">
        {error ? <Alert onDismiss={() => setError(null)}>{error}</Alert> : null}

        <div className="page-head">
          <div className="page-title-group">
            <div className="eyebrow">Finance</div>
            <h1>Depreciation</h1>
            <div className="page-sub">Finance setup, capitalization queue, fixed asset register, yearly runs, and adjustments.</div>
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
            <div className="seg">
              {TABS.map(tab => (
                <button key={tab.key} type="button" className={"seg-btn" + (activeTab === tab.key ? " active" : "")} onClick={() => setActiveTab(tab.key)}>
                  {tab.label}
                </button>
              ))}
            </div>
            {activeTab === "setup" ? (
              <div className="table-count"><span className="mono">{depreciationSetupRows.length}</span><span>categories</span></div>
            ) : null}
          </div>
          <div className="filter-bar-right">
            <DensityToggle density={density} setDensity={setDensity} />
            {activeTab === "setup" ? (
              <>
                <ViewModeToggle value={setupViewMode} onChange={setSetupViewMode} />
                {canViewCategories ? <Link href="/categories" className="btn btn-sm btn-ghost">Open categories</Link> : null}
                {canManage ? (
                  <button type="button" className="btn btn-sm btn-primary" onClick={() => openRateModal()}>
                    <Icon d="M12 5v14M5 12h14" size={14} />
                    Add rate
                  </button>
                ) : null}
              </>
            ) : null}
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
                      ) : pagedAssets.map(asset => (
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
              <ListPagination
                summary={filteredAssets.length === 0 ? "Showing 0 fixed asset register entries" : `Showing ${registerPageStart}-${registerPageEnd} of ${filteredAssets.length} fixed asset register entries`}
                page={registerPage}
                totalPages={registerTotalPages}
                onPrev={() => setRegisterPage(current => Math.max(1, current - 1))}
                onNext={() => setRegisterPage(current => Math.min(registerTotalPages, current + 1))}
              />
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
                  <div className="eyebrow">Year-End Depreciation Runs</div>
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
                      <EmptyRow colSpan={5} message="No year-end depreciation runs have been created." />
                    ) : pagedRuns.map(run => (
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
              <ListPagination
                summary={runs.length === 0 ? "Showing 0 annual runs" : `Showing ${runsPageStart}-${runsPageEnd} of ${runs.length} annual runs`}
                page={runsPage}
                totalPages={runsTotalPages}
                onPrev={() => setRunsPage(current => Math.max(1, current - 1))}
                onNext={() => setRunsPage(current => Math.min(runsTotalPages, current + 1))}
              />
            </div>

          </div>
        ) : null}

        {activeTab === "setup" ? (
          <div style={{ display: "grid", gap: 16 }}>
            {setupViewMode === "grid" ? (
              <>
                {depreciationSetupRows.length === 0 ? (
                  <div className="table-card"><div style={{ padding: 24, textAlign: "center", color: "var(--muted)" }}>No fixed asset categories are available for depreciation setup.</div></div>
                ) : (
                <div className="users-grid">
                  {pagedSetupRows.map(row => (
                    <div className="user-card" key={row.key}>
                      <div className="user-card-head">
                        <Avatar name={row.categoryName} size={44} tone={row.assetClass ? 0 : 2} />
                        <SetupStatusPill row={row} />
                      </div>
                      <div className="user-card-name">{row.categoryName}</div>
                      <div className="user-card-meta mono">{row.categoryCode}</div>
                      <div className="user-card-eid mono">{row.assetClass?.code ?? "Not configured"}</div>
                      <div className="user-card-section">
                        <div className="eyebrow">Depreciation setup</div>
                        <div className="login-cell">
                          <div>{row.assetClass?.name ?? "Not configured"}</div>
                          <div className="login-cell-sub mono">{row.assetClass?.code ?? row.categoryCode}</div>
                        </div>
                      </div>
                      <div className="user-card-section">
                        <div className="eyebrow">Current rate</div>
                        <div style={{ fontSize: 13, color: "var(--text-1)" }}>{row.currentRate ? `${row.currentRate.rate}%` : "-"}</div>
                      </div>
                      <div className="user-card-section">
                        <div className="eyebrow">Effective period</div>
                        <div style={{ fontSize: 13, color: "var(--text-1)" }}>
                          {row.currentRate ? `${formatItemDate(row.currentRate.effective_from)} to ${row.currentRate.effective_to ? formatItemDate(row.currentRate.effective_to) : "Open"}` : "-"}
                        </div>
                      </div>
                      <div className="user-card-foot">
                        <div>
                          <div className="eyebrow">Rate history</div>
                          <div className="user-card-last mono">{row.rateCount} rate{row.rateCount === 1 ? "" : "s"}</div>
                        </div>
                        <div className="row-actions">
                          {row.assetClass ? (
                            <button type="button" className="btn btn-xs btn-ghost row-action" onClick={() => { setHistoryClassId(row.assetClass?.id ?? null); setHistoryFilters({ from: "", to: "" }); }}>
                              <Icon d="M3 12a9 9 0 109-9M3 3v6h6M12 7v5l3 2" size={13} />
                              <span className="ra-label">History</span>
                            </button>
                          ) : null}
                          {canManage && row.categoryId ? (
                            <button type="button" className="btn btn-xs btn-ghost row-action" onClick={() => openRateModal(row.categoryId)}>
                              <Icon d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" size={13} />
                              <span className="ra-label">{row.assetClass ? "Update rate" : "Set rate"}</span>
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                )}
                {depreciationSetupRows.length > 0 ? (
                  <ListPagination
                    summary={`Showing ${setupPageStart}-${setupPageEnd} of ${depreciationSetupRows.length} setup rows`}
                    page={setupPage}
                    totalPages={setupTotalPages}
                    onPrev={() => setSetupPage(current => Math.max(1, current - 1))}
                    onNext={() => setSetupPage(current => Math.min(setupTotalPages, current + 1))}
                    standalone
                  />
                ) : null}
              </>
            ) : (
              <div className="table-card">
                <div className="h-scroll">
                  <table className="data-table">
                    <thead><tr><th>Fixed asset category</th><th>Current rate</th><th>Effective period</th><th>Status</th><th>Actions</th></tr></thead>
                    <tbody>
                      {depreciationSetupRows.length === 0 ? <EmptyRow colSpan={5} message="No fixed asset categories are available for depreciation setup." /> : pagedSetupRows.map(row => (
                        <tr key={row.key}>
                          <td style={{ textAlign: "left" }}>
                            <div className="login-cell" style={{ textAlign: "left" }}>
                              <div>{row.categoryName}</div>
                              <div className="login-cell-sub mono">{row.categoryCode}</div>
                            </div>
                          </td>
                          <td>{row.currentRate ? `${row.currentRate.rate}%` : "-"}</td>
                          <td>
                            {row.currentRate ? (
                              <span>{formatItemDate(row.currentRate.effective_from)} to {row.currentRate.effective_to ? formatItemDate(row.currentRate.effective_to) : "Open"}</span>
                            ) : "-"}
                          </td>
                          <td>
                            {!row.assetClass ? <span className="pill pill-warning">Needs setup</span> : !row.assetClass.is_active ? <span className="pill pill-neutral">Inactive</span> : row.currentRate ? <span className="pill pill-success">Active</span> : <span className="pill pill-warning">No rate</span>}
                          </td>
                          <td className="col-actions">
                            {row.assetClass ? (
                              <button type="button" className="btn btn-xs btn-ghost row-action" onClick={() => { setHistoryClassId(row.assetClass?.id ?? null); setHistoryFilters({ from: "", to: "" }); }}>
                                History
                              </button>
                            ) : null}
                            {canManage && row.categoryId ? (
                              <button type="button" className="btn btn-xs row-action" onClick={() => openRateModal(row.categoryId)}>
                                {row.assetClass ? "Update rate" : "Set rate"}
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <ListPagination
                  summary={depreciationSetupRows.length === 0 ? "Showing 0 setup rows" : `Showing ${setupPageStart}-${setupPageEnd} of ${depreciationSetupRows.length} setup rows`}
                  page={setupPage}
                  totalPages={setupTotalPages}
                  onPrev={() => setSetupPage(current => Math.max(1, current - 1))}
                  onNext={() => setSetupPage(current => Math.min(setupTotalPages, current + 1))}
                />
              </div>
            )}
          </div>
        ) : null}

        {activeTab === "capitalize" ? (
          <div style={{ display: "grid", gap: 16 }}>
            <div className="table-card">
              <div className="table-card-head">
                <div className="table-card-head-left">
                  <div className="eyebrow">Fixed Assets To Capitalize</div>
                  <div className="table-count"><span className="mono">{uncapitalized.length}</span><span>records</span></div>
                </div>
                {canManage ? (
                  <button type="button" className="btn btn-sm btn-primary" onClick={() => openCapitalizationModal()} disabled={uncapitalized.length === 0}>
                    <Icon d="M12 5v14M5 12h14" size={14} />
                    Capitalize asset
                  </button>
                ) : null}
              </div>
              <div className="h-scroll">
                <table className="data-table">
                  <thead><tr><th>Item</th><th>Type</th><th>Instance / Lot</th><th>Quantity</th><th>Setup</th><th>Actions</th></tr></thead>
                  <tbody>
                    {uncapitalized.length === 0 ? <EmptyRow colSpan={6} message="No fixed assets are waiting for capitalization." /> : pagedUncapitalized.map(row => (
                      <tr key={`${row.target_type}-${row.instance ?? row.batch}`}>
                        <td style={{ textAlign: "left" }}><div className="login-cell" style={{ textAlign: "left" }}><div>{row.item_name}</div><div className="login-cell-sub mono">{row.item_code}</div></div></td>
                        <td><span className="chip">{row.target_type === "LOT" ? "Asset Lot" : "Instance"}</span></td>
                        <td>{row.batch_number ?? (row.instance ? `Instance #${row.instance}` : "-")}</td>
                        <td>{formatQuantity(row.quantity)}</td>
                        <td>{row.depreciation_setup_name ? `${row.depreciation_setup_name} / ${row.depreciation_rate ? `${row.depreciation_rate}%` : "No rate"}` : "Not configured"}</td>
                        <td className="col-actions">
                          {canManage ? (
                            <button type="button" className="btn btn-xs row-action" onClick={() => openCapitalizationModal(row)}>
                              Capitalize
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ListPagination
                summary={uncapitalized.length === 0 ? "Showing 0 assets waiting for capitalization" : `Showing ${capitalizePageStart}-${capitalizePageEnd} of ${uncapitalized.length} assets waiting for capitalization`}
                page={capitalizePage}
                totalPages={capitalizeTotalPages}
                onPrev={() => setCapitalizePage(current => Math.max(1, current - 1))}
                onNext={() => setCapitalizePage(current => Math.min(capitalizeTotalPages, current + 1))}
              />
            </div>
          </div>
        ) : null}

        {activeTab === "adjustments" ? (
          <div style={{ display: "grid", gap: 16 }}>
            <div className="table-card">
              <div className="table-card-head">
                <div className="table-card-head-left">
                  <div className="eyebrow">Adjustments / Disposals</div>
                  <div className="table-count"><span className="mono">{adjustments.length}</span><span>records</span></div>
                </div>
                {canManage ? (
                  <button type="button" className="btn btn-sm btn-primary" onClick={() => openAdjustmentModal()} disabled={assets.length === 0}>
                    <Icon d="M12 5v14M5 12h14" size={14} />
                    Add adjustment
                  </button>
                ) : null}
              </div>
              <div className="h-scroll">
                <table className="data-table">
                  <thead><tr><th>Asset</th><th>Item</th><th>Type</th><th>Date</th><th>Amount</th><th>Qty</th><th>Reason</th></tr></thead>
                  <tbody>
                    {adjustments.length === 0 ? <EmptyRow colSpan={7} message="No asset value adjustments have been recorded." /> : pagedAdjustments.map(adjustment => (
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
              <ListPagination
                summary={adjustments.length === 0 ? "Showing 0 adjustments" : `Showing ${adjustmentsPageStart}-${adjustmentsPageEnd} of ${adjustments.length} adjustments`}
                page={adjustmentsPage}
                totalPages={adjustmentsTotalPages}
                onPrev={() => setAdjustmentsPage(current => Math.max(1, current - 1))}
                onNext={() => setAdjustmentsPage(current => Math.min(adjustmentsTotalPages, current + 1))}
              />
            </div>
          </div>
        ) : null}

        {previewRunId ? (
          <ModalShell
            eyebrow="Run Preview"
            title={previewRunRecord?.fiscal_year_label ?? (previewRunRecord ? `${previewRunRecord.fiscal_year_start}-${String(previewRunRecord.fiscal_year_start + 1).slice(-2)}` : "Depreciation Run")}
            maxWidth="min(980px, calc(100vw - 32px))"
            onClose={closePreviewModal}
            footer={(
              <>
                <div className="modal-foot-meta mono">
                  Showing {previewRowsToShow.length} of {previewRows.length} pending entr{previewRows.length === 1 ? "y" : "ies"}.
                </div>
                <div className="modal-foot-actions">
                  <button type="button" className="btn btn-md" onClick={closePreviewModal}>Close</button>
                </div>
              </>
            )}
          >
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
                  ) : previewRowsToShow.map((row, index) => (
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
          </ModalShell>
        ) : null}

        {rateModalOpen ? (
          <ModalShell
            eyebrow="Depreciation Setup"
            title="Add / Update Rate"
            onClose={() => setRateModalOpen(false)}
            footer={(
              <>
                <div className="modal-foot-meta mono">
                  Previous active rates close automatically one day before the new effective-from date.
                </div>
                <div className="modal-foot-actions">
                  <button type="button" className="btn btn-md" onClick={() => setRateModalOpen(false)} disabled={busy === "create-rate"}>Cancel</button>
                  <button type="button" className="btn btn-md btn-primary" onClick={createRate} disabled={busy === "create-rate" || !rateForm.category || !rateForm.rate || !rateForm.effective_from}>
                    {busy === "create-rate" ? "Saving..." : "Save rate"}
                  </button>
                </div>
              </>
            )}
          >
            <div className="stage-form-fields stage-form-fields-2">
              <Field label="Fixed asset category">
                <ThemedSelect
                  value={rateForm.category}
                  onChange={value => setRateForm(prev => ({ ...prev, category: value }))}
                  placeholder="Select category"
                  ariaLabel="Fixed asset category"
                  options={fixedAssetCategories.map(category => ({
                    value: String(category.id),
                    label: category.name,
                    meta: `${category.code}${configuredCategoryIds.has(category.id) ? "" : " - needs setup"}`,
                  }))}
                />
              </Field>
              <Field label="Rate %">
                <input type="number" min={0} step="0.01" value={rateForm.rate} onChange={event => setRateForm(prev => ({ ...prev, rate: event.target.value }))} />
              </Field>
              <Field label="Effective from">
                <input type="date" value={rateForm.effective_from} onChange={event => setRateForm(prev => ({ ...prev, effective_from: event.target.value }))} />
              </Field>
              <Field label="Effective to (optional)">
                <input type="date" value={rateForm.effective_to} onChange={event => setRateForm(prev => ({ ...prev, effective_to: event.target.value }))} />
              </Field>
              <Field label="Reference">
                <input value={rateForm.source_reference} onChange={event => setRateForm(prev => ({ ...prev, source_reference: event.target.value }))} placeholder="FBR reference" />
              </Field>
              <div style={{ alignSelf: "end", display: "flex", gap: 8, flexWrap: "wrap" }}>
                {canViewCategories ? <Link href="/categories" className="btn btn-sm btn-ghost">Open categories</Link> : null}
              </div>
            </div>
            <div className="stage-form-helper">
              Leave effective-to blank when this rate should stay active until finance adds a newer rate.
            </div>
          </ModalShell>
        ) : null}

        {historyAssetClass ? (
          <ModalShell
            eyebrow="Rate History"
            title={historyAssetClass.name}
            maxWidth="min(980px, calc(100vw - 32px))"
            onClose={() => setHistoryClassId(null)}
            footer={(
              <>
                <div className="modal-foot-meta mono">{historyRates.length} version{historyRates.length === 1 ? "" : "s"} shown</div>
                <div className="modal-foot-actions">
                  <button type="button" className="btn btn-md" onClick={() => setHistoryClassId(null)}>Close</button>
                </div>
              </>
            )}
          >
            <div className="stage-form-fields stage-form-fields-3">
              <Field label="From">
                <input type="date" value={historyFilters.from} onChange={event => setHistoryFilters(prev => ({ ...prev, from: event.target.value }))} />
              </Field>
              <Field label="To">
                <input type="date" value={historyFilters.to} onChange={event => setHistoryFilters(prev => ({ ...prev, to: event.target.value }))} />
              </Field>
              <div style={{ alignSelf: "end" }}>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setHistoryFilters({ from: "", to: "" })}>
                  Clear filters
                </button>
              </div>
            </div>
            <div className="h-scroll">
              <table className="data-table">
                <thead><tr><th>Rate</th><th>Effective from</th><th>Effective to</th><th>Status today</th><th>Reference</th></tr></thead>
                <tbody>
                  {historyRates.length === 0 ? <EmptyRow colSpan={5} message="No rate versions match the selected dates." /> : historyRates.map(rate => (
                    <tr key={rate.id}>
                      <td>{rate.rate}%</td>
                      <td>{formatItemDate(rate.effective_from)}</td>
                      <td>{rate.effective_to ? formatItemDate(rate.effective_to) : "Open"}</td>
                      <td><span className={isRateActiveOn(rate, today) ? "pill pill-success" : "pill pill-neutral"}>{isRateActiveOn(rate, today) ? "Active" : "Historical"}</span></td>
                      <td>{rate.source_reference || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ModalShell>
        ) : null}

        {capitalizationModalOpen ? (
          <ModalShell
            eyebrow="Fixed Asset Register"
            title="Capitalize Asset"
            onClose={() => setCapitalizationModalOpen(false)}
            footer={(
              <>
                <div className="modal-foot-meta mono">
                  Category and depreciation setup are read from the selected asset.
                </div>
                <div className="modal-foot-actions">
                  <button type="button" className="btn btn-md" onClick={() => setCapitalizationModalOpen(false)} disabled={busy === "capitalize"}>Cancel</button>
                  <button type="button" className="btn btn-md btn-primary" onClick={createCapitalization} disabled={busy === "capitalize" || !capitalizationForm.rowKey || !capitalizationForm.original_cost || !capitalizationForm.capitalization_date}>
                    {busy === "capitalize" ? "Saving..." : "Capitalize"}
                  </button>
                </div>
              </>
            )}
          >
            <div className="stage-form-fields stage-form-fields-3">
              <Field label="Fixed asset">
                <ThemedSelect
                  value={capitalizationForm.rowKey}
                  onChange={value => setCapitalizationForm(prev => ({ ...prev, rowKey: value }))}
                  placeholder="Select asset to capitalize"
                  ariaLabel="Fixed asset"
                  options={uncapitalized.map(row => {
                    const key = `${row.target_type}-${row.instance ?? row.batch}`;
                    return {
                      value: key,
                      label: row.item_name || "Fixed asset",
                      meta: row.target_type === "LOT" ? row.batch_number ?? "" : `Instance #${row.instance}`,
                    };
                  })}
                />
              </Field>
              <Field label="Cost">
                <input type="number" min={0} step="0.01" value={capitalizationForm.original_cost} onChange={event => setCapitalizationForm(prev => ({ ...prev, original_cost: event.target.value }))} placeholder="0.00" />
              </Field>
              <Field label="Capitalization date">
                <input type="date" value={capitalizationForm.capitalization_date} onChange={event => setCapitalizationForm(prev => ({ ...prev, capitalization_date: event.target.value }))} />
              </Field>
            </div>
            {selectedCapitalizationRow ? (
              <div className="detail-kv-grid">
                <Metric
                  label="Fixed asset category"
                  value={selectedCapitalizationRow.depreciation_category_name ?? "Not resolved"}
                  sub={selectedCapitalizationRow.depreciation_category_code ? <span className="mono">{selectedCapitalizationRow.depreciation_category_code}</span> : undefined}
                />
                <Metric
                  label="Depreciation class"
                  value={selectedCapitalizationRow.depreciation_setup_name ?? "Not configured"}
                  sub={selectedCapitalizationRow.depreciation_setup_code ? <span className="mono">{selectedCapitalizationRow.depreciation_setup_code}</span> : "Create setup before posting depreciation"}
                />
                <Metric
                  label="Current depreciation"
                  value={selectedCapitalizationRow.depreciation_rate ? `${selectedCapitalizationRow.depreciation_rate}%` : "No rate"}
                  sub="Read from Setup"
                />
              </div>
            ) : null}
          </ModalShell>
        ) : null}

        {adjustmentModalOpen ? (
          <ModalShell
            eyebrow="Fixed Asset Register"
            title="Add Adjustment"
            onClose={() => setAdjustmentModalOpen(false)}
            footer={(
              <>
                <div className="modal-foot-meta mono">
                  Adjustments affect future opening WDV; posted depreciation entries are not rewritten.
                </div>
                <div className="modal-foot-actions">
                  <button type="button" className="btn btn-md" onClick={() => setAdjustmentModalOpen(false)} disabled={busy === "adjust"}>Cancel</button>
                  <button type="button" className="btn btn-md btn-primary" onClick={createAdjustment} disabled={busy === "adjust" || !adjustmentForm.asset || !adjustmentForm.amount || !adjustmentForm.effective_date || !adjustmentForm.reason.trim()}>
                    {busy === "adjust" ? "Saving..." : "Add adjustment"}
                  </button>
                </div>
              </>
            )}
          >
            <div className="stage-form-fields stage-form-fields-3">
              <Field label="Asset">
                <ThemedSelect
                  value={adjustmentForm.asset}
                  onChange={value => setAdjustmentForm(prev => ({ ...prev, asset: value }))}
                  placeholder="Select asset"
                  ariaLabel="Asset"
                  options={assets.map(asset => ({
                    value: String(asset.id),
                    label: asset.asset_number,
                    meta: asset.item_name ?? "",
                  }))}
                />
              </Field>
              <Field label="Type">
                <ThemedSelect
                  value={adjustmentForm.adjustment_type}
                  onChange={value => setAdjustmentForm(prev => ({ ...prev, adjustment_type: value }))}
                  ariaLabel="Adjustment type"
                  options={ADJUSTMENT_TYPES.map(type => ({ value: type, label: formatItemLabel(type) }))}
                />
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
            </div>
          </ModalShell>
        ) : null}
      </div>
    </div>
  );
}
