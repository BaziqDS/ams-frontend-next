"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { inventoryService } from "@/features/inventory/services/inventory";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Edit,
  Package,
  User as UserIcon,
  MapPin,
  Trash2,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { CancelEntryModal } from "@/components/modals/CancelEntryModal";
import { AnimatedListingLayout } from "@/components/dashboard/AnimatedListingLayout";
import { cn } from "@/lib/utils";

export default function StockEntryDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showCancelModal, setShowCancelModal] = useState(false);

  const { data: entry, isLoading, error, refetch } = useQuery({
    queryKey: ["stock-entries", id],
    queryFn: () => (id ? inventoryService.getStockEntry(id) : null),
    enabled: !!id,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => inventoryService.deleteStockEntry(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock-entries"] });
      router.refresh();
      toast({ title: "Success", description: "Draft entry deleted" });
      router.push("/stock-entries");
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (reason: string) =>
      inventoryService.cancelStockEntry(entry?.id || "", reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock-entries"] });
      router.refresh();
      toast({ title: "Success", description: "Entry cancelled" });
      setShowCancelModal(false);
      refetch();
    },
  });

  if (isLoading)
    return (
      <AnimatedListingLayout title="Stock Entry" subtitle="" statusCards={<></>}>
        <div className="flex items-center justify-center h-96 text-muted-foreground uppercase tracking-widest text-[10px] font-bold animate-pulse">
          Retrieving Registry State...
        </div>
      </AnimatedListingLayout>
    );

  if (error || !entry)
    return (
      <AnimatedListingLayout title="Stock Entry" subtitle="" statusCards={<></>}>
        <div className="flex flex-col items-center justify-center h-96 space-y-4">
          <AlertCircle className="w-12 h-12 text-destructive opacity-20" />
          <p className="text-muted-foreground uppercase tracking-widest text-xs font-bold">
            Registry Entry Not Found
          </p>
          <button
            type="button"
            onClick={() => router.push("/stock-entries")}
            className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
          >
            Return to Ledger
          </button>
        </div>
      </AnimatedListingLayout>
    );

  const statusCfg: Record<string, { label: string; badgeClass: string; footerIcon?: boolean }> = {
    DRAFT: { label: "Draft", badgeClass: "border-border text-muted-foreground bg-muted" },
    PENDING_ACK: { label: "In Transit", badgeClass: "border-navy-muted text-primary bg-navy-surface" },
    COMPLETED: { label: "Completed", badgeClass: "border-success/30 text-success bg-success-muted", footerIcon: true },
    CANCELLED: { label: "Voided", badgeClass: "border-destructive/20 text-destructive bg-red-50" },
  };
  const cfg = statusCfg[entry.status] ?? { label: entry.status, badgeClass: "border-border/60 text-white/60 bg-white/5" };

  const totalQty: number = entry.items.reduce((acc: number, i: any) => acc + (i.quantity ?? 0), 0);

  const entryTypeLabel =
    entry.entryType === "ISSUE" ? "Issue / Allocation" :
      entry.entryType === "RECEIPT" ? "Receipt" : entry.entryType;

  const itemsLabel = entry.entryType === "RECEIPT" ? "Received Items" : "Issued Items";
  const totalLabel = entry.entryType === "RECEIPT" ? "Total Quantity Received" : "Total Quantity Issued";

  const isIssue = entry.entryType === "ISSUE";
  const isReceiptSide = ["RECEIPT", "RETURN"].includes(entry.entryType);
  const isCompleted = entry.status === "COMPLETED";

  const originName = isReceiptSide 
    ? (entry.issuedToName || entry.fromLocationName || "—") 
    : (entry.fromLocationName || "—");

  const recipientName = isReceiptSide
    ? (entry.toLocationName || "—")
    : (entry.issuedToName || entry.toLocationName || "—");

  const originSubtitle = isReceiptSide && entry.issuedToName 
    ? "Individual" 
    : isReceiptSide 
      ? "Store / Location" 
      : entry.entryType;

  const recipientSubtitle = (isReceiptSide)
    ? "Store / Location"
    : entry.issuedToName 
      ? "Individual" 
      : entry.toLocationName 
        ? "Store / Location" 
        : "—";

  const tableColumns = isIssue
    ? ["No.", "Item", "Qty", "Issue Register", "Page"]
    : ["No.", "Item", "Qty", "Receipt Register", "Page"];

  return (
    <AnimatedListingLayout title={`Stock Entry ${entry.entryNumber}`} subtitle="Detailed movement log for stock operations." statusCards={<></>}>
      <div className="max-w-5xl mx-auto pb-8">

        {/* ── Top nav bar ── */}
        <div className="flex items-center justify-between mb-6">
          <button
            type="button"
            onClick={() => router.push("/stock-entries")}
            className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            All Stock Entries
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => refetch()}
              className="flex items-center gap-2 h-9 px-4 text-[11px] font-bold uppercase tracking-widest text-muted-foreground border border-border rounded-lg hover:bg-muted transition-colors shadow-card"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </button>

            {entry.status === "DRAFT" && (
              <>
                <button
                  type="button"
                  onClick={() => router.push(`/stock-entries/new?edit=${entry.id}`)}
                  className="flex items-center gap-2 h-9 px-4 text-[11px] font-bold uppercase tracking-widest text-foreground border border-border rounded-lg hover:bg-muted transition-colors shadow-card"
                >
                  <Edit className="w-3.5 h-3.5" />
                  Modify
                </button>
                <button
                  type="button"
                  onClick={() => deleteMutation.mutate(entry.id)}
                  className="flex items-center gap-2 h-9 px-4 text-[11px] font-bold uppercase tracking-widest text-destructive border border-destructive/30 rounded-lg hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Void Draft
                </button>
              </>
            )}

            {entry.status === "PENDING_ACK" && entry.canAcknowledge && (
              <button
                type="button"
                onClick={() => router.push(`/stock-entries/${entry.id}/acknowledge`)}
                className="flex items-center gap-2 h-9 px-5 text-[11px] font-bold uppercase tracking-widest bg-primary text-primary-foreground rounded-lg shadow-elevated hover:bg-primary/90 transition-all"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Acknowledge Handover
              </button>
            )}

            {entry.status !== "COMPLETED" && entry.status !== "CANCELLED" && (
              <button
                type="button"
                onClick={() => setShowCancelModal(true)}
                className="flex items-center gap-2 h-9 px-4 text-[11px] font-bold uppercase tracking-widest text-destructive border border-destructive/30 rounded-lg hover:bg-red-50 transition-colors"
              >
                <XCircle className="w-3.5 h-3.5" />
                Cancel Entry
              </button>
            )}
          </div>
        </div>

        {/* ── Main document card ── */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-card relative">

          {/* ── Header ── */}
          <div className="px-8 pt-7 pb-7 border-b border-border">
            {/* Top accent strip */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-primary rounded-t-2xl" />

            {/* Label + status badge */}
            <div className="flex items-start justify-between mb-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                Stock Movement Order
              </p>
              <span className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1 rounded border text-[10px] font-bold uppercase tracking-widest",
                cfg.badgeClass
              )}>
                <CheckCircle2 className="w-3 h-3" />
                {cfg.label}
              </span>
            </div>

            {/* Entry number */}
            <h1 className="text-3xl font-bold text-foreground tracking-tight mb-6 leading-none">
              {entry.entryNumber}
            </h1>

            {/* Origin ──→ Recipient */}
            <div className="flex items-center gap-4">
              {/* Origin */}
              <div className="flex-1 bg-muted/40 rounded-xl px-4 py-3 border border-border">
                <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground mb-2">Origin</p>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-card border border-border flex items-center justify-center text-primary">
                    {isReceiptSide && entry.issuedToName ? <UserIcon className="w-4 h-4" /> : <MapPin className="w-4 h-4" />}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground leading-tight">{originName}</p>
                    <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground mt-0.5">{originSubtitle}</p>
                  </div>
                </div>
              </div>

              {/* Arrow connector */}
              <div className="flex items-center gap-2 shrink-0">
                <div className="h-px w-8 bg-border" />
                <div className="w-7 h-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <ArrowRight className="w-3.5 h-3.5 text-primary" />
                </div>
                <div className="h-px w-8 bg-border" />
              </div>

              {/* Recipient */}
              <div className="flex-1 bg-muted/40 rounded-xl px-4 py-3 border border-border">
                <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground mb-2">Recipient</p>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-card border border-border flex items-center justify-center text-primary">
                    {!isReceiptSide && entry.issuedToName ? <UserIcon className="w-4 h-4" /> : <MapPin className="w-4 h-4" />}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground leading-tight">
                      {recipientName}
                    </p>
                    <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground mt-0.5">{recipientSubtitle}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Stats bar ── */}
          <div className="grid grid-cols-4 divide-x divide-border border-b border-border">
            {[
              {
                label: "Entry Date",
                value: new Date(entry.entryDate).toLocaleDateString("en-PK", {
                  day: "2-digit", month: "short", year: "numeric",
                }),
              },
              { label: "Entry Type", value: entryTypeLabel },
              { label: "Recorded By", value: entry.createdByName || "System Automata" },
              {
                label: "Total Items",
                value: `${entry.items.length} ${entry.items.length === 1 ? "ITEM" : "ITEMS"}`,
              },
            ].map(({ label, value }) => (
              <div key={label} className="px-6 py-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">{label}</p>
                <p className="text-sm font-bold text-foreground">{value}</p>
              </div>
            ))}
          </div>

          {/* ── Items table ── */}
          <div className="px-8 py-6">
            {/* Section label */}
            <div className="flex items-center gap-2 mb-5">
              <Package className="w-3.5 h-3.5 text-muted-foreground" />
              <h3 className="text-[11px] font-bold uppercase tracking-widest text-foreground">{itemsLabel}</h3>
            </div>

            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  {tableColumns.map((col) => (
                    <th
                      key={col}
                      className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground pb-3 text-left pr-4 last:pr-0"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {entry.items.map((item: any, idx: number) => (
                  <tr key={item.id ?? `${item.item}-${idx}`}>
                    {/* # */}
                    <td className="py-4 pr-4">
                      <span className="w-6 h-6 rounded-full bg-muted border border-border inline-flex items-center justify-center text-[10px] font-bold text-muted-foreground shrink-0">
                        {idx + 1}
                      </span>
                    </td>

                    {/* Item name */}
                    <td className="py-4 pr-4">
                      <p className="text-sm font-semibold text-foreground whitespace-nowrap">
                        {item.itemName}
                      </p>
                    </td>

                    {/* Qty */}
                    <td className="py-4 pr-4">
                      <span className="w-8 h-8 rounded-full border-2 border-border inline-flex items-center justify-center text-sm font-bold text-foreground shrink-0">
                        {item.quantity}
                      </span>
                    </td>

                    {/* Issue / Receipt Register */}
                    <td className="py-4 pr-4">
                      <p className="text-sm font-bold text-foreground whitespace-nowrap">
                        {isIssue ? (item.stockRegisterName ?? "—") : (item.ackStockRegisterName ?? item.stockRegisterName ?? "—")}
                      </p>
                    </td>

                    {/* Issue / Receipt Page */}
                    <td className="py-4 pr-4">
                      <p className="text-sm font-bold text-foreground">{isIssue ? (item.pageNumber ?? "—") : (item.ackPageNumber ?? item.pageNumber ?? "—")}</p>
                    </td>


                  </tr>
                ))}
              </tbody>
            </table>

            {/* Total row */}
            <div className="mt-5 pt-5 border-t border-border flex items-center justify-end gap-3">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                {totalLabel}
              </span>
              <span className="text-2xl font-bold text-foreground leading-none">{totalQty}</span>
              <span className="text-sm font-bold text-muted-foreground">Units</span>
            </div>
          </div>

          {/* ── Remarks ── */}
          {entry.remarks && (
            <div className="px-8 pb-6">
              <div className="p-4 bg-muted/30 rounded-lg border border-border">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">Remarks</p>
                <p className="text-sm text-muted-foreground italic">{entry.remarks}</p>
              </div>
            </div>
          )}

          {/* ── Cancellation notice ── */}
          {entry.status === "CANCELLED" && (
            <div className="px-8 pb-6">
              <div className="p-4 bg-red-50 border border-destructive/20 rounded-lg flex items-start gap-3">
                <XCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-destructive mb-1">Entry Voided</p>
                  <p className="text-sm text-destructive/80">
                    Reason: <span className="font-normal">{entry.cancellationReason}</span>
                  </p>
                  <p className="text-[10px] text-destructive/60 font-bold uppercase tracking-tight mt-1">
                    Voided by {entry.cancelledByName} ·{" "}
                    {entry.cancelledAt ? format(new Date(entry.cancelledAt), "PPp") : "Unknown Time"}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ── Footer ── */}
          <div className="px-8 py-4 bg-muted/20 border-t border-border flex items-center justify-between">
            <p className="text-[11px] text-muted-foreground">
              Recorded on{" "}
              <span className="font-bold text-foreground">
                {new Date(entry.entryDate).toLocaleDateString("en-PK", {
                  day: "2-digit", month: "short", year: "numeric",
                })}{" "}
                at{" "}
                {new Date(entry.entryDate).toLocaleTimeString("en-PK", {
                  hour: "2-digit", minute: "2-digit",
                })}
              </span>{" "}
              · System reference{" "}
              <span className="font-mono font-bold text-foreground">{entry.entryNumber}</span>
            </p>

            {entry.status === "COMPLETED" && (
              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-success">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Ledger Finalized
              </div>
            )}

            {entry.status === "PENDING_ACK" && (
              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-primary">
                <RefreshCw className="w-3.5 h-3.5" />
                Awaiting Acknowledgment
              </div>
            )}

            {entry.status === "DRAFT" && (
              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                <AlertCircle className="w-3.5 h-3.5" />
                Pending Submission
              </div>
            )}
          </div>
        </div>

      </div>

      <CancelEntryModal
        open={showCancelModal}
        onOpenChange={setShowCancelModal}
        entryId={entry.id}
        entryNumber={entry.entryNumber}
        onConfirm={(reason) => cancelMutation.mutate(reason)}
        isSubmitting={cancelMutation.isPending}
      />
    </AnimatedListingLayout>
  );
}
