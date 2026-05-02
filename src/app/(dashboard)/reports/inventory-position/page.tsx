"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Topbar } from "@/components/Topbar";
import { useCan, useCapabilities } from "@/contexts/CapabilitiesContext";
import { apiFetch } from "@/lib/api";
import { API_BASE } from "@/lib/inspectionUi";

type ReportStoreOption = {
  id: number;
  name: string;
  code: string;
  parent_location_id?: number | null;
  parent_location_name?: string | null;
};

function SearchIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={open ? "M18 15l-6-6-6 6" : "M6 9l6 6 6-6"} />
    </svg>
  );
}

export default function InventoryPositionReportPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const { isLoading: capsLoading } = useCapabilities();
  const canView = useCan("reports");
  const [stores, setStores] = useState<ReportStoreOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedStoreId, setSelectedStoreId] = useState<number | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (capsLoading) return;
    if (!canView) {
      router.replace("/403");
      return;
    }

    let cancelled = false;

    const loadStores = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await apiFetch<ReportStoreOption[]>("/api/inventory/reports/inventory-position/stores/");
        if (!cancelled) {
          setStores(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load stores.");
          setStores([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadStores();

    return () => {
      cancelled = true;
    };
  }, [canView, capsLoading, router]);

  const selectedStore = useMemo(
    () => stores.find(store => store.id === selectedStoreId) ?? null,
    [selectedStoreId, stores],
  );

  const filteredStores = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return stores;
    return stores.filter(store => `${store.name} ${store.code}`.toLowerCase().includes(query));
  }, [searchQuery, stores]);

  const focusInput = () => {
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handleGeneratePdf = () => {
    if (!selectedStoreId) return;
    window.open(`${API_BASE}/api/inventory/reports/inventory-position/pdf/?store=${selectedStoreId}`, "_blank");
  };

  return (
    <div>
      <Topbar breadcrumb={["Operations", "Reports", "Inventory Position"]} />
      <div className="page">
        <div className="page-head">
          <div className="page-title-group">
            <div className="eyebrow">Operations</div>
            <h1>Inventory Position Report</h1>
            <div className="page-sub">This report shows the current position of inventory for a selected store.</div>
          </div>
        </div>

        <div className="table-card" style={{ padding: 24 }}>
          <div className="table-card-head" style={{ padding: 0, marginBottom: 20 }}>
            <div className="table-card-head-left">
              <div>
                <h3 style={{ margin: 0 }}>Generate PDF</h3>
                <p style={{ margin: "6px 0 0", color: "var(--text-2)", fontSize: 14 }}>
                  Choose one accessible store, then open the report PDF in a new browser tab.
                </p>
              </div>
            </div>
          </div>

          {error ? (
            <div style={{ padding: "12px 16px", marginBottom: 16, background: "var(--danger-weak)", border: "1px solid color-mix(in oklch, var(--danger) 30%, transparent)", borderRadius: "var(--radius)", color: "var(--danger)", fontSize: 13 }}>
              {error}
            </div>
          ) : null}

          <div style={{ display: "grid", gap: 16, maxWidth: 560 }}>
            <div>
              <label style={{ display: "block", marginBottom: 8, fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>
                Store
              </label>
              <div
                className={"assignment-dropdown" + (dropdownOpen ? " open" : "") + (loading ? " disabled" : "")}
                onBlur={event => {
                  const nextTarget = event.relatedTarget;
                  if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
                    setDropdownOpen(false);
                    setSearchQuery("");
                  }
                }}
              >
                <div
                  className="assignment-trigger"
                  onClick={() => {
                    if (loading) return;
                    setDropdownOpen(true);
                    focusInput();
                  }}
                  aria-expanded={dropdownOpen}
                >
                  <SearchIcon />
                  <input
                    ref={inputRef}
                    value={dropdownOpen ? searchQuery : (selectedStore ? `${selectedStore.name} (${selectedStore.code})` : "")}
                    placeholder={dropdownOpen ? "Search stores by name or code..." : "Select a store"}
                    disabled={loading}
                    onFocus={() => {
                      if (loading) return;
                      setDropdownOpen(true);
                    }}
                    onChange={event => {
                      if (!dropdownOpen) setDropdownOpen(true);
                      setSearchQuery(event.target.value);
                    }}
                  />
                  {dropdownOpen && searchQuery ? (
                    <button
                      type="button"
                      className="assignment-trigger-clear"
                      onClick={event => {
                        event.stopPropagation();
                        setSearchQuery("");
                        focusInput();
                      }}
                      aria-label="Clear search"
                    >
                      ×
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="assignment-trigger-toggle"
                    onClick={event => {
                      event.stopPropagation();
                      if (loading) return;
                      setDropdownOpen(prev => !prev);
                      focusInput();
                    }}
                    disabled={loading}
                    aria-label={dropdownOpen ? "Close stores" : "Open stores"}
                  >
                    <ChevronIcon open={dropdownOpen} />
                  </button>
                </div>

                {dropdownOpen && !loading ? (
                  <div className="assignment-menu">
                    <div className="assignment-list" style={{ maxHeight: 220 }}>
                      {filteredStores.length > 0 ? filteredStores.map(store => (
                        <button
                          key={store.id}
                          type="button"
                          className={"assignment-row" + (store.id === selectedStoreId ? " selected" : "")}
                          onClick={() => {
                            setSelectedStoreId(store.id);
                            setSearchQuery("");
                            setDropdownOpen(false);
                          }}
                        >
                          <span className="assignment-name">{store.name}</span>
                          <span className="assignment-code mono">{store.code}</span>
                        </button>
                      )) : (
                        <div className="scope-empty">No matching stores.</div>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
              <div className="field-hint assignment-help" style={{ marginTop: 8 }}>
                {loading
                  ? "Loading accessible stores..."
                  : selectedStore
                    ? `Selected store: ${selectedStore.name}`
                    : "Only stores available within your scope are listed here."}
              </div>
            </div>

            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <button type="button" className="btn" onClick={handleGeneratePdf} disabled={!selectedStoreId}>
                Generate PDF
              </button>
              {selectedStore?.parent_location_name ? (
                <span style={{ color: "var(--text-2)", fontSize: 13 }}>
                  Parent location: {selectedStore.parent_location_name}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
