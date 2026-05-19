"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Topbar } from "@/components/Topbar";
import { useCan, useCapabilities } from "@/contexts/CapabilitiesContext";
import { apiFetch, type Page } from "@/lib/api";
import {
  buildInstanceStatusLabel,
  getPrimaryInstanceIdentifier,
} from "@/lib/itemInstanceDetailUi";
import { formatItemDate, formatItemLabel, toNumber, type DepreciationSummary, type ItemRecord } from "@/lib/itemUi";
import {
  formatMaintenanceLabel,
  isClosedMaintenance,
  normalizeList,
  statusPillClass,
  type MaintenanceMeterReadingRecord,
  type MaintenancePlanRecord,
  type MaintenanceWorkOrderRecord,
} from "@/lib/maintenanceUi";
import styles from "./ItemInstanceDetailView.module.css";

interface ItemInstanceRecord {
  id: number;
  item: number;
  item_name?: string | null;
  item_code?: string | null;
  item_category_name?: string | null;
  item_model_number?: string | null;
  serial_number?: string | null;
  qr_code?: string | null;
  qr_code_image?: string | null;
  current_location: number | null;
  location_name?: string | null;
  location_code?: string | null;
  full_location_path?: string | null;
  status: string;
  in_charge?: string | null;
  authority_store_name?: string | null;
  authority_store_code?: string | null;
  inspection_certificate?: string | null;
  inspection_certificate_id?: number | null;
  allocated_to?: string | null;
  allocated_to_type?: string | null;
  stock_entry_ids?: number[];
  is_active: boolean;
  created_at?: string | null;
  updated_at?: string | null;
  created_by_name?: string | null;
  depreciation_summary?: DepreciationSummary | null;
}

interface RelatedStockEntryRecord {
  id: number;
  entry_type: string;
  entry_number: string;
  entry_date: string;
  status: string;
  from_location_name?: string | null;
  to_location_name?: string | null;
  issued_to_name?: string | null;
  inspection_certificate_number?: string | null;
  created_at?: string | null;
  created_by_name?: string | null;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const Icon = ({ d, size = 16 }: { d: ReactNode | string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {typeof d === "string" ? <path d={d} /> : d}
  </svg>
);

function getMediaHref(file: string | null | undefined) {
  if (!file) return null;
  return file.startsWith("http") ? file : `${API_BASE}${file}`;
}

function cleanValue(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "-" || trimmed.toUpperCase() === "N/A") return null;
  return trimmed;
}

function formatDateTime(value: string | null | undefined, fallback = "Not recorded") {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatMoneyValue(value: number | string | null | undefined) {
  return new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: "PKR",
    maximumFractionDigits: 0,
  }).format(toNumber(value));
}

function formatTrackingLabel(value: string | null | undefined) {
  if (value === "INDIVIDUAL") return "Serial-tracked";
  return formatItemLabel(value);
}

function formatHierarchyPath(value: string | null | undefined) {
  const cleaned = cleanValue(value);
  if (!cleaned) return null;
  return cleaned.split("/").map(part => part.trim()).filter(Boolean).join(" › ");
}

function Alert({ children }: { children: ReactNode }) {
  return <div className={styles.alert}>{children}</div>;
}

function SectionCard({
  title,
  meta,
  icon,
  children,
}: {
  title: string;
  meta?: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={styles.sectionCard}>
      <header className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>
          {icon ? <span className={styles.sectionIcon}>{icon}</span> : null}
          {title}
        </h2>
        {meta ? <div className={styles.sectionMeta}>{meta}</div> : null}
      </header>
      <div className={styles.sectionBody}>{children}</div>
    </section>
  );
}

function KpiTile({
  title,
  value,
  sub,
  icon,
}: {
  title: string;
  value: ReactNode;
  sub?: ReactNode;
  icon: ReactNode;
}) {
  return (
    <section className={styles.kpiTile}>
      <span className={styles.kpiIcon}>{icon}</span>
      <div className={styles.kpiCopy}>
        <span className={styles.kpiTitle}>{title}</span>
        <strong>{value}</strong>
        {sub ? <span>{sub}</span> : null}
      </div>
    </section>
  );
}

function DetailField({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className={styles.detailField}>
      <div className={styles.detailLabel}>{label}</div>
      <div className={styles.detailValue}>{value}</div>
      {sub ? <div className={styles.detailSub}>{sub}</div> : null}
    </div>
  );
}

function StatusBadge({ label, tone = "neutral" }: { label: string; tone?: "success" | "neutral" | "warn" }) {
  const toneClass = tone === "success"
    ? styles.badgeSuccess
    : tone === "warn"
      ? styles.badgeWarn
      : styles.badgeNeutral;

  return (
    <span className={`${styles.badge} ${toneClass}`}>
      <span className={styles.badgeDot} />
      {label}
    </span>
  );
}

export function ItemInstanceDetailView({ itemId, instanceId }: { itemId: string; instanceId: string }) {
  const router = useRouter();
  const { isLoading: capsLoading } = useCapabilities();
  const canViewItems = useCan("items");
  const canManageItems = useCan("items", "manage");
  const canViewMaintenance = useCan("maintenance");
  const [item, setItem] = useState<ItemRecord | null>(null);
  const [instance, setInstance] = useState<ItemInstanceRecord | null>(null);
  const [relatedEntries, setRelatedEntries] = useState<RelatedStockEntryRecord[]>([]);
  const [maintenancePlans, setMaintenancePlans] = useState<MaintenancePlanRecord[]>([]);
  const [maintenanceOrders, setMaintenanceOrders] = useState<MaintenanceWorkOrderRecord[]>([]);
  const [meterReadings, setMeterReadings] = useState<MaintenanceMeterReadingRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isEditingSerial, setIsEditingSerial] = useState(false);
  const [serialDraft, setSerialDraft] = useState("");
  const [serialSaveError, setSerialSaveError] = useState<string | null>(null);
  const [isSavingSerial, setIsSavingSerial] = useState(false);
  const serialInputRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);

    try {
      const [itemData, instanceData] = await Promise.all([
        apiFetch<ItemRecord>(`/api/inventory/items/${itemId}/`),
        apiFetch<ItemInstanceRecord>(`/api/inventory/item-instances/${instanceId}/`),
      ]);

      const stockEntryIds = Array.from(new Set((instanceData.stock_entry_ids ?? []).filter(Number.isFinite)));
      const [stockEntryResults, maintenancePlanData, maintenanceOrderData, meterReadingData] = await Promise.all([
        stockEntryIds.length > 0
          ? apiFetch<Page<RelatedStockEntryRecord> | RelatedStockEntryRecord[]>(
              `/api/inventory/stock-entries/?ids=${stockEntryIds.join(",")}&page_size=${stockEntryIds.length}`,
            ).then(normalizeList).catch(() => [] as RelatedStockEntryRecord[])
          : Promise.resolve([] as RelatedStockEntryRecord[]),
        canViewMaintenance
          ? apiFetch<Page<MaintenancePlanRecord> | MaintenancePlanRecord[]>(`/api/inventory/maintenance/plans/?instance=${instanceId}&page_size=20`).catch(() => [] as MaintenancePlanRecord[])
          : Promise.resolve([] as MaintenancePlanRecord[]),
        canViewMaintenance
          ? apiFetch<Page<MaintenanceWorkOrderRecord> | MaintenanceWorkOrderRecord[]>(`/api/inventory/maintenance/work-orders/?instance=${instanceId}&page_size=20`).catch(() => [] as MaintenanceWorkOrderRecord[])
          : Promise.resolve([] as MaintenanceWorkOrderRecord[]),
        canViewMaintenance
          ? apiFetch<Page<MaintenanceMeterReadingRecord> | MaintenanceMeterReadingRecord[]>(`/api/inventory/maintenance/meter-readings/?instance=${instanceId}&page_size=20`).catch(() => [] as MaintenanceMeterReadingRecord[])
          : Promise.resolve([] as MaintenanceMeterReadingRecord[]),
      ]);

      setItem(itemData);
      setInstance(instanceData);
      setMaintenancePlans(normalizeList(maintenancePlanData));
      setMaintenanceOrders(normalizeList(maintenanceOrderData));
      setMeterReadings(normalizeList(meterReadingData));
      setRelatedEntries(
        stockEntryResults
          .sort((left, right) => new Date(right.entry_date).getTime() - new Date(left.entry_date).getTime()),
      );
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Failed to load item instance");
    } finally {
      setIsLoading(false);
    }
  }, [canViewMaintenance, instanceId, itemId]);

  useEffect(() => {
    if (capsLoading) return;
    if (!canViewItems) {
      router.replace("/403");
      return;
    }
    load();
  }, [canViewItems, capsLoading, load, router]);

  useEffect(() => {
    setSerialDraft(instance?.serial_number ?? "");
    setIsEditingSerial(false);
    setSerialSaveError(null);
  }, [instance?.id, instance?.serial_number]);

  useEffect(() => {
    if (!isEditingSerial) return;
    serialInputRef.current?.focus();
    serialInputRef.current?.select();
  }, [isEditingSerial]);

  const handleStartSerialEdit = useCallback(() => {
    setSerialDraft(instance?.serial_number ?? "");
    setSerialSaveError(null);
    setIsEditingSerial(true);
  }, [instance?.serial_number]);

  const handleCancelSerialEdit = useCallback(() => {
    setSerialDraft(instance?.serial_number ?? "");
    setSerialSaveError(null);
    setIsEditingSerial(false);
  }, [instance?.serial_number]);

  const handleSaveSerial = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!instance) return;

    const nextSerial = serialDraft.trim();
    const currentSerial = instance.serial_number?.trim() ?? "";
    if (nextSerial === currentSerial) {
      setSerialSaveError(null);
      setIsEditingSerial(false);
      return;
    }

    setIsSavingSerial(true);
    setSerialSaveError(null);
    try {
      const updatedInstance = await apiFetch<ItemInstanceRecord>(`/api/inventory/item-instances/${instance.id}/`, {
        method: "PATCH",
        body: JSON.stringify({ serial_number: nextSerial || null }),
      });
      setInstance(updatedInstance);
      setIsEditingSerial(false);
    } catch (err) {
      setSerialSaveError(err instanceof Error ? err.message : "Failed to update serial number");
    } finally {
      setIsSavingSerial(false);
    }
  }, [instance, serialDraft]);

  const qrHref = getMediaHref(instance?.qr_code_image);
  const itemName = item?.name ?? instance?.item_name ?? "Item";
  const primaryIdentifier = instance
    ? getPrimaryInstanceIdentifier({
      serialNumber: instance.serial_number,
      qrCode: instance.qr_code,
      instanceId: instance.id,
    })
    : `Instance #${instanceId}`;
  const statusLabel = instance
    ? buildInstanceStatusLabel({ status: instance.status, allocatedTo: cleanValue(instance.allocated_to) })
    : "Unknown";
  const breadcrumb = useMemo(
    () => ["Inventory", "Items", itemName, "Instance"],
    [itemName],
  );

  const itemCode = item?.code ?? instance?.item_code ?? "No item code";
  const itemContext = `${itemName} / ${itemCode}`;
  const categoryName = item?.category_display ?? instance?.item_category_name ?? "Uncategorized";
  const trackingLabel = formatTrackingLabel(item?.tracking_type);
  const currentLocation = cleanValue(instance?.location_name) ?? "Not recorded";
  const currentLocationSub = formatHierarchyPath(instance?.full_location_path) ?? cleanValue(instance?.location_code);
  const authorityStore = cleanValue(instance?.authority_store_name) ?? "Not recorded";
  const authorityStoreSub = cleanValue(instance?.authority_store_code);
  const allocatedTo = cleanValue(instance?.allocated_to) ?? "Not allocated";
  const allocationSub = cleanValue(instance?.allocated_to_type) ? `${formatItemLabel(instance?.allocated_to_type)} allocation` : undefined;
  const inCharge = cleanValue(instance?.in_charge) ?? "Not recorded";
  const relatedEntryCount = relatedEntries.length;
  const latestRelatedEntry = relatedEntries[0] ?? null;
  const activePlans = maintenancePlans.filter(row => row.is_active).length;
  const openMaintenanceCount = maintenanceOrders.filter(row => !isClosedMaintenance(row.status)).length;
  const latestMeterReading = meterReadings[0] ?? null;
  const inspectionHref = instance?.inspection_certificate_id ? `/inspections/${instance.inspection_certificate_id}` : null;
  const statusTone = !instance?.is_active ? "warn" : statusLabel === "Available" ? "success" : "neutral";
  const displayStatusLabel = instance?.is_active ? statusLabel : "Disabled";
  const depreciation = instance?.depreciation_summary;
  const netBookValue = depreciation?.capitalized ? formatMoneyValue(depreciation.current_wdv) : "Not capitalized";
  const shouldShowSerialField = isEditingSerial || cleanValue(instance?.serial_number) !== primaryIdentifier;
  const dataWarnings = [
    !cleanValue(instance?.serial_number) ? "Serial number missing" : null,
    !cleanValue(instance?.qr_code) && !qrHref ? "QR label missing" : null,
    !cleanValue(instance?.current_location != null ? currentLocation : null) ? "Location missing" : null,
    depreciation?.capitalized === false ? "Not in fixed asset register" : null,
  ].filter(Boolean) as string[];

  return (
    <div>
      <Topbar breadcrumb={breadcrumb} />
      <div className="page">
        <Link className={styles.pageBack} href={`/items/${itemId}/instances`}>
          <Icon d="M19 12H5M12 19l-7-7 7-7" size={12} />
          Back to {itemName} — instances
        </Link>

        {fetchError && (
          <Alert>
            {fetchError} <button type="button" className="btn btn-xs" onClick={() => load()}>Retry</button>
          </Alert>
        )}

        {isLoading ? (
          <div className={styles.loadingCard}>Loading item instance…</div>
        ) : instance ? (
          <>
            <div className={styles.pageHead}>
              <div className={styles.pageTitleGroup}>
                <div className="eyebrow">Item Instance</div>
                <h1 className={styles.pageTitle}>{primaryIdentifier}</h1>
                <div className={styles.pageSub}>{itemContext}</div>
                <div className={styles.pageIdRow}>
                  <StatusBadge label={displayStatusLabel} tone={statusTone} />
                  <StatusBadge label={item?.tracking_type === "INDIVIDUAL" ? "In Stock" : trackingLabel} tone="neutral" />
                  {depreciation?.capitalized ? <StatusBadge label="Fixed Asset" tone="neutral" /> : null}
                  <StatusBadge label={instance.is_active ? "Active" : "Inactive"} tone={instance.is_active ? "success" : "warn"} />
                </div>
              </div>

              <div className={styles.pageActions}>
                {canManageItems && !isEditingSerial ? (
                  <button type="button" className="btn btn-sm" onClick={handleStartSerialEdit}>
                    <Icon d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.1 2.1 0 113 3L12 15l-4 1 1-4 9.5-9.5Z" size={14} />
                    Edit Instance
                  </button>
                ) : null}
                {qrHref ? (
                  <a className="btn btn-sm" href={qrHref} target="_blank" rel="noopener noreferrer">
                    <Icon d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z" size={14} />
                    Print Label
                  </a>
                ) : null}
                <Link className="btn btn-sm" href={latestRelatedEntry ? `/stock-entries/${latestRelatedEntry.id}` : `/stock-entries?search=${encodeURIComponent(itemName)}`}>
                  <Icon d="M4 6h16M4 12h16M4 18h10" size={14} />
                  View Movements
                </Link>
              </div>
            </div>

            <div className={styles.kpiGrid}>
              <KpiTile
                title="Current Location"
                value={currentLocation}
                sub={currentLocationSub}
                icon={<Icon d={<><path d="M12 21s-7-6.5-7-12a7 7 0 1 1 14 0c0 5.5-7 12-7 12Z" /><circle cx="12" cy="9" r="2.5" /></>} size={18} />}
              />
              <KpiTile
                title="Custodian"
                value={allocatedTo !== "Not allocated" ? allocatedTo : inCharge}
                sub={allocatedTo !== "Not allocated" ? allocationSub : "Current in-charge"}
                icon={<Icon d={<><circle cx="12" cy="8" r="4" /><path d="M4 22c0-4.4 3.6-8 8-8s8 3.6 8 8" /></>} size={18} />}
              />
              <KpiTile
                title="Authority Store"
                value={authorityStore}
                sub={authorityStoreSub}
                icon={<Icon d={<><path d="M3 10l9-7 9 7" /><path d="M5 10v10h14V10" /><path d="M9 20v-6h6v6" /></>} size={18} />}
              />
              <KpiTile
                title="Net Book Value"
                value={netBookValue}
                sub={depreciation?.latest_posted_fiscal_year ? `FY ${depreciation.latest_posted_fiscal_year}-${String(depreciation.latest_posted_fiscal_year + 1).slice(-2)}` : "Finance status"}
                icon={<Icon d={<><rect x="3" y="6" width="18" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M6 9h.01M18 15h.01" /></>} size={18} />}
              />
            </div>

            <div className={styles.detailLayout}>
              <div className={styles.mainColumn}>
                <SectionCard
                  title="Custody & Placement"
                  icon={<Icon d={<><circle cx="8" cy="7" r="3" /><circle cx="17" cy="8" r="2" /><path d="M2 21c0-4 2.7-7 6-7s6 3 6 7M14 19c.5-2.6 2.4-4.5 4.8-4.5 1.3 0 2.5.5 3.2 1.5" /></>} size={15} />}
                  meta={canManageItems ? "Serial number can be edited from this record." : undefined}
                >
                  <div className={styles.detailsGrid}>
                    {shouldShowSerialField ? (
                      <DetailField
                        label="Serial number"
                        value={isEditingSerial ? (
                          <form className={styles.serialEditor} onSubmit={handleSaveSerial}>
                            <input
                              ref={serialInputRef}
                              className={styles.serialInput}
                              type="text"
                              value={serialDraft}
                              onChange={event => setSerialDraft(event.target.value)}
                              placeholder="Enter serial number"
                              aria-label="Serial number"
                              maxLength={100}
                              disabled={isSavingSerial}
                            />
                            <div className={styles.serialActions}>
                              <button type="submit" className="btn btn-xs" disabled={isSavingSerial}>
                                {isSavingSerial ? "Saving..." : "Save"}
                              </button>
                              <button type="button" className="btn btn-xs btn-ghost" onClick={handleCancelSerialEdit} disabled={isSavingSerial}>
                                Cancel
                              </button>
                            </div>
                            <div className={serialSaveError ? styles.serialError : styles.serialHint}>
                              {serialSaveError ?? "Leave the field empty if this unit has no serial number."}
                            </div>
                          </form>
                        ) : (
                          cleanValue(instance.serial_number) ?? "Not recorded"
                        )}
                      />
                    ) : null}
                    <DetailField label="Current location" value={currentLocation} sub={currentLocationSub} />
                    <DetailField label="Authority store" value={authorityStore} sub={authorityStoreSub} />
                    <DetailField label="Allocated to" value={allocatedTo} sub={allocationSub} />
                    <DetailField label="In charge" value={inCharge} />
                    <DetailField label="Category" value={categoryName} sub={trackingLabel} />
                    <DetailField label="Last update" value={formatDateTime(instance.updated_at)} sub={instance.created_by_name ? `Created by ${instance.created_by_name}` : undefined} />
                  </div>
                </SectionCard>

                <SectionCard
                  title="Movement Timeline"
                  icon={<Icon d="M4 6h16M4 12h16M4 18h10" size={15} />}
                  meta={`${relatedEntryCount} linked movement record${relatedEntryCount === 1 ? "" : "s"}`}
                >
                  {relatedEntries.length > 0 ? (
                    <div className="h-scroll">
                      <table className={styles.timelineTable}>
                        <thead>
                          <tr>
                            <th>Entry ID</th>
                            <th>Movement Type</th>
                            <th>From</th>
                            <th>To</th>
                            <th>Date & Time</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {relatedEntries.map(entry => (
                            <tr key={entry.id}>
                              <td><Link className={styles.inlineLink} href={`/stock-entries/${entry.id}`}>{entry.entry_number}</Link></td>
                              <td>{formatItemLabel(entry.entry_type)}</td>
                              <td>{entry.from_location_name ?? "-"}</td>
                              <td>{entry.to_location_name ?? entry.issued_to_name ?? "-"}</td>
                              <td>{formatDateTime(entry.entry_date || entry.created_at)}</td>
                              <td><span className={statusPillClass(entry.status)}>{formatItemLabel(entry.status)}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className={styles.emptyPanel}>No linked stock movements are available for this instance.</div>
                  )}
                </SectionCard>

                {canViewMaintenance ? (
                  <SectionCard
                    title="Related Maintenance"
                    icon={<Icon d="M14.7 6.3a4 4 0 0 1 5.4 5.4l-9.4 9.4-3.4 1.2 1.2-3.4 9.4-9.4-3.2-3.2" size={15} />}
                    meta={(
                      <Link className={styles.inlineLink} href={`/maintenance?instance=${instance.id}`}>
                        {openMaintenanceCount} open · view module
                      </Link>
                    )}
                  >
                    {maintenanceOrders.length > 0 ? (
                      <div className={styles.relatedList}>
                        {maintenanceOrders.slice(0, 5).map(order => (
                          <Link key={order.id} className={styles.relatedRow} href={`/maintenance?instance=${instance.id}`}>
                            <span className={styles.relatedIcon}>
                              {order.maintenance_type.slice(0, 1)}
                            </span>
                            <span className={styles.relatedCopy}>
                              <span className={styles.relatedNumber}>
                                {order.work_order_number} · {order.title}
                              </span>
                              <span className={styles.relatedMeta}>
                                {formatMaintenanceLabel(order.maintenance_type)} · {formatItemDate(order.due_date, "No due date")} · {order.action_taken || order.outcome_notes || "History retained in maintenance log"}
                              </span>
                            </span>
                            <span className={statusPillClass(order.status)}>
                              {formatMaintenanceLabel(order.status)}
                            </span>
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <div className={styles.stateStack}>
                        <DetailField label="History" value="No maintenance work orders recorded for this instance." />
                      </div>
                    )}
                  </SectionCard>
                ) : null}

                <SectionCard
                  title="Lifecycle & Finance"
                  icon={<Icon d={<><path d="M4 19V5a2 2 0 0 1 2-2h10l4 4v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" /><path d="M14 3v5h5" /></>} size={15} />}
                  meta={depreciation?.asset_number ? `Register ${depreciation.asset_number}` : undefined}
                >
                  <div className={styles.financeGrid}>
                    <DetailField label="Inspection Certificate" value={cleanValue(instance.inspection_certificate) ? (
                      inspectionHref ? <Link className={styles.inlineLink} href={inspectionHref}>{instance.inspection_certificate}</Link> : instance.inspection_certificate
                    ) : "Not linked"} />
                    <DetailField label="Original cost" value={depreciation?.capitalized ? formatMoneyValue(depreciation.original_cost) : "Not recorded"} />
                    <DetailField label="Accumulated depreciation" value={depreciation?.capitalized ? formatMoneyValue(depreciation.accumulated_depreciation) : "Not recorded"} />
                    <DetailField label="Current WDV / NBV" value={depreciation?.capitalized ? formatMoneyValue(depreciation.current_wdv) : "Not capitalized"} />
                    <DetailField label="Latest FY" value={depreciation?.latest_posted_fiscal_year ? `${depreciation.latest_posted_fiscal_year}-${String(depreciation.latest_posted_fiscal_year + 1).slice(-2)}` : "Not posted"} />
                    <DetailField label="Adjustment Status" value={depreciation?.capitalized ? "Up to date" : "No finance profile"} />
                  </div>
                </SectionCard>
              </div>

              <aside className={styles.sideColumn}>
                <SectionCard title="QR Label Preview" icon={<Icon d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z" size={15} />}>
                  <div className={styles.qrPanel}>
                    <div className={styles.qrCard}>
                      {qrHref ? (
                        <img className={styles.qrImage} src={qrHref} alt="QR label preview" />
                      ) : (
                        <div className={styles.qrPlaceholder}>No QR image</div>
                      )}
                    </div>
                    <div className={styles.qrPanelMeta}>
                      <DetailField label="Print size" value="40mm x 40mm" />
                      <DetailField label="Format" value={qrHref ? "Image available" : "Not generated"} />
                      {qrHref ? (
                        <a className="btn btn-sm" href={qrHref} target="_blank" rel="noopener noreferrer" download>
                          Download
                        </a>
                      ) : null}
                    </div>
                  </div>
                </SectionCard>

                <SectionCard title="Record Integrity" icon={<Icon d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" size={15} />}>
                  <div className={styles.stateStack}>
                    <DetailField label="Created by" value={instance.created_by_name ?? "Not recorded"} />
                    <DetailField label="Created" value={formatDateTime(instance.created_at)} />
                    <DetailField label="Last updated" value={formatDateTime(instance.updated_at)} />
                    <DetailField label="Active" value={instance.is_active ? "Yes" : "No"} />
                    <DetailField label="Data Quality" value={dataWarnings.length ? `${dataWarnings.length} warning${dataWarnings.length === 1 ? "" : "s"}` : "Good"} sub={dataWarnings.join(" · ") || "No obvious missing fields."} />
                  </div>
                </SectionCard>

                {canViewMaintenance ? (
                  <SectionCard title="Related Work" icon={<Icon d="M21 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6M7 13v-2a5 5 0 0 1 10 0v2" size={15} />}>
                    <div className={styles.relatedWorkList}>
                      <Link className={styles.relatedWorkRow} href={`/maintenance?instance=${instance.id}`}>
                        <span>
                          <strong>Maintenance Plans</strong>
                          <em>Active preventive maintenance plans</em>
                        </span>
                        <b>{activePlans}</b>
                      </Link>
                      <Link className={styles.relatedWorkRow} href={`/maintenance?instance=${instance.id}`}>
                        <span>
                          <strong>Work Orders</strong>
                          <em>Open / in progress / closed</em>
                        </span>
                        <b>{maintenanceOrders.length}</b>
                      </Link>
                      <Link className={styles.relatedWorkRow} href={`/maintenance?instance=${instance.id}`}>
                        <span>
                          <strong>Meter Readings</strong>
                          <em>{latestMeterReading ? `${latestMeterReading.reading_name}: ${latestMeterReading.value} ${latestMeterReading.unit ?? ""}` : "No readings recorded"}</em>
                        </span>
                        <b>{meterReadings.length}</b>
                      </Link>
                    </div>
                  </SectionCard>
                ) : null}
              </aside>
            </div>
          </>
        ) : (
          <div className={styles.loadingCard}>Item instance not found.</div>
        )}
      </div>
    </div>
  );
}
