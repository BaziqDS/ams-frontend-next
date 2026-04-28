"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Save,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ChevronRight,
  ShieldCheck,
  RefreshCw,
  Box,
  Link2,
  FileText,
  Rocket,
  Trash2,
  Image as ImageIcon,
  Eye,
  Download,
  ExternalLink,
  Package
} from "lucide-react";


import { inspectionsAPI } from "@/features/inspections/services/inspections";
import { inventoryService } from "@/features/inventory/services/inventory";
import { AnimatedListingLayout } from "@/components/dashboard/AnimatedListingLayout";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";

// Stage Forms
import { Stage1Form } from "@/features/inspections/components/Stage1Form";
import { Stage2Form } from "@/features/inspections/components/Stage2Form";
import { Stage3Form } from "@/features/inspections/components/Stage3Form";
import { Stage4Form } from "@/features/inspections/components/Stage4Form";

// ─────────────────────────────────────────────
// STATUS BADGE
// ─────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    DRAFT: { label: "Draft", className: "bg-muted text-muted-foreground border-border" },
    STOCK_DETAILS: { label: "Stock Details", className: "bg-navy-surface text-primary border-navy-muted" },
    CENTRAL_REGISTER: { label: "Central Registry", className: "bg-navy-surface text-primary border-navy-muted" },
    FINANCE_REVIEW: { label: "Finance Review", className: "bg-gold-muted text-amber-700 border-gold/30" },
    COMPLETED: { label: "Completed", className: "bg-success-muted text-success border-success/30" },
    REJECTED: { label: "Rejected", className: "bg-red-50 text-destructive border-destructive/20" },
  };
  const c = config[status] || config.DRAFT;
  return (
    <span className={cn("inline-flex items-center px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-widest border", c.className)}>
      {c.label}
    </span>
  );
}

// ─────────────────────────────────────────────
// WORKFLOW TRACKER
// ─────────────────────────────────────────────
const STAGE_ICONS: Record<string, React.ComponentType<any>> = {
  STOCK_DETAILS: Box,
  CENTRAL_REGISTER: Link2,
  FINANCE_REVIEW: ShieldCheck,
  COMPLETED: CheckCircle2,
};

const STAGE_LABELS: Record<string, string> = {
  STOCK_DETAILS: "Stock Details",
  CENTRAL_REGISTER: "Central Registry",
  FINANCE_REVIEW: "Finance Review",
  COMPLETED: "Completed",
};

function WorkflowTracker({
  stages,
  currentStage,
  rejectedStage,
  isRejected,
}: {
  stages: string[];
  currentStage: string;
  rejectedStage?: string;
  isRejected: boolean;
}) {
  const displayStage = isRejected ? rejectedStage! : currentStage;
  const currentIdx = stages.indexOf(displayStage);

  return (
    <div className="flex items-center gap-0">
      {stages.map((stageId, idx) => {
        const Icon = STAGE_ICONS[stageId] || Box;
        const isCompleted = idx < currentIdx || currentStage === "COMPLETED";
        const isCurrent = displayStage === stageId;
        const isRejectedStage = isRejected && rejectedStage === stageId;

        return (
          <React.Fragment key={stageId}>
            <div className="flex flex-col items-center gap-2 flex-1">
              <div className={cn(
                "w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all",
                isCompleted
                  ? "bg-success border-success text-white"
                  : isRejectedStage
                    ? "bg-destructive border-destructive text-white"
                    : isCurrent
                      ? "bg-primary border-primary text-primary-foreground shadow-elevated"
                      : "bg-card border-border text-muted-foreground"
              )}>
                {isCompleted
                  ? <CheckCircle2 className="w-4 h-4" />
                  : isRejectedStage
                    ? <XCircle className="w-4 h-4" />
                    : <Icon className="w-4 h-4" />}
              </div>
              <span className={cn(
                "text-[9px] font-bold uppercase tracking-wider text-center leading-tight w-20",
                isCurrent ? "text-primary" : isCompleted ? "text-success" : "text-muted-foreground"
              )}>
                {STAGE_LABELS[stageId] || stageId}
              </span>
            </div>
            {idx < stages.length - 1 && (
              <div className={cn(
                "flex-1 h-[2px] mb-5 mx-1",
                idx < currentIdx ? "bg-success" : "bg-border"
              )} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────
// DETAIL ITEM
// ─────────────────────────────────────────────
function formatDetailValue(value: unknown): React.ReactNode {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string" || typeof value === "number") return value;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value instanceof Date) return value.toLocaleString();

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function DetailItem({ label, value, isBadge = false }: { label: string; value: unknown; isBadge?: boolean }) {
  const displayValue = formatDetailValue(value);

  return (
    <div className="space-y-1.5">
      <span className="block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</span>
      {isBadge ? (
        <span className="inline-flex items-center px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-widest bg-navy-surface text-primary border border-navy-muted">
          {displayValue}
        </span>
      ) : (
        <p className="text-sm font-semibold text-foreground">{displayValue}</p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// STAGE CONFIGS
// ─────────────────────────────────────────────
const STAGE_CONFIGS_MAP: Record<string, { label: string; icon: React.ComponentType<any> }> = {
  DRAFT: { label: "Draft", icon: FileText },
  STOCK_DETAILS: { label: "Department Stock Register", icon: Box },
  CENTRAL_REGISTER: { label: "Central Registry & Catalog", icon: Link2 },
  FINANCE_REVIEW: { label: "Finance Review & Settlement", icon: ShieldCheck },
  COMPLETED: { label: "Inspection Finalized", icon: CheckCircle2 },
  REJECTED: { label: "Rejected", icon: XCircle },
};

const ALL_STAGES = ["STOCK_DETAILS", "CENTRAL_REGISTER", "FINANCE_REVIEW", "COMPLETED"];

// ─────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────
export default function InspectionDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [inspection, setInspection] = useState<Record<string, any> | null>(null);
  const [locations, setLocations] = useState<Array<Record<string, any>>>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<Record<string, any> | null>(null);
  const { user } = useAuth();

  const isImage = (url: string) => {
    if (!url) return false;
    return url.match(/\.(jpeg|jpg|gif|png|webp)$/i) != null || url.includes('image');
  };

  const permissions = user?.permissions || [];
  const canInitiate = permissions.includes("inventory.initiate_inspection");
  const canFillStockDetails = permissions.includes("inventory.fill_stock_details");
  const canFillCentralRegister = permissions.includes("inventory.fill_central_register");
  const canReviewFinance = permissions.includes("inventory.review_finance");

  const isStageReadOnly = useMemo(() => {
    if (!inspection) return true;
    switch (inspection.stage) {
      case "DRAFT": return false;
      case "STOCK_DETAILS": return !canFillStockDetails;
      case "CENTRAL_REGISTER": return !canFillCentralRegister;
      case "FINANCE_REVIEW": return !canReviewFinance;
      default: return true;
    }
  }, [inspection, canFillStockDetails, canFillCentralRegister, canReviewFinance]);

  const STAGES_LIST = useMemo(() => {
    if (!inspection) return ALL_STAGES;
    if (inspection.department_hierarchy_level === 0) {
      return ALL_STAGES.filter(s => s !== "STOCK_DETAILS");
    }
    return ALL_STAGES;
  }, [inspection]);

  const fetchInspection = useCallback(async () => {
    try {
      setLoading(true);
      const data = await inspectionsAPI.get(Number(id));
      setInspection(data);
    } catch (error) {
      console.error("Failed to fetch inspection:", error);
      toast({ title: "Error", description: "Failed to load inspection details", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  const fetchLocations = useCallback(async () => {
    try {
      const data = await inventoryService.getLocations();
      setLocations(data);
    } catch (error) {
      console.error("Failed to fetch locations:", error);
    }
  }, []);

  useEffect(() => {
    if (id) {
      fetchInspection();
      fetchLocations();
    }
  }, [id, fetchInspection, fetchLocations]);

  const handleSave = async () => {
    if (!inspection) return;

    try {
      setProcessing(true);
      await inspectionsAPI.update(Number(id), inspection);
      queryClient.invalidateQueries({ queryKey: ["inspections"] });
      router.refresh();
      toast({ title: "Success", description: "Inspection updated successfully" });
      fetchInspection();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.response?.data?.detail || "Failed to save changes",
        variant: "destructive"
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleTransition = async (action: string) => {
    if (!inspection) return;

    try {
      setProcessing(true);
      await inspectionsAPI.update(Number(id), inspection);

      switch (action) {
        case "INITIATE": await inspectionsAPI.initiate(Number(id)); break;
        case "SUBMIT_STOCK":
          if (inspection.department_hierarchy_level === 0) {
            await inspectionsAPI.submitToCentralRegister(Number(id));
          } else {
            await inspectionsAPI.submitToStockDetails(Number(id));
          }
          break;
        case "SUBMIT_CENTRAL": await inspectionsAPI.submitToCentralRegister(Number(id)); break;
        case "SUBMIT_FINANCE": await inspectionsAPI.submitToFinanceReview(Number(id)); break;
        case "COMPLETE": await inspectionsAPI.complete(Number(id)); break;
        case "REJECT": {
          const reason = prompt("Please enter a rejection reason:");
          if (!reason) { setProcessing(false); return; }
          await inspectionsAPI.reject(Number(id), reason);
          break;
        }
      }
      queryClient.invalidateQueries({ queryKey: ["inspections"] });
      router.refresh();
      toast({ title: "Success", description: "Workflow stage transitioned successfully" });
      fetchInspection();
    } catch (error: any) {
      console.error("Transition Error:", error);
      toast({
        title: "Transition Error",
        description: error.response?.data?.detail || "Failed to transition stage. Check if all required details and links are complete.",
        variant: "destructive"
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this draft inspection? This action cannot be undone.")) return;
    try {
      setProcessing(true);
      await inspectionsAPI.delete(Number(id));
      queryClient.invalidateQueries({ queryKey: ["inspections"] });
      router.refresh();
      toast({ title: "Success", description: "Draft inspection deleted successfully" });
      router.push("/inspections");
    } catch (error: any) {
      toast({
        title: "Delete Error",
        description: error.response?.data?.detail || "Failed to delete inspection.",
        variant: "destructive"
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleViewPDF = async () => {
    if (!inspection) return;

    try {
      setProcessing(true);
      await inspectionsAPI.update(Number(id), inspection);
      const res = await inspectionsAPI.viewPDF(Number(id));
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (error: any) {
      toast({ title: "PDF Error", description: "Failed to generate PDF certificate.", variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  };

  const currentConfig = useMemo(() => {
    if (!inspection) return STAGE_CONFIGS_MAP.DRAFT;
    return STAGE_CONFIGS_MAP[inspection.stage] || STAGE_CONFIGS_MAP.DRAFT;
  }, [inspection]);

  if (loading) return (
    <div className="flex items-center justify-center h-96 text-muted-foreground uppercase tracking-widest text-[10px] font-bold animate-pulse">
      Synchronizing lifecycle state...
    </div>
  );
  if (!inspection) return (
    <div className="flex items-center justify-center h-96 text-muted-foreground uppercase tracking-widest text-xs font-bold">
      Entry not found
    </div>
  );

  const displayStage = inspection.stage === "REJECTED" ? inspection.rejection_stage : inspection.stage;
  const currentStageIndex = displayStage === "DRAFT" ? -1 : STAGES_LIST.indexOf(displayStage);
  const CurrentStageIcon = currentConfig.icon;

  return (
    <AnimatedListingLayout
      title={`Certificate ${inspection.contract_no}`}
      subtitle={`${inspection.contractor_name} workflow lifecycle.`}
      statusCards={<></>}
    >
      <div className="space-y-4 max-w-7xl mx-auto">

        {/* ── Page Header ── */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
             <button
               type="button"
               onClick={() => router.push("/inspections")}
               className="w-9 h-9 flex items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:text-foreground hover:border-primary/30 shadow-card transition-all"
             >
               <ArrowLeft className="w-4 h-4" />
             </button>
            <div>
              <div className="flex items-center gap-2.5 mb-0.5">
                <h1 className="text-lg font-bold text-foreground tracking-tight leading-none">
                  Inspection Certificate
                </h1>
                <StatusBadge status={inspection.stage} />
              </div>
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                <span>ID: {inspection.id}</span>
                <span className="w-1 h-1 rounded-full bg-border" />
                <span>Contract: {inspection.contract_no}</span>
                {inspection.contractor_name && (
                  <>
                    <span className="w-1 h-1 rounded-full bg-border" />
                    <span>{inspection.contractor_name}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchInspection}
              className="flex items-center gap-1.5 h-9 px-3 text-[11px] font-semibold text-muted-foreground hover:text-foreground rounded-md hover:bg-muted transition-colors"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", processing && "animate-spin")} />
              Refresh
            </button>
            <button
              type="button"
              onClick={handleViewPDF}
              disabled={processing}
              className="flex items-center gap-1.5 h-9 px-3 text-[11px] font-semibold text-primary bg-navy-surface hover:bg-navy-muted rounded-md transition-colors"
            >
              <FileText className="w-3.5 h-3.5" />
              View PDF
            </button>

            {inspection.stage !== "COMPLETED" && inspection.stage !== "REJECTED" && !isStageReadOnly && (
              <>
                <div className="w-px h-6 bg-border mx-1" />
                {inspection.stage === 'DRAFT' ? (
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={processing}
                    className="flex items-center gap-1.5 h-9 px-3 text-[11px] font-semibold text-destructive hover:bg-red-50 rounded-md transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete Draft
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleTransition("REJECT")}
                    disabled={processing}
                    className="flex items-center gap-1.5 h-9 px-3 text-[11px] font-semibold text-destructive hover:bg-red-50 rounded-md transition-colors"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    Reject
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={processing}
                  className="flex items-center gap-1.5 h-9 px-3 text-[11px] font-bold uppercase tracking-widest border border-border bg-card text-foreground rounded-md shadow-card hover:border-primary/30 transition-colors"
                >
                  <Save className="w-3.5 h-3.5 text-muted-foreground" />
                  Save Progress
                </button>
              </>
            )}
          </div>
        </div>

        {/* ── Workflow Tracker ── */}
        <div className="bg-card border border-border rounded-xl p-5 shadow-card">
          <div className="flex items-center gap-2 mb-5">
            <div className="w-1 h-4 rounded bg-primary" />
            <h3 className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Inspection Lifecycle Progress</h3>
          </div>
          <WorkflowTracker
            stages={STAGES_LIST}
            currentStage={inspection.stage}
            rejectedStage={inspection.rejection_stage}
            isRejected={inspection.stage === "REJECTED"}
          />
        </div>

        {/* ── Rejection Warning ── */}
        {inspection.stage === "REJECTED" && (
          <div className="bg-red-50 border border-red-100 p-4 rounded-xl flex items-start gap-3">
            <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
            <div>
              <h4 className="text-xs font-bold uppercase tracking-widest text-destructive leading-none mb-1.5">Workflow Rejected</h4>
              <p className="text-sm text-red-700 italic">"{inspection.rejection_reason}"</p>
            </div>
          </div>
        )}

        {/* ── Certificate Information Card ── */}
        <div className="bg-card border border-border rounded-xl shadow-card overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border bg-muted/40 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-3.5 h-3.5 text-primary" />
              <h3 className="text-[11px] font-bold uppercase tracking-widest text-foreground">Certificate Information</h3>
            </div>
            <StatusBadge status={inspection.stage} />
          </div>
          <div className="p-5">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-5">
              <DetailItem label="Contract / Invoice No" value={inspection.contract_no} />
              <DetailItem label="Certificate Date" value={inspection.date} />
              <DetailItem label="Indent No" value={inspection.indent_no} />
              <DetailItem label="Indenter" value={inspection.indenter} />
              <DetailItem label="Location" value={locations.find(l => String(l.id) === String(inspection.department))?.name} />
              <DetailItem label="Contractor Name" value={inspection.contractor_name} />
              <DetailItem label="Delivery Received" value={inspection.date_of_delivery} />
              <DetailItem label="Delivery Type" value={inspection.delivery_type === "FULL" ? "Full Delivery" : "Partial Delivery"} isBadge />
              <DetailItem label="Inspected By" value={inspection.inspected_by} />
              <DetailItem label="Designation" value={inspection.consignee_designation} />
              <div className="lg:col-span-4 pt-1 border-t border-border">
                <span className="block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Remarks</span>
                <p className="text-sm text-foreground/70 leading-relaxed pl-4 border-l-2 border-primary/30 italic">
                  {inspection.remarks || "No supplementary remarks recorded."}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Supporting Documents ── */}
        {inspection.documents && inspection.documents.length > 0 && (
          <div className="bg-card border border-border rounded-xl shadow-card overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border bg-muted/40 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-3.5 h-3.5 text-primary" />
                <h3 className="text-[11px] font-bold uppercase tracking-widest text-foreground">Supporting Documents</h3>
              </div>
              <span className="px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-widest bg-navy-surface text-primary border border-navy-muted">
                {inspection.documents.length} Files
              </span>
            </div>
            <div className="p-5">
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {inspection.documents.map((doc: any) => (
                  <button
                    key={doc.id}
                    type="button"
                    className="group relative aspect-square rounded-xl border border-border overflow-hidden bg-muted/20 hover:border-primary/50 transition-all cursor-pointer shadow-card"
                    onClick={() => setSelectedDoc(doc)}
                  >
                    {isImage(doc.file) ? (
                      <img
                        src={doc.file}
                        alt={doc.label}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center">
                        <FileText className="w-8 h-8 text-muted-foreground/40 mb-2" />
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-tighter truncate w-full px-2">
                          {doc.label || 'PDF Document'}
                        </span>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-background/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <span className="w-8 h-8 rounded-full bg-card border border-border flex items-center justify-center shadow-card">
                        <Eye className="w-4 h-4 text-foreground" />
                      </span>
                      <a
                        href={doc.file}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="w-8 h-8 rounded-full bg-card border border-border flex items-center justify-center text-foreground hover:bg-muted transition-colors shadow-card"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Active Stage Form ── */}
        <div className="bg-card border border-border rounded-xl shadow-card overflow-hidden">
          {/* Stage Header */}
          <div className="px-5 py-3.5 border-b border-border flex items-center justify-between bg-muted/20">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center text-primary-foreground shadow-card">
                <CurrentStageIcon className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-foreground tracking-tight leading-none mb-0.5">
                  {currentConfig.label}
                </h2>
                <p className="text-[10px] text-muted-foreground font-medium">
                  {currentStageIndex >= 0
                    ? `Stage ${currentStageIndex + 1} of ${STAGES_LIST.length} in the inspection lifecycle`
                    : "Draft — pending initiation"}
                </p>
              </div>
            </div>
          </div>

          {/* Dynamic Form Area */}
          <div className="p-6">
            {inspection.stage === "DRAFT" && (
                <Stage1Form
                  data={inspection}
                  onChange={setInspection}
                  locations={locations}
                  readOnly={inspection.status !== 'DRAFT'}
                />
              )}
            {inspection.stage === "STOCK_DETAILS" && (
              <Stage2Form data={inspection} onChange={setInspection} readOnly={isStageReadOnly} />
            )}
            {inspection.stage === "CENTRAL_REGISTER" && (
              <Stage3Form data={inspection} onChange={setInspection} readOnly={isStageReadOnly} />
            )}
            {inspection.stage === "FINANCE_REVIEW" && (
              <Stage4Form data={inspection} onChange={setInspection} readOnly={isStageReadOnly} />
            )}

            {(inspection.stage === "COMPLETED" || inspection.stage === "REJECTED") && (
              <div className="space-y-4">
                {/* Items Summary Card */}
                <div className="bg-muted/30 border border-border p-4 rounded-xl">
                  <div className="flex items-center gap-2 mb-4">
                    <Package className="w-4 h-4 text-primary" />
                    <h3 className="text-[11px] font-black uppercase tracking-widest text-foreground">Inspection Items</h3>
                    <span className="ml-auto px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold">
                      {inspection.items?.length || 0} items
                    </span>
                  </div>

                  {/* Scrollable Items List */}
                  <div className="max-h-[500px] overflow-y-auto pr-2 space-y-3">
                    {(inspection.items || []).map((item: any, index: number) => (
                      <div
                        key={item.id || index}
                        className="bg-card border border-border rounded-lg p-4 hover:border-primary/30 transition-all"
                      >
                        <div className="flex items-start justify-between gap-4">
                          {/* Item Info */}
                          <div className="flex items-start gap-3 flex-1 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary text-xs font-bold shrink-0">
                              {index + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="text-sm font-bold text-foreground truncate">
                                {item.item_description || item.item_name || 'Unnamed Item'}
                              </h4>
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[10px]">
                                <span className="text-muted-foreground">
                                  <span className="font-semibold text-success">{item.accepted_quantity || 0}</span> accepted
                                </span>
                                {item.rejected_quantity > 0 && (
                                  <span className="text-muted-foreground">
                                    <span className="font-semibold text-destructive">{item.rejected_quantity}</span> rejected
                                  </span>
                                )}
                                {item.unit && (
                                  <span className="text-muted-foreground capitalize">{item.unit}</span>
                                )}
                              </div>

                              {/* Additional Details */}
                              <div className="flex flex-wrap gap-3 mt-2 text-[10px]">
                                {item.unit_price && (
                                  <span className="px-2 py-0.5 rounded bg-muted text-muted-foreground font-medium">
                                    Rs. {parseFloat(item.unit_price).toLocaleString('en-PK', { minimumFractionDigits: 2 })}/unit
                                  </span>
                                )}
                                {item.stock_register_no && (
                                  <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-medium border border-blue-100">
                                    Stock Reg: {item.stock_register_no}
                                  </span>
                                )}
                                {item.central_register_no && (
                                  <span className="px-2 py-0.5 rounded bg-purple-50 text-purple-700 font-medium border border-purple-100">
                                    Central Reg: {item.central_register_no}
                                  </span>
                                )}
                                {item.batch_number && (
                                  <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 font-medium border border-amber-100">
                                    Batch: {item.batch_number}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Total Value */}
                          <div className="text-right shrink-0">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total</p>
                            <p className="text-sm font-bold text-foreground">
                              {item.unit_price && item.accepted_quantity
                                ? `Rs. ${(parseFloat(item.unit_price) * parseInt(item.accepted_quantity)).toLocaleString('en-PK', { minimumFractionDigits: 2 })}`
                                : '-'}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Summary Footer */}
                  {(inspection.items || []).length > 0 && (
                    <div className="mt-4 pt-4 border-t border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-4 text-[10px] font-bold">
                        <span className="text-foreground">
                          Total Items: <span className="font-black">{inspection.items.length}</span>
                        </span>
                        <span className="text-success">
                          Accepted: <span className="font-black">{inspection.items.reduce((sum: number, i: any) => sum + (i.accepted_quantity || 0), 0)}</span>
                        </span>
                        {inspection.items.reduce((sum: number, i: any) => sum + (i.rejected_quantity || 0), 0) > 0 && (
                          <span className="text-destructive">
                            Rejected: <span className="font-black">{inspection.items.reduce((sum: number, i: any) => sum + (i.rejected_quantity || 0), 0)}</span>
                          </span>
                        )}
                      </div>
                      <div className="text-sm font-black text-foreground">
                        Total Value: Rs. {inspection.total_value
                          ? parseFloat(inspection.total_value).toLocaleString('en-PK', { minimumFractionDigits: 2 })
                          : inspection.items.reduce((sum: number, i: any) => sum + ((parseFloat(i.unit_price || 0) * (i.accepted_quantity || 0))), 0).toLocaleString('en-PK', { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Cycle Finalized Message */}
                <div className="py-8 flex flex-col items-center text-center space-y-3">
                  <div className={cn(
                    "w-14 h-14 rounded-2xl flex items-center justify-center text-white",
                    inspection.stage === "COMPLETED"
                      ? "bg-success shadow-lg"
                      : "bg-destructive shadow-lg"
                  )}>
                    {inspection.stage === "COMPLETED"
                      ? <ShieldCheck className="w-7 h-7" />
                      : <XCircle className="w-7 h-7" />}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-foreground uppercase tracking-tight">
                      {inspection.stage === "COMPLETED" ? "Cycle Completed" : "Cycle Rejected"}
                    </h3>
                    <p className="text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed mt-1">
                      {inspection.stage === "COMPLETED"
                        ? "This entry has been archived. All financial and registry mappings are locked for audit compliance."
                        : "This entry was rejected. Please review the rejection reason and create a new entry if needed."}
                    </p>
                  </div>
                </div>
              </div>
            )}


            {/* ── Stage Transition Control ── */}
            {inspection.stage !== "COMPLETED" && inspection.stage !== "REJECTED" && (
              <div className="mt-8 pt-6 border-t border-border flex justify-end">
                {inspection.stage === "DRAFT" && canInitiate && (
                  <Button
                    onClick={() => handleTransition("INITIATE")}
                    disabled={processing}
                    className="flex items-center gap-2 h-10 px-6 text-[11px] font-bold uppercase tracking-widest bg-primary text-primary-foreground rounded-md shadow-card transition-all"
                  >
                    <Rocket className="w-4 h-4" />
                    Initiate Workflow
                  </Button>
                )}
                {inspection.stage === "STOCK_DETAILS" && canFillStockDetails && (
                  <Button
                    onClick={() => handleTransition("SUBMIT_CENTRAL")}
                    disabled={processing}
                    className="flex items-center gap-2 h-10 px-6 text-[11px] font-bold uppercase tracking-widest bg-primary text-primary-foreground rounded-md shadow-card transition-all"
                  >
                    Submit to Central
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                )}
                {inspection.stage === "CENTRAL_REGISTER" && canFillCentralRegister && (
                  <Button
                    onClick={() => handleTransition("SUBMIT_FINANCE")}
                    disabled={processing}
                    className="flex items-center gap-2 h-10 px-6 text-[11px] font-bold uppercase tracking-widest bg-primary text-primary-foreground rounded-md shadow-card transition-all"
                  >
                    Submit to Finance
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                )}
                {inspection.stage === "FINANCE_REVIEW" && canReviewFinance && (
                  <Button
                    onClick={() => handleTransition("COMPLETE")}
                    disabled={processing}
                    className="flex items-center gap-2 h-10 px-6 text-[11px] font-bold uppercase tracking-widest bg-success text-white rounded-md shadow-card transition-all"
                  >
                    Final Approval
                    <ShieldCheck className="w-4 h-4" />
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Document Lightbox ── */}
      <Dialog open={!!selectedDoc} onOpenChange={(open) => !open && setSelectedDoc(null)}>
        <DialogContent className="max-w-4xl p-0 overflow-hidden bg-black/95 border-none">
          <DialogHeader className="p-4 bg-white/5 backdrop-blur-md absolute top-0 left-0 right-0 z-10 border-b border-white/10">
            <DialogTitle className="text-white text-xs font-bold uppercase tracking-widest flex items-center justify-between">
              <span>{selectedDoc?.label || 'Document Viewer'}</span>
              <a href={selectedDoc?.file} download className="p-2 rounded-lg hover:bg-white/10 transition-colors">
                <Download className="w-4 h-4" />
              </a>
            </DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center min-h-[60vh] p-4 pt-16">
            {selectedDoc && (
              isImage(selectedDoc.file) ? (
                <img
                  src={selectedDoc.file}
                  alt={selectedDoc.label}
                  className="max-w-full max-h-[80vh] object-contain shadow-2xl"
                />
              ) : (
                <iframe
                  src={selectedDoc.file}
                  className="w-full h-[80vh] rounded-lg bg-white"
                  title={selectedDoc.label}
                />
              )
            )}
          </div>
        </DialogContent>
      </Dialog>
    </AnimatedListingLayout>
  );
}
