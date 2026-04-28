import React, { useState, useEffect } from "react";
import { Search, Link2, Package, Info, ChevronRight, Layers, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { inventoryService, Item, Category, StockRegister, Location } from "@/features/inventory/services/inventory";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { ItemModal } from "@/features/inventory/components/ItemModal";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Stage3FormProps {
  data: any;
  onChange: (data: any) => void;
  readOnly?: boolean;
}

export function Stage3Form({ data, onChange, readOnly }: Stage3FormProps) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Item[]>([]);
  const [activeItemIndex, setActiveItemIndex] = useState<number | null>(null);
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [centralRegisters, setCentralRegisters] = useState<StockRegister[]>([]);

  useEffect(() => {
    fetchCategories();
    fetchCentralRegisters();
  }, []);

  const fetchCentralRegisters = async () => {
    try {
      const locations = await inventoryService.getLocations();
      const centralStore = locations.find(l => l.code === 'CENTRAL-STORE' || l.name.toLowerCase() === 'central store');
      if (centralStore) {
        const registers = await inventoryService.getStockRegisters(centralStore.id);
        setCentralRegisters(registers);
      }
    } catch (error) {
      console.error("Failed to fetch central registers:", error);
    }
  };

  const fetchCategories = async () => {
    try {
      const cats = await inventoryService.getCategories();
      setCategories(cats);
    } catch (error) {
      console.error("Failed to fetch categories:", error);
    }
  };

  const handleItemChange = (index: number, field: string, value: any) => {
    const newItems = [...(data.items || [])];
    newItems[index] = { ...newItems[index], [field]: value };
    onChange({ ...data, items: newItems });
  };

  const performSearch = async (val: string) => {
    setSearch(val);
    if (val.length < 2) {
      setSearchResults([]);
      return;
    }
    const results = await inventoryService.getItems(); 
    setSearchResults(results.filter(i => 
      i.name.toLowerCase().includes(val.toLowerCase()) || 
      i.code.toLowerCase().includes(val.toLowerCase())
    ));
  };

  const linkItem = (index: number, systemItem: Item) => {
    const newItems = [...(data.items || [])];
    newItems[index] = { 
      ...newItems[index], 
      item: systemItem.id,
      item_name: systemItem.name,
      item_code: systemItem.code
    };
    onChange({ ...data, items: newItems });
    setSearchResults([]);
    setSearch("");
    setActiveItemIndex(null);
  };

  const handleCreateNewItem = async (formData: any) => {
    try {
      const newItem = await inventoryService.createItem(formData);
      toast({ title: "Success", description: "Master Item created effectively." });
      
      // Auto-link if we have an active index
      if (activeItemIndex !== null) {
        linkItem(activeItemIndex, newItem);
      }
      setIsModalOpen(false);
    } catch (error: any) {
      toast({ 
        title: "Linkage Error", 
        description: error.response?.data?.detail || "Failed to create master item", 
        variant: "destructive" 
      });
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="bg-muted/30 border border-border p-3.5 rounded-xl flex items-center gap-3 mb-2">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20 shrink-0">
          <Link2 className="w-4 h-4 text-primary" />
        </div>
        <div>
          <h3 className="text-[11px] font-black uppercase tracking-widest text-foreground leading-none mb-1">Master Catalog Linkage</h3>
          <p className="text-[10px] text-muted-foreground italic">Map each item to the system Master Catalog and record central register coordinates.</p>
        </div>
      </div>

      <div className="space-y-4">
        {(data.items || []).filter((i: any) => i.accepted_quantity > 0).map((item: any, index: number) => (
          <div key={index} className="group overflow-hidden bg-card border border-border rounded-2xl p-5 transition-all duration-300 shadow-sm relative">
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary/10 transition-colors" />
            
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
              {/* Asset Mapping (LHS) */}
              <div className="xl:col-span-8 space-y-4">
                <div className="flex items-center gap-2 pb-1.5 border-b border-border">
                  <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest leading-none">Inspection Item</Label>
                  <Separator orientation="vertical" className="h-2.5 bg-border" />
                  <span className="text-[10px] font-bold text-foreground font-black uppercase tracking-widest flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-success" />
                    Accepted: {item.accepted_quantity}
                  </span>
                </div>
                
                <div className="flex flex-col md:flex-row gap-6 md:items-center">
                  <div className="flex-1 p-3 rounded-xl bg-muted/20 border border-border">
                    <div className="flex justify-between items-start gap-2 mb-1.5">
                      <h4 className="text-sm font-bold text-foreground uppercase leading-tight">{item.item_description}</h4>
                      {item.rejected_quantity > 0 && (
                        <span className="shrink-0 px-2 py-0.5 rounded-full bg-destructive/10 text-destructive border border-destructive/20 text-[9px] font-black uppercase tracking-widest">
                          {item.rejected_quantity} Rejected
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground italic truncate mb-1" title={item.item_specifications}>
                      {item.item_specifications || "No specs recorded."}
                    </p>
                    {item.rejected_quantity > 0 && item.remarks && (
                      <div className="mt-2 pt-2 border-t border-border">
                        <p className="text-[9px] font-black text-destructive uppercase tracking-widest mb-0.5">Rejection Reason:</p>
                        <p className="text-[10px] text-muted-foreground italic leading-tight">{item.remarks}</p>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-center text-border">
                     <ChevronRight className="w-4 h-4 md:rotate-0 rotate-90" />
                  </div>

                  <div className="flex-1">
                    {item.item ? (
                      <div className="flex items-center justify-between p-3 rounded-xl bg-primary/5 border border-primary/10 shadow-sm transition-all h-full">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-background flex items-center justify-center text-primary border border-primary/20">
                             <Package className="w-5 h-5" />
                          </div>
                          <div className="space-y-0.5">
                            <p className="text-xs font-black text-foreground uppercase truncate max-w-[150px]">{item.item_name}</p>
                            <p className="text-[10px] text-primary font-mono font-bold leading-none">{item.item_code}</p>
                          </div>
                        </div>
                        {!readOnly && (
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-8 px-2 rounded-lg text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            onClick={() => handleItemChange(index, "item", null)}
                          >
                            Reset
                          </Button>
                        )}
                      </div>
                    ) : !readOnly ? (
                      <div className="flex flex-col gap-2 relative">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
                          <Input 
                            placeholder="Search Items"
                            className="pl-9 h-10 text-xs text font-bold uppercase tracking-wider"
                            value={activeItemIndex === index ? search : ""}
                            onChange={(e) => {
                              setActiveItemIndex(index);
                              performSearch(e.target.value);
                            }}
                            onFocus={() => setActiveItemIndex(index)}
                          />
                          {activeItemIndex === index && search.length >= 2 && (
                            <div className="absolute z-50 top-full left-0 right-0 mt-2 bg-card border border-border rounded-xl shadow-2xl overflow-hidden animate-in slide-in-from-top-1 min-w-[300px]">
                               {searchResults.length > 0 ? (
                                 <div className="max-h-60 overflow-y-auto p-1">
                                   {searchResults.map(res => (
                                     <button
                                       key={res.id}
                                       type="button"
                                       className="w-full p-2.5 text-left hover:bg-muted rounded-lg flex items-center justify-between group/result transition-colors"
                                       onClick={() => linkItem(index, res)}
                                     >
                                       <div className="flex items-center gap-3">
                                         <div className="w-9 h-9 rounded-lg bg-background flex items-center justify-center border border-border group-hover/result:border-primary/30 group-hover/result:text-primary">
                                           <Package className="w-4 h-4 text-muted-foreground/40 transition-colors" />
                                         </div>
                                         <div>
                                           <p className="text-[11px] font-bold text-foreground uppercase">{res.name}</p>
                                           <p className="text-[10px] text-muted-foreground font-mono">{res.code}</p>
                                         </div>
                                       </div>
                                       <ChevronRight className="w-4 h-4 text-border group-hover/result:translate-x-1 group-hover/result:text-primary transition-all" />
                                     </button>
                                   ))}
                                 </div>
                               ) : (
                                 <div className="p-6 text-center">
                                   <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                                     <Search className="w-5 h-5 text-muted-foreground/20" />
                                   </div>
                                   <p className="text-xs text-muted-foreground font-medium italic">
                                     No SKU found for "{search}"
                                   </p>
                                 </div>
                               )}
                            </div>
                          )}
                        </div>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => {
                            setActiveItemIndex(index);
                            setIsModalOpen(true);
                          }}
                          className="h-8 text-[9px] font-black uppercase tracking-widest text-primary hover:bg-primary/5 gap-1.5 justify-start px-3"
                        >
                          <Plus className="w-3 h-3" />
                          Create Master Item & Link
                        </Button>
                      </div>
                    ) : (
                      <div className="p-3 bg-muted/20 border border-border border-dashed rounded-xl flex items-center gap-3 text-muted-foreground/30 text-[10px] font-black uppercase tracking-widest italic h-full min-h-[56px]">
                        <Info className="w-4 h-4 shrink-0" />
                        Awaiting Linkage
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Master Register Data (RHS) */}
              <div className="xl:col-span-4 bg-muted/30 p-4 rounded-2xl border border-border flex flex-col justify-center gap-3">
                 <div className="flex items-center gap-2 pb-2 border-b border-border">
                    <Layers className="w-3.5 h-3.5 text-primary" />
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-foreground">Master Registry Coordinate</h4>
                 </div>
                 
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                       <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider ml-0.5">Register #</Label>
                       <Select 
                        value={item.central_register ? String(item.central_register) : ""} 
                        onValueChange={(val) => {
                          const reg = centralRegisters.find(r => r.id === val);
                          if (reg) {
                            const newItems = [...(data.items || [])];
                            newItems[index] = { 
                              ...newItems[index], 
                              central_register: val,
                              central_register_no: reg.registerNumber 
                            };
                            onChange({ ...data, items: newItems });
                          }
                        }}
                        disabled={readOnly}
                      >
                        <SelectTrigger className="h-10 text-xs font-bold uppercase tracking-wider">
                          <SelectValue placeholder="Register" />
                        </SelectTrigger>
                        <SelectContent>
                          {centralRegisters.length > 0 ? (
                            centralRegisters.map(reg => (
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
                       <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider ml-0.5">Page Ref</Label>
                       <Input 
                        value={item.central_register_page_no || ""}
                        onChange={(e) => handleItemChange(index, "central_register_page_no", e.target.value)}
                        disabled={readOnly}
                        className="h-10 text-sm"
                        placeholder="156"
                      />
                    </div>
                 </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <ItemModal 
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        categories={categories}
        onSave={handleCreateNewItem}
      />
    </div>
  );
}
