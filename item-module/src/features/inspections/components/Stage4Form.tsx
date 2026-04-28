import React from "react";
import {
  CheckCircle2,
  FileText,
  Truck,
  UserCheck,
  ShieldCheck,
  Lock,
  BadgeCheck,
  Link2,
  Hash,
  Package,
  XCircle,
  Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Stage4FormProps {
  data: any;
  onChange: (data: any) => void;
  readOnly?: boolean;
}

export function Stage4Form({ data, onChange, readOnly }: Stage4FormProps) {
  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-500">

      {/* ── Status Summary Chips ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-muted/30 border border-border flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-card flex items-center justify-center text-success border border-border shadow-card shrink-0">
            <BadgeCheck className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-foreground leading-none">Stock Details Added</h4>
            <p className="text-[10px] text-muted-foreground mt-1 font-medium italic">Dept entries complete.</p>
          </div>
        </div>
        <div className="p-4 rounded-xl bg-muted/30 border border-border flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-card flex items-center justify-center text-primary border border-border shadow-card shrink-0">
            <Link2 className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-foreground leading-none">Catalog Linked</h4>
            <p className="text-[10px] text-muted-foreground mt-1 font-medium italic">Master SKUs mapped.</p>
          </div>
        </div>
        <div className="p-4 rounded-xl bg-muted/30 border border-border flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-card flex items-center justify-center text-primary border border-border shadow-card shrink-0">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-foreground leading-none">Ready for Settlement</h4>
            <p className="text-[10px] text-muted-foreground mt-1 font-medium italic">Finance clearance pending.</p>
          </div>
        </div>
      </div>

      {/* ── Quantity Summary ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card border border-border p-4 rounded-xl space-y-2">
          <div className="flex items-center gap-2">
            <FileText className="w-3.5 h-3.5 text-muted-foreground/40" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Total Asset Lot</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-foreground tracking-tight">{data.items?.length || 0}</span>
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Total Items</span>
          </div>
        </div>
        <div className="bg-card border border-border p-4 rounded-xl space-y-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-success" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Provenance Cleared</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-success tracking-tight">
              {data.items?.reduce((acc: number, item: any) => acc + (item.accepted_quantity || 0), 0)}
            </span>
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Total Accepted</span>
          </div>
        </div>
        <div className="bg-card border border-border p-4 rounded-xl space-y-2">
          <div className="flex items-center gap-2">
            <XCircle className="w-3.5 h-3.5 text-destructive" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Rejection Audit</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-destructive tracking-tight">
              {data.items?.reduce((acc: number, item: any) => acc + (item.rejected_quantity || 0), 0)}
            </span>
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Total Rejected</span>
          </div>
        </div>
      </div>

      {/* ── Finance Settlement Check Date — Prominent Required Field ── */}
      <div className="border-2 border-primary rounded-xl overflow-hidden">
        <div className="bg-primary px-5 py-3 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-primary-foreground" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-primary-foreground">Finance Settlement Check Date</span>
          <span className="ml-auto text-[10px] font-bold uppercase tracking-widest text-primary-foreground/60">Required</span>
        </div>
        <div className="px-5 py-4 bg-navy-surface flex flex-col md:flex-row items-start md:items-center gap-4">
          <p className="text-[11px] text-muted-foreground flex-1">
            Enter the date on which the finance settlement check was performed for this inspection certificate.
          </p>
          <div className="w-full md:w-52 shrink-0">
            {readOnly ? (
              <span className="text-sm font-bold text-foreground">{data.finance_check_date || "—"}</span>
            ) : (
              <input
                type="date"
                value={data.finance_check_date || ""}
                onChange={(e) => onChange({ ...data, finance_check_date: e.target.value })}
                className="w-full h-10 px-3 text-sm font-semibold text-foreground bg-card border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/60 transition-colors"
              />
            )}
          </div>
        </div>
      </div>

      {/* ── Certificate & Verification Cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Certificate Summary */}
        <div className="bg-card border border-border rounded-xl p-5 shadow-card">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="w-3.5 h-3.5 text-primary" />
            <h4 className="text-[11px] font-bold uppercase tracking-widest text-foreground">Certificate Summary</h4>
          </div>
          <div className="grid grid-cols-2 gap-y-4 gap-x-6">
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground block mb-1">Contract No</span>
              <p className="text-sm font-semibold text-foreground uppercase truncate">{data.contract_no}</p>
            </div>
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground block mb-1">Execution Date</span>
              <p className="text-sm font-semibold text-foreground">{data.contract_date || "—"}</p>
            </div>
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground block mb-1">Cost Center</span>
              <p className="text-sm font-semibold text-foreground uppercase truncate">{data.department_name}</p>
            </div>
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground block mb-1">Business Unit</span>
              <p className="text-sm font-semibold text-foreground uppercase truncate">{data.contractor_name}</p>
            </div>
          </div>
        </div>

        {/* Verification Details */}
        <div className="bg-card border border-border rounded-xl p-5 shadow-card">
          <div className="flex items-center gap-2 mb-4">
            <UserCheck className="w-3.5 h-3.5 text-primary" />
            <h4 className="text-[11px] font-bold uppercase tracking-widest text-foreground">Verification Details</h4>
          </div>
          <div className="grid grid-cols-2 gap-y-4 gap-x-6">
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground block mb-1">Inspected By</span>
              <p className="text-sm font-semibold text-foreground truncate">{data.inspected_by || "—"}</p>
            </div>
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground block mb-1">Inspection Date</span>
              <p className="text-sm font-semibold text-foreground">{data.date_of_inspection || "—"}</p>
            </div>
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground block mb-1">Consignee Name</span>
              <p className="text-sm font-semibold text-foreground truncate">{data.consignee_name || "—"}</p>
            </div>
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground block mb-1">Designation</span>
              <p className="text-sm font-semibold text-foreground truncate">{data.consignee_designation || "—"}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Logistics & Remarks ── */}
      <div className="bg-card border border-border rounded-xl p-5 shadow-card">
        <div className="flex items-center gap-2 mb-4">
          <Truck className="w-3.5 h-3.5 text-primary" />
          <h4 className="text-[11px] font-bold uppercase tracking-widest text-foreground">Logistics & Remarks</h4>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground block mb-1">Fulfillment Date</span>
            <p className="text-sm font-semibold text-foreground">{data.date_of_delivery || "—"}</p>
          </div>
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground block mb-1">Fulfillment Type</span>
            <span className="inline-flex items-center px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-widest bg-navy-surface text-primary border border-navy-muted">
              {data.delivery_type} Delivery
            </span>
          </div>
        </div>
        <div className="p-3.5 bg-muted/20 border border-border rounded-xl">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-2">Internal Inspection Remarks</span>
          <p className="text-sm text-foreground/70 leading-relaxed italic">
            {data.remarks || "No supplementary remarks recorded."}
          </p>
        </div>
      </div>

      {/* ── Summary Audit Ledger ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.15em]">Summary Audit Ledger</h4>
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold text-primary bg-navy-surface border border-navy-muted uppercase tracking-widest">
            <Hash className="w-3 h-3" />
            {data.items?.length || 0} Assets Reconciled
          </span>
        </div>

        <div className="border border-border rounded-xl overflow-hidden bg-card shadow-card">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                {["Item Description", "Unit Price", "Accepted Qty", "Registry Mapping", "Audit Coordinates"].map(h => (
                  <th key={h} className="px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(data.items || []).filter((i: any) => i.accepted_quantity > 0).map((item: any, idx: number) => (
                <tr key={idx} className="hover:bg-muted/20 transition-colors">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-muted border border-border flex items-center justify-center">
                        <Package className="w-3.5 h-3.5 text-muted-foreground" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-foreground uppercase block leading-tight">{item.item_description}</span>
                        {item.rejected_quantity > 0 && (
                          <span className="text-[9px] font-bold uppercase text-destructive bg-red-50 px-1.5 py-0.5 rounded border border-destructive/20 mt-1 inline-block">
                            {item.rejected_quantity} Rejected
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <span className="text-xs font-semibold text-muted-foreground">PKR {item.unit_price?.toLocaleString()}</span>
                  </td>
                  <td className="px-5 py-4">
                    <span className="inline-flex items-center justify-center h-7 px-3 rounded-md bg-success-muted text-success text-xs font-bold border border-success/20">
                      {item.accepted_quantity}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <div>
                      <p className="text-xs font-bold text-foreground uppercase truncate leading-tight">{item.item_name}</p>
                      <p className="text-[10px] font-bold text-primary font-mono tracking-widest">{item.item_code}</p>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="space-y-0.5">
                      <p className="text-[10px] text-muted-foreground font-medium">
                        Stock: <span className="text-foreground font-semibold">{item.stock_register_no}</span>
                      </p>
                      <p className="text-[10px] text-muted-foreground font-medium">
                        Central: <span className="text-foreground font-semibold">{item.central_register_no}</span>
                      </p>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {(data.items || []).filter((i: any) => i.accepted_quantity > 0).length === 0 && (
            <div className="p-12 text-center text-muted-foreground/40 italic text-[10px] uppercase tracking-widest">
              No accounting assets present in this cycle.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
