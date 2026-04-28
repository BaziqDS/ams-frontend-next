import React, { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Package, Hash, Calendar, Layers } from "lucide-react";
import { inventoryService, StockRegister, Location } from "@/features/inventory/services/inventory";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Stage2FormProps {
  data: any;
  onChange: (data: any) => void;
  readOnly?: boolean;
}

export function Stage2Form({ data, onChange, readOnly }: Stage2FormProps) {
  const [registers, setRegisters] = useState<StockRegister[]>([]);

  useEffect(() => {
    fetchDepartmentRegisters();
  }, [data.department]);

  const fetchDepartmentRegisters = async () => {
    if (!data.department) return;
    try {
      const locations = await inventoryService.getLocations();
      const departmentLoc = locations.find(l => String(l.id) === String(data.department));
      
      if (departmentLoc && departmentLoc.autoCreatedStore) {
        const regs = await inventoryService.getStockRegisters(departmentLoc.autoCreatedStore);
        setRegisters(regs);
      }
    } catch (error) {
      console.error("Failed to fetch department registers:", error);
    }
  };

  const handleItemChange = (index: number, field: string, value: any) => {
    const newItems = [...(data.items || [])];
    newItems[index] = { ...newItems[index], [field]: value };
    onChange({ ...data, items: newItems });
  };

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="bg-muted/30 border border-border p-3.5 rounded-xl flex items-center gap-3 mb-2">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20 shrink-0">
          <Layers className="w-4 h-4 text-primary" />
        </div>
        <div>
          <h3 className="text-[11px] font-black uppercase tracking-widest text-foreground leading-none mb-1">Department Register Recording</h3>
          <p className="text-[10px] text-muted-foreground italic">Enter stock register coordinates for each accepted item.</p>
        </div>
      </div>

      <div className="space-y-3">
        {(data.items || []).filter((i: any) => i.accepted_quantity > 0).map((item: any, index: number) => (
          <div key={index} className="group bg-card border border-border rounded-xl p-4 transition-all duration-300 shadow-sm relative overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary/20 transition-colors" />
            
            <div className="flex flex-col md:flex-row md:items-center gap-6">
              <div className="flex items-center gap-4 min-w-[240px] flex-1">
                <div className="w-10 h-10 rounded-lg bg-muted/30 flex items-center justify-center text-muted-foreground border border-border group-hover:bg-primary/5 transition-colors">
                  <Package className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold text-foreground uppercase truncate">{item.item_description}</h4>
                    {item.rejected_quantity > 0 && (
                      <span className="shrink-0 px-2 py-0.5 rounded-full bg-destructive/10 text-destructive border border-destructive/20 text-[9px] font-black uppercase tracking-widest">
                        {item.rejected_quantity} Rejected
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest flex items-center gap-1.5">
                    <span className="w-1 h-1 rounded-full bg-success" />
                    Accepted: {item.accepted_quantity}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 flex-[2]">
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider ml-0.5">Register Ref #</Label>
                  <Select 
                    value={item.stock_register ? String(item.stock_register) : ""} 
                    onValueChange={(val) => {
                      const reg = registers.find(r => r.id === val);
                      if (reg) {
                        const newItems = [...(data.items || [])];
                        newItems[index] = { 
                          ...newItems[index], 
                          stock_register: val,
                          stock_register_no: reg.registerNumber 
                        };
                        onChange({ ...data, items: newItems });
                      }
                    }}
                    disabled={readOnly}
                  >
                    <SelectTrigger className="h-10 text-xs font-bold uppercase tracking-wider">
                      <SelectValue placeholder="Select Register" />
                    </SelectTrigger>
                    <SelectContent>
                      {registers.length > 0 ? (
                        registers.map(reg => (
                          <SelectItem key={reg.id} value={reg.id} className="text-xs font-bold uppercase">
                            {reg.registerNumber} ({reg.registerType})
                          </SelectItem>
                        ))
                      ) : (
                        <div className="p-2 text-[10px] text-muted-foreground italic text-center">No registers found</div>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider ml-0.5">Page No</Label>
                  <Input 
                    value={item.stock_register_page_no || ""}
                    onChange={(e) => handleItemChange(index, "stock_register_page_no", e.target.value)}
                    disabled={readOnly}
                    className="h-10 text-sm"
                    placeholder="42"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider ml-0.5">Recording Date</Label>
                  <Input 
                    type="date"
                    value={item.stock_entry_date || ""}
                    onChange={(e) => handleItemChange(index, "stock_entry_date", e.target.value)}
                    disabled={readOnly}
                    className="h-10 text-sm"
                  />
                </div>
              </div>
            </div>
          </div>
        ))}
        
        {(data.items || []).filter((i: any) => i.accepted_quantity === 0).length > 0 && (
          <div className="p-3.5 rounded-xl bg-muted/20 border border-border border-dashed text-center">
            <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">
              Rejected/Zero assets are omitted from ledger recording.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
