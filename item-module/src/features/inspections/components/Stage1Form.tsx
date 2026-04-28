import React from "react";
import { Plus, Trash2, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface Stage1FormProps {
  data: any;
  onChange: (data: any) => void;
  locations: any[];
  readOnly?: boolean;
}

export function Stage1Form({ data, onChange, readOnly }: Stage1FormProps) {
  const handleItemChange = (index: number, field: string, value: any) => {
    const newItems = [...(data.items || [])];
    newItems[index] = { ...newItems[index], [field]: value };
    onChange({ ...data, items: newItems });
  };

  const addItem = () => {
    const newItems = [
      ...(data.items || []),
      {
        item_description: "",
        item_specifications: "",
        tendered_quantity: 1,
        accepted_quantity: 0,
        rejected_quantity: 0,
        unit_price: 0,
        remarks: ""
      }
    ];
    onChange({ ...data, items: newItems });
  };

  const removeItem = (index: number) => {
    const newItems = data.items.filter((_: any, i: number) => i !== index);
    onChange({ ...data, items: newItems });
  };

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="flex items-center justify-between pb-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Package className="w-4 h-4 text-primary" />
          <h3 className="text-[11px] font-bold uppercase tracking-widest text-foreground">Inspection Items</h3>
        </div>
        {!readOnly && (
          <button
            type="button"
            onClick={addItem}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-primary bg-navy-surface hover:bg-navy-muted border border-navy-muted rounded-md transition-colors"
          >
            <Plus className="w-3 h-3" />
            Add Item
          </button>
        )}
      </div>

      <div className="space-y-3">
        {(data.items || []).map((item: any, index: number) => (
          <div
            key={index}
            className={cn(
              "relative border rounded-lg p-5 transition-all",
              item.rejected_quantity > 0
                ? "border-destructive/20 bg-red-50/30"
                : "border-border bg-card"
            )}
          >
            {/* Left border stripe */}
            <div
              className="absolute left-0 top-0 bottom-0 w-0.5 rounded-l-lg"
              style={{ background: item.rejected_quantity > 0 ? "hsl(var(--destructive))" : "hsl(var(--primary))" }}
            />

            {/* Item header */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Item #{index + 1}
                </span>
                {item.rejected_quantity > 0 && (
                  <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest bg-red-100 text-destructive border border-destructive/20">
                    {item.rejected_quantity} Rejected
                  </span>
                )}
              </div>
              {!readOnly && data.items.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeItem(index)}
                  className="p-1.5 rounded-md text-muted-foreground/40 hover:text-destructive hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Description & Specs */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Item Description <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={item.item_description || ""}
                  onChange={(e) => handleItemChange(index, "item_description", e.target.value)}
                  disabled={readOnly}
                  placeholder="e.g. DELL LATITUDE 5440"
                  className="font-semibold"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Technical Specifications</Label>
                <Input
                  value={item.item_specifications || ""}
                  onChange={(e) => handleItemChange(index, "item_specifications", e.target.value)}
                  disabled={readOnly}
                  placeholder="Model, brand, tech specs..."
                />
              </div>
            </div>

            {/* Quantities & Price */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Tendered Qty</Label>
                <Input
                  type="number"
                  min="1"
                  value={item.tendered_quantity}
                  onChange={(e) => handleItemChange(index, "tendered_quantity", parseInt(e.target.value) || 0)}
                  disabled={readOnly}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-semibold uppercase tracking-widest text-success">Accepted Qty</Label>
                <Input
                  type="number"
                  value={item.accepted_quantity}
                  onChange={(e) => handleItemChange(index, "accepted_quantity", parseInt(e.target.value) || 0)}
                  disabled={readOnly}
                  className="bg-success-muted border-success/30 text-success focus-visible:ring-success/20"
                />
              </div>
              <div className="space-y-1.5">
                <Label className={cn(
                  "text-[10px] font-semibold uppercase tracking-widest",
                  item.rejected_quantity > 0 ? "text-destructive" : "text-muted-foreground"
                )}>Rejected Qty</Label>
                <Input
                  type="number"
                  value={item.rejected_quantity}
                  onChange={(e) => handleItemChange(index, "rejected_quantity", parseInt(e.target.value) || 0)}
                  disabled={readOnly}
                  className={cn(
                    item.rejected_quantity > 0
                      ? "bg-red-50 border-destructive/30 text-destructive focus-visible:ring-destructive/20"
                      : ""
                  )}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Unit Price (PKR)</Label>
                <Input
                  type="number"
                  value={item.unit_price}
                  onChange={(e) => handleItemChange(index, "unit_price", parseFloat(e.target.value) || 0)}
                  disabled={readOnly}
                />
              </div>
            </div>

            {/* Remarks / Rejection reason */}
            {item.rejected_quantity > 0 ? (
              <div className="space-y-1.5 animate-in zoom-in-95 duration-200">
                <Label className="text-[10px] font-semibold uppercase tracking-widest text-destructive">
                  Reason for Rejection <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={item.remarks || ""}
                  onChange={(e) => handleItemChange(index, "remarks", e.target.value)}
                  disabled={readOnly}
                  className="border-destructive/30 bg-red-50/50"
                  placeholder="Please specify why these items were rejected..."
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Line Remarks (Optional)</Label>
                <Input
                  value={item.remarks || ""}
                  onChange={(e) => handleItemChange(index, "remarks", e.target.value)}
                  disabled={readOnly}
                  placeholder="Notes for this item..."
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
