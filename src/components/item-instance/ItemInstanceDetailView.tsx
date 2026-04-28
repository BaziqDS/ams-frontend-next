"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Topbar } from "@/components/Topbar";
import { useCan, useCapabilities } from "@/contexts/CapabilitiesContext";
import { apiFetch, type Page } from "@/lib/api";
import {
  buildInstanceDescription,
  buildInstanceStatusLabel,
  buildInstanceTitle,
  getPrimaryInstanceIdentifier,
} from "@/lib/itemInstanceDetailUi";
import { formatItemDate, formatItemLabel, type ItemRecord } from "@/lib/itemUi";
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
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const Icon = ({ d, size = 16 }: { d: ReactNode | string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {typeof d === "string" ? <path d={d} /> : d}
  </svg>
);

function normalizeList<T>(data: Page<T> | T[]) {
  return Array.isArray(data) ? data : data.results;
}

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
  children,
}: {
  title: string;
  meta?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={styles.sectionCard}>
      <header className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>{title}</h2>
        {meta ? <div className={styles.sectionMeta}>{meta}</div> : null}
      </header>
      <div className={styles.sectionBody}>{children}</div>
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
  const [item, setItem] = useState<ItemRecord | null>(null);
  const [instance, setInstance] = useState<ItemInstanceRecord | null>(null);
  const [itemInstances, setItemInstances] = useState<ItemInstanceRecord[]>([]);
  const [relatedEntries, setRelatedEntries] = useState<RelatedStockEntryRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);

    try {
      const [itemData, instanceData, itemInstanceData] = await Promise.all([
        apiFetch<ItemRecord>(`/api/inventory/items/${itemId}/`),
        apiFetch<ItemInstanceRecord>(`/api/inventory/item-instances/${instanceId}/`),
        apiFetch<Page<ItemInstanceRecord> | ItemInstanceRecord[]>(`/api/inventory/item-instances/?page_size=1000&item=${itemId}`),
      ]);

      const stockEntryIds = Array.from(new Set((instanceData.stock_entry_ids ?? []).filter(Number.isFinite)));
      const stockEntryResults = await Promise.allSettled(
        stockEntryIds.map(stockEntryId => apiFetch<RelatedStockEntryRecord>(`/api/inventory/stock-entries/${stockEntryId}/`)),
      );

      setItem(itemData);
      setInstance(instanceData);
      setItemInstances(normalizeList(itemInstanceData));
      setRelatedEntries(
        stockEntryResults
          .flatMap(result => result.status === "fulfilled" ? [result.value] : [])
          .sort((left, right) => new Date(right.entry_date).getTime() - new Date(left.entry_date).getTime()),
      );
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Failed to load item instance");
    } finally {
      setIsLoading(false);
    }
  }, [instanceId, itemId]);

  useEffect(() => {
    if (capsLoading) return;
    if (!canViewItems) {
      router.replace("/403");
      return;
    }
    load();
  }, [canViewItems, capsLoading, load, router]);

  const sortedInstances = useMemo(
    () => [...itemInstances].sort((left, right) => left.id - right.id),
    [itemInstances],
  );

  const instancePosition = useMemo(() => {
    if (!instance) return null;
    const index = sortedInstances.findIndex(candidate => candidate.id === instance.id);
    return index >= 0 ? index + 1 : null;
  }, [instance, sortedInstances]);

  const qrHref = getMediaHref(instance?.qr_code_image);
  const itemName = item?.name ?? instance?.item_name ?? "Item";
  const title = instance
    ? buildInstanceTitle({
      itemName,
      serialNumber: instance.serial_number,
      instanceId: instance.id,
      position: instancePosition,
      total: sortedInstances.length || undefined,
    })
    : "Item instance";
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
  const description = instance
    ? buildInstanceDescription({
      itemName,
      locationName: cleanValue(instance.location_name),
      allocatedTo: cleanValue(instance.allocated_to),
      inspectionCertificate: cleanValue(instance.inspection_certificate),
      updatedAt: instance.updated_at,
    })
    : "";
  const breadcrumb = useMemo(
    () => ["Inventory", "Items", itemName, "Instances", primaryIdentifier],
    [itemName, primaryIdentifier],
  );

  const categoryName = item?.category_display ?? instance?.item_category_name ?? "Uncategorized";
  const modelNumber = cleanValue(instance?.item_model_number);
  const currentLocation = cleanValue(instance?.location_name) ?? "Not recorded";
  const currentLocationSub = formatHierarchyPath(instance?.full_location_path) ?? cleanValue(instance?.location_code);
  const authorityStore = cleanValue(instance?.authority_store_name) ?? "Not recorded";
  const authorityStoreSub = cleanValue(instance?.authority_store_code);
  const allocatedTo = cleanValue(instance?.allocated_to) ?? "Not allocated";
  const allocationSub = cleanValue(instance?.allocated_to_type) ? `${formatItemLabel(instance?.allocated_to_type)} allocation` : undefined;
  const inCharge = cleanValue(instance?.in_charge) ?? "Not recorded";
  const relatedEntryCount = relatedEntries.length;
  const latestRelatedEntry = relatedEntries[0] ?? null;
  const inspectionHref = instance?.inspection_certificate_id ? `/inspections/${instance.inspection_certificate_id}` : null;
  const heroIdentifierPrefix = cleanValue(instance?.serial_number) ? "SN /" : "ID /";

  const custodyCards = useMemo(() => {
    const cards = [
      {
        step: "Parent item",
        value: itemName,
        sub: `${item?.code ?? instance?.item_code ?? "No code"}${categoryName ? ` · ${categoryName}` : ""}`,
        current: false,
      },
      {
        step: "Authority store",
        value: authorityStore,
        sub: authorityStoreSub,
        current: false,
      },
      {
        step: "Current location",
        value: currentLocation,
        sub: currentLocationSub,
        current: false,
      },
      {
        step: cleanValue(instance?.allocated_to) ? "Allocated to · current" : "Current custody",
        value: allocatedTo,
        sub: cleanValue(instance?.allocated_to)
          ? allocationSub ?? `In charge: ${inCharge}`
          : `In charge: ${inCharge}`,
        current: true,
      },
    ];

    return cards;
  }, [
    allocatedTo,
    allocationSub,
    authorityStore,
    authorityStoreSub,
    categoryName,
    currentLocation,
    currentLocationSub,
    inCharge,
    instance?.allocated_to,
    instance?.item_code,
    item?.code,
    itemName,
  ]);

  return (
    <div>
      <Topbar breadcrumb={breadcrumb} />
      <div className="page">
        {(latestRelatedEntry || inspectionHref) ? (
          <div className={styles.detailTabs}>
            {latestRelatedEntry ? (
              <Link className={styles.detailTab} href={`/stock-entries/${latestRelatedEntry.id}`}>
                <Icon d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h5" size={14} />
                Stock Entry — detail
              </Link>
            ) : null}
            {inspectionHref ? (
              <Link className={styles.detailTab} href={inspectionHref}>
                <Icon d="M9 12l2 2 4-4M21 12c0 4-3.5 7-9 10-5.5-3-9-6-9-10a9 9 0 0 1 18 0Z" size={14} />
                Inspection Certificate — detail
              </Link>
            ) : null}
            <span className={`${styles.detailTab} ${styles.detailTabActive}`}>
              <Icon d="M12 2 3 7l9 5 9-5-9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5" size={14} />
              Item Instance — detail
            </span>
          </div>
        ) : null}

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
                <div className="eyebrow">Item Instance · Serialized asset</div>
                <h1 className={styles.pageTitle}>{title}</h1>
                <div className={styles.pageSub}>{description}</div>
                <div className={styles.pageIdRow}>
                  <span className={styles.docNo}>{primaryIdentifier}</span>
                  <StatusBadge label={statusLabel} tone={instance.is_active ? "success" : "neutral"} />
                  <StatusBadge label={instance.is_active ? "Active record" : "Disabled record"} tone={instance.is_active ? "success" : "warn"} />
                  <span className={styles.docMeta}>
                    <span className={styles.dotSep}>·</span>
                    <span>Created <strong>{formatDateTime(instance.created_at)}</strong></span>
                    {cleanValue(instance.created_by_name) ? (
                      <>
                        <span className={styles.dotSep}>·</span>
                        <span>by <span className={styles.monoSmall}>{instance.created_by_name}</span></span>
                      </>
                    ) : null}
                  </span>
                </div>
              </div>

              <div className={styles.pageActions}>
                {qrHref ? (
                  <a className="btn btn-sm" href={qrHref} target="_blank" rel="noopener noreferrer">
                    <Icon d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z" size={14} />
                    Print QR label
                  </a>
                ) : null}
                {inspectionHref ? (
                  <Link className="btn btn-sm" href={inspectionHref}>
                    <Icon d="M9 12l2 2 4-4M21 12c0 4-3.5 7-9 10-5.5-3-9-6-9-10a9 9 0 0 1 18 0Z" size={14} />
                    View certificate
                  </Link>
                ) : null}
                <Link className="btn btn-sm" href={`/items/${itemId}`}>
                  <Icon d="M3 12h18M3 6h18M3 18h18" size={14} />
                  Open item
                </Link>
              </div>
            </div>

            <div className={styles.hero}>
              <div className={styles.heroMain}>
                <div className={styles.heroIdentity}>
                  <div className={styles.heroSerial}>
                    <span className={styles.heroSerialPrefix}>{heroIdentifierPrefix}</span>
                    {primaryIdentifier}
                  </div>
                  <StatusBadge label={instance.is_active ? "Active record" : "Disabled record"} tone={instance.is_active ? "success" : "warn"} />
                </div>

                <div className={styles.heroSummaryLine}>
                  <div className={styles.heroCrumbs}>
                    <span>{categoryName}</span>
                    <span className={styles.heroCrumbSep}>›</span>
                    <span className={styles.monoSmall}>{item?.code ?? instance.item_code ?? "No code"}</span>
                  </div>
                  <div className={styles.heroParent}>
                    {itemName}{modelNumber ? ` · ${modelNumber}` : ""}
                  </div>
                </div>

                <div className={styles.heroAttrs}>
                  <div className={styles.heroAttr}>
                    <div className={styles.heroAttrLabel}>Item code</div>
                    <div className={`${styles.heroAttrValue} ${styles.monoSmall}`}>{item?.code ?? instance.item_code ?? "Not recorded"}</div>
                  </div>
                  <div className={styles.heroAttr}>
                    <div className={styles.heroAttrLabel}>Model number</div>
                    <div className={styles.heroAttrValue}>{modelNumber ?? "Not recorded"}</div>
                  </div>
                  <div className={styles.heroAttr}>
                    <div className={styles.heroAttrLabel}>Category</div>
                    <div className={styles.heroAttrValue}>{categoryName}</div>
                  </div>
                  <div className={styles.heroAttr}>
                    <div className={styles.heroAttrLabel}>Tracking</div>
                    <div className={styles.heroAttrValue}>{formatTrackingLabel(item?.tracking_type)}</div>
                  </div>
                </div>
              </div>

              <aside className={styles.heroAside}>
                <div className={styles.qrCard}>
                  {qrHref ? (
                    <img className={styles.qrImage} src={qrHref} alt={`QR code for ${primaryIdentifier}`} />
                  ) : (
                    <div className={styles.qrPlaceholder}>No QR image</div>
                  )}
                </div>
                <div className={styles.qrSide}>
                  <div className={styles.qrLabel}>QR code</div>
                  <div className={styles.qrCodeText}>{cleanValue(instance.qr_code) ?? "Not recorded"}</div>
                  {qrHref ? (
                    <div className={styles.qrActions}>
                      <a className="btn btn-sm" href={qrHref} target="_blank" rel="noopener noreferrer" download>
                        Download
                      </a>
                    </div>
                  ) : null}
                </div>
              </aside>
            </div>

            <div className={styles.custodyGrid}>
              {custodyCards.map((card, index) => (
                <div key={card.step} className={`${styles.custodyCard} ${card.current ? styles.custodyCardCurrent : ""}`}>
                  <div className={styles.custodyStep}>
                    <span className={styles.custodyIndex}>{index + 1}</span>
                    {card.step}
                  </div>
                  <div className={styles.custodyValue}>{card.value}</div>
                  {card.sub ? <div className={styles.custodySub}>{card.sub}</div> : null}
                  {index < custodyCards.length - 1 ? <span className={styles.custodyArrow}><Icon d="M9 18l6-6-6-6" size={9} /></span> : null}
                </div>
              ))}
            </div>

            <div className={styles.detailLayout}>
              <div className={styles.mainColumn}>
                <SectionCard title="Identity & specifications" meta={item?.code ? <>inherited from <span className={styles.monoSmall}>{item.code}</span></> : undefined}>
                  <div className={styles.specsGrid}>
                    <div className={styles.specsVisual}>
                      <div className={styles.specsVisualPlaceholder}>Asset photo · not available</div>
                    </div>
                    <div className={styles.specsBody}>
                      <div className={styles.kvGrid}>
                        <DetailField label="Serial number" value={cleanValue(instance.serial_number) ?? "Not recorded"} />
                        <DetailField label="QR code" value={<span className={styles.monoSmall}>{cleanValue(instance.qr_code) ?? "Not recorded"}</span>} />
                        <DetailField label="Item name" value={itemName} />
                        <DetailField label="Item code" value={<span className={styles.monoSmall}>{item?.code ?? instance.item_code ?? "Not recorded"}</span>} />
                        <DetailField label="Category" value={categoryName} sub={item?.category_type ? formatItemLabel(item.category_type) : undefined} />
                        <DetailField label="Model number" value={modelNumber ?? "Not recorded"} />
                        <DetailField label="Tracking type" value={formatTrackingLabel(item?.tracking_type)} sub={item?.tracking_type === "INDIVIDUAL" ? "one record per physical unit" : undefined} />
                        <DetailField label="Active record" value={<StatusBadge label={instance.is_active ? "Active" : "Disabled"} tone={instance.is_active ? "success" : "warn"} />} />
                        <DetailField label="Current location" value={currentLocation} sub={formatHierarchyPath(instance.full_location_path) ?? currentLocationSub} />
                        <DetailField label="Authority store" value={authorityStore} sub={authorityStoreSub} />
                        <DetailField label="Allocated to" value={allocatedTo} sub={allocationSub} />
                        <DetailField label="In charge" value={inCharge} />
                      </div>
                    </div>
                  </div>
                </SectionCard>

                {cleanValue(instance.inspection_certificate) ? (
                  <div className={styles.inspectionBanner}>
                    <span className={styles.inspectionIcon}>
                      <Icon d="M9 11l3 3 7-7M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" size={18} />
                    </span>
                    <div className={styles.inspectionCopy}>
                      <div className={styles.inspectionTitle}>Inspection certificate {instance.inspection_certificate}</div>
                      <div className={styles.inspectionMeta}>Linked to this item-instance record{latestRelatedEntry ? ` · latest movement ${formatItemDate(latestRelatedEntry.entry_date)}` : ""}</div>
                    </div>
                    {inspectionHref ? (
                      <Link className={styles.inspectionLink} href={inspectionHref}>
                        View certificate
                        <Icon d="M9 18l6-6-6-6" size={12} />
                      </Link>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <aside className={styles.sideColumn}>
                <SectionCard title="Record state">
                  <div className={styles.stateStack}>
                    <DetailField label="Created" value={formatDateTime(instance.created_at)} sub={cleanValue(instance.created_by_name) ? `by ${instance.created_by_name}` : undefined} />
                    <DetailField label="Last updated" value={formatDateTime(instance.updated_at)} />
                    <DetailField label="Active flag" value={<StatusBadge label={instance.is_active ? "Active" : "Disabled"} tone={instance.is_active ? "success" : "warn"} />} sub={instance.is_active ? "available for active inventory use" : "retired or disabled from service"} />
                    <DetailField label="Current status" value={<StatusBadge label={statusLabel} tone={instance.is_active ? "success" : "neutral"} />} />
                  </div>

                  <div className={styles.stateActions}>
                    <div className={styles.stateActionsDivider} />
                    <div className={styles.actionStack}>
                      <Link className="btn btn-sm" href={`/items/${itemId}`}>
                        Open item
                      </Link>
                      {inspectionHref ? (
                        <Link className="btn btn-sm" href={inspectionHref}>
                          View certificate
                        </Link>
                      ) : null}
                      {latestRelatedEntry ? (
                        <Link className="btn btn-sm" href={`/stock-entries/${latestRelatedEntry.id}`}>
                          Latest stock entry
                        </Link>
                      ) : null}
                      {qrHref ? (
                        <a className="btn btn-sm" href={qrHref} target="_blank" rel="noopener noreferrer" download>
                          Download QR
                        </a>
                      ) : null}
                    </div>
                  </div>
                </SectionCard>
              </aside>
            </div>

            {relatedEntries.length > 0 ? (
              <SectionCard title="Related stock entries" meta={`${relatedEntryCount} linked movement record${relatedEntryCount === 1 ? "" : "s"}`}>
                <div className={styles.relatedList}>
                  {relatedEntries.map(entry => (
                    <Link key={entry.id} className={styles.relatedRow} href={`/stock-entries/${entry.id}`}>
                      <span className={styles.relatedIcon}>{entry.entry_type.slice(0, 1)}</span>
                      <span className={styles.relatedCopy}>
                        <span className={styles.relatedNumber}>{entry.entry_number}</span>
                        <span className={styles.relatedMeta}>
                          {formatItemLabel(entry.entry_type)} · {buildInstanceStatusLabel({ status: entry.status })} · {formatItemDate(entry.entry_date)}
                        </span>
                      </span>
                    </Link>
                  ))}
                </div>
              </SectionCard>
            ) : null}
          </>
        ) : (
          <div className={styles.loadingCard}>Item instance not found.</div>
        )}
      </div>
    </div>
  );
}
