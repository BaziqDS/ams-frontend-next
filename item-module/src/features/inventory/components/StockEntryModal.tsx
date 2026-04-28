import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { inventoryService, Item, Location, Person } from "@/features/inventory/services/inventory";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Package } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

interface StockEntryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingEntry?: any;
}

export function StockEntryModal({ open, onOpenChange, existingEntry }: StockEntryModalProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [entryType, setEntryType] = useState<string>("ISSUE");
  const [issueToType, setIssueToType] = useState<"PERSON" | "STORE" | "NON_STORE">("PERSON");
  const [returnFromType, setReturnFromType] = useState<"PERSON" | "NON_STORE">("PERSON");
  const [fromLocation, setFromLocation] = useState<string>("");

  const [toLocation, setToLocation] = useState<string>("");
  const [issuedTo, setIssuedTo] = useState<string>("");
  const [remarks, setRemarks] = useState("");
  const [items, setItems] = useState<any[]>([{ item: "", quantity: 1, batch: "" }]);

  const { data: locations = [] } = useQuery({
    queryKey: ["locations"],
    queryFn: () => inventoryService.getLocations(),
  });

  const { data: inventoryItems = [] } = useQuery({
    queryKey: ["items"],
    queryFn: () => inventoryService.getItems(),
  });

  const { data: persons = [] } = useQuery({
    queryKey: ["persons"],
    queryFn: () => inventoryService.getPersons(),
  });

  const { data: stockRecords = [] } = useQuery({
    queryKey: ["stock-records", fromLocation],
    queryFn: () => (fromLocation && fromLocation !== "none" ? inventoryService.getLocationInventory(fromLocation) : []),
    enabled: !!fromLocation && fromLocation !== "none" && entryType !== "RECEIPT",
  });

  const { data: activeAllocations = [] } = useQuery({
    queryKey: ["active-allocations", returnFromType, returnFromType === "PERSON" ? issuedTo : fromLocation, toLocation],
    queryFn: () => {
      const params: any = { status: "ALLOCATED" };
      if (returnFromType === "PERSON") params.person = issuedTo;
      else params.location = fromLocation;
      if (toLocation && toLocation !== "none") params.source_location = toLocation;
      return inventoryService.getStockAllocations(params);
    },
    enabled: entryType === "RECEIPT" && (returnFromType === "PERSON" ? !!issuedTo : !!fromLocation) && !!toLocation && toLocation !== "none",
  });

  // Initialize from existing entry
  useEffect(() => {
    if (open && existingEntry) {
      setEntryType(existingEntry.entryType);
      setRemarks(existingEntry.remarks || "");
      setFromLocation(existingEntry.fromLocation || "");
      
      if (existingEntry.toLocation) {
        const loc = locations.find(l => l.id === existingEntry.toLocation);
        if (loc?.isStore) {
          setIssueToType("STORE");
        } else {
          setIssueToType("NON_STORE");
        }
        setToLocation(existingEntry.toLocation);
      } else if (existingEntry.issuedTo) {
        setIssueToType("PERSON");
        setIssuedTo(existingEntry.issuedTo);
      }
      
      setItems(existingEntry.items.map((i: any) => ({
        item: i.item,
        quantity: i.quantity,
        batch: i.batch || ""
      })));
    } else if (open && !existingEntry) {
      resetForm();
    }
  }, [open, existingEntry, locations]);

  // Filter items based on availability at source location for ISSUE/TRANSFER
  const availableInventoryItems = useMemo(() => {
    if (entryType === "RECEIPT" || !fromLocation || fromLocation === "none") return inventoryItems;
    
    // Only show items that exist in the stock records for the selected location with > 0 quantity
    const itemsInStockIds = stockRecords
      .filter(r => r.quantity > 0)
      .map(r => r.item);
    
    return inventoryItems.filter(item => itemsInStockIds.includes(item.id));
  }, [entryType, fromLocation, inventoryItems, stockRecords]);

  // Helper to get available batches for a specific item at the fromLocation
  const getAvailableBatches = (itemId: string) => {
    if (!fromLocation || fromLocation === "none") return [];
    return stockRecords.filter(r => r.item === itemId && r.quantity > 0);
  };

  // Hierarchical Scope Queries
  const { data: transferrableLocations = [] } = useQuery({
    queryKey: ["locations", "transferrable", fromLocation],
    queryFn: () => (fromLocation && fromLocation !== "none" ? inventoryService.getTransferrableLocations(fromLocation) : []),
    enabled: !!fromLocation && fromLocation !== "none" && entryType === "ISSUE" && issueToType === "STORE",
  });

  const { data: allocatableTargets } = useQuery({
    queryKey: ["locations", "allocatable", fromLocation],
    queryFn: () => (fromLocation && fromLocation !== "none" ? inventoryService.getAllocatableTargets(fromLocation) : { locations: [], persons: [] }),
    enabled: !!fromLocation && fromLocation !== "none" && entryType === "ISSUE",
  });

  const stores = useMemo(() => locations.filter(loc => loc.isStore), [locations]);
  
  const hierarchicalPersons = useMemo(() => {
    if (entryType === "ISSUE") {
        return allocatableTargets?.persons || [];
    }
    return persons;
  }, [entryType, allocatableTargets, persons]);

  const hierarchicalNonStores = useMemo(() => {
    if (entryType === "ISSUE" && allocatableTargets) {
        return allocatableTargets.locations;
    }
    return locations.filter(loc => !loc.isStore && !loc.isStandalone);
  }, [entryType, allocatableTargets, locations]);

  // Stores that the user is explicitly assigned to
  const assignedStores = useMemo(() => {
    if (!user || user.is_superuser) return stores;
    const assignedIds = user.assigned_locations.map(String);
    return stores.filter(loc => assignedIds.includes(loc.id));
  }, [user, stores]);

  // Filter "From Locations"
  const availableFromLocations = useMemo(() => {
    if (entryType === "ISSUE") {
        return assignedStores;
    } else {
        // In returns, source can be any person or room in department
        // (UI handles Person vs NonStore explicitly)
        return locations; 
    }
  }, [entryType, assignedStores, locations]);

  // Filter "To Locations"
  const availableToLocations = useMemo(() => {
    if (entryType === "RECEIPT") {
        return assignedStores;
    } else {
        return transferrableLocations;
    }
  }, [entryType, assignedStores, transferrableLocations]);

  useEffect(() => {
    if (!open || existingEntry) return;
    if (entryType === "ISSUE") {
        if (assignedStores.length === 1 && !fromLocation) {
            setFromLocation(assignedStores[0].id);
        }
    } else {
        if (assignedStores.length === 1 && !toLocation) {
            setToLocation(assignedStores[0].id);
        }
    }
  }, [open, entryType, assignedStores, fromLocation, toLocation, existingEntry]);

  useEffect(() => {
    if (fromLocation && entryType === "ISSUE" && !availableFromLocations.find(l => l.id === fromLocation)) {
        setFromLocation("");
    }
    if (toLocation && entryType === "RECEIPT" && !availableToLocations.find(l => l.id === toLocation)) {
        setToLocation("");
    }
  }, [fromLocation, toLocation, entryType, availableFromLocations, availableToLocations]);

  const isFromLocationDisabled = entryType === "ISSUE" && assignedStores.length === 1 && !user?.is_superuser;
  const isToLocationDisabled = entryType === "RECEIPT" && assignedStores.length === 1 && !user?.is_superuser;

  const createMutation = useMutation({
    mutationFn: (data: any) => inventoryService.createStockEntry(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock-entries"] });
      toast({ title: "Success", description: "Stock entry created successfully" });
      onOpenChange(false);
      resetForm();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.detail || "Failed to create stock entry",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: any) => inventoryService.updateStockEntry(existingEntry.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock-entries"] });
      queryClient.invalidateQueries({ queryKey: ["stock-entries", existingEntry.id] });
      toast({ title: "Success", description: "Draft entry updated successfully" });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.detail || "Failed to update draft",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setEntryType("ISSUE");
    setIssueToType("PERSON");
    setReturnFromType("PERSON");
    if (assignedStores.length === 1 && !user?.is_superuser) {
        setFromLocation(assignedStores[0].id);
    } else {
        setFromLocation("");
    }
    setToLocation("");
    setIssuedTo("");
    setRemarks("");
    setItems([{ item: "", quantity: 1, batch: "" }]);
  };

  const handleAddItem = () => {
    setItems([...items, { item: "", quantity: 1, batch: "" }]);
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: string, value: any) => {
    const newItems = [...items];
    
    if (field === "item" && entryType === "RECEIPT") {
      // In return mode, value is the Allocation ID
      const alloc = activeAllocations.find(a => a.id === value);
      if (alloc) {
        newItems[index].item = alloc.item;
        newItems[index].batch = alloc.batch || "none";
        newItems[index].quantity = alloc.quantity;
        
        // Auto-set the destination store to the source of the allocation
        if (alloc.sourceLocation) {
          setToLocation(alloc.sourceLocation);
        }
      } else {
        newItems[index].item = value;
      }
    } else {
      newItems[index][field] = value;
      
      if (field === "item") {
        newItems[index].batch = "";
        const itemBatches = getAvailableBatches(value);
        if (itemBatches.length === 1) {
          newItems[index].batch = itemBatches[0].batch;
        }
      }
    }
    setItems(newItems);
  };

  const handleSubmit = (e: React.FormEvent, targetStatus?: string) => {
    if (e) e.preventDefault();
    
    // Validation
    for (const item of items) {
      if (!item.item || item.quantity <= 0) {
        toast({ title: "Invalid Items", description: "Please select items and valid quantities", variant: "destructive" });
        return;
      }
      const itemDef = inventoryItems.find(i => i.id === item.item);
      if (itemDef?.trackingType === "BATCH" && !item.batch && entryType !== "RECEIPT") {
        toast({ title: "Batch Required", description: `Please select a batch for ${itemDef.name}`, variant: "destructive" });
        return;
      }
    }

    let finalStatus = targetStatus;
    if (!finalStatus) {
        if (entryType === "ISSUE") {
            // Only issues to other stores require acknowledgment (PENDING_ACK)
            // Issues to Persons or Non-Stores are finalized immediately (COMPLETED)
            finalStatus = (issueToType === "STORE") ? "PENDING_ACK" : "COMPLETED";
        } else {
            finalStatus = "COMPLETED";
        }
    }
    
    const payload = {
      entryType,
      entryDate: existingEntry ? existingEntry.entryDate : new Date().toISOString(),
      status: finalStatus,
      fromLocation: (fromLocation === "none" || !fromLocation) ? null : fromLocation,
      toLocation: (toLocation === "none" || !toLocation) ? null : toLocation,
      issuedTo: ((entryType === "ISSUE" && issueToType === "PERSON") || (entryType === "RECEIPT" && returnFromType === "PERSON"))
        ? (issuedTo === "none" || !issuedTo ? null : issuedTo) 
        : null,
      remarks,
      items: items.map(item => ({
        ...item,
        batch: item.batch === "none" || !item.batch ? null : item.batch
      })),
    };

    if (existingEntry) {
      updateMutation.mutate(payload);
    } else {
      createMutation.mutate(payload);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto p-0 gap-0">
        <DialogTitle className="sr-only">{existingEntry ? `Edit Draft: ${existingEntry.entryNumber}` : "New Stock Entry"}</DialogTitle>
        <div className="bg-institutional px-6 py-4 flex items-center gap-3 rounded-t-lg sticky top-0 z-10">
          <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
            <Package className="w-4 h-4 text-white" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white tracking-wide">{existingEntry ? `Edit Draft: ${existingEntry.entryNumber}` : "New Stock Entry"}</h2>
            <p className="text-[10px] text-white/50 uppercase tracking-widest font-medium">Stock movement and allocation</p>
          </div>
        </div>

        <form onSubmit={(e) => handleSubmit(e)} className="space-y-4 py-4 px-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Entry Type</Label>
              <Select value={entryType} onValueChange={setEntryType} disabled={!!existingEntry}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ISSUE">Issue / Allocation</SelectItem>
                  <SelectItem value="RECEIPT">Return from Allocation</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Remarks</Label>
              <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Optional notes" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{entryType === "RECEIPT" ? "Return From" : "From Location"}</Label>
              {entryType === "RECEIPT" ? (
                <div className="flex gap-2">
                  <Select value={returnFromType} onValueChange={(v: any) => {
                    setReturnFromType(v);
                    setIssuedTo("");
                    setFromLocation("");
                    setItems([{ item: "", quantity: 1, batch: "" }]);
                  }}>
                    <SelectTrigger className="w-[120px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PERSON">Person</SelectItem>
                      <SelectItem value="NON_STORE">Non-Store</SelectItem>
                    </SelectContent>
                  </Select>
                  
                  {returnFromType === "PERSON" ? (
                    <Select value={issuedTo} onValueChange={(v) => {
                      setIssuedTo(v);
                      setItems([{ item: "", quantity: 1, batch: "" }]);
                    }}>
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Select person" />
                      </SelectTrigger>
                      <SelectContent>
                        {hierarchicalPersons.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Select value={fromLocation} onValueChange={(v) => {
                      setFromLocation(v);
                      setItems([{ item: "", quantity: 1, batch: "" }]);
                    }}>
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Select location" />
                      </SelectTrigger>
                      <SelectContent>
                        {hierarchicalNonStores.map((loc) => (
                          <SelectItem key={loc.id} value={loc.id}>
                            {loc.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              ) : (
                <Select 
                  value={fromLocation} 
                  onValueChange={setFromLocation}
                  disabled={isFromLocationDisabled}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select source" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableFromLocations.map((loc) => (
                      <SelectItem key={loc.id} value={loc.id}>
                        {loc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-2">
              <Label>{entryType === "RECEIPT" ? "Return To / Destination" : "Issue To"}</Label>
              <div className={`flex gap-2 ${entryType === "RECEIPT" ? "hidden" : "block"}`}>
                <Select value={issueToType} onValueChange={(v: any) => setIssueToType(v)}>
                  <SelectTrigger className="w-[120px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PERSON">Person</SelectItem>
                    <SelectItem value="STORE">Store</SelectItem>
                    <SelectItem value="NON_STORE">Non-Store</SelectItem>
                  </SelectContent>
                </Select>
                {issueToType === "PERSON" ? (
                  <Select value={issuedTo} onValueChange={setIssuedTo}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Select person" />
                    </SelectTrigger>
                    <SelectContent>
                      {hierarchicalPersons.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : issueToType === "STORE" ? (
                  <Select value={toLocation} onValueChange={setToLocation}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Select store" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableToLocations.map((loc) => (
                        <SelectItem key={loc.id} value={loc.id}>
                          {loc.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Select value={toLocation} onValueChange={setToLocation}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Select location" />
                    </SelectTrigger>
                    <SelectContent>
                      {hierarchicalNonStores.map((loc) => (
                        <SelectItem key={loc.id} value={loc.id}>
                          {loc.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {entryType === "RECEIPT" && (
                <Select value={toLocation} onValueChange={(v) => {
                  setToLocation(v);
                  setItems([{ item: "", quantity: 1, batch: "" }]);
                }}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Target store" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableToLocations.map((loc) => (
                      <SelectItem key={loc.id} value={loc.id}>
                        {loc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">Items</Label>
              {entryType !== "RECEIPT" && (
                <Button type="button" variant="outline" size="sm" onClick={handleAddItem}>
                  <Plus className="w-4 h-4 mr-1" /> Add Item
                </Button>
              )}
            </div>

            {(entryType === "RECEIPT" && ((returnFromType === "PERSON" && !!issuedTo) || (returnFromType === "NON_STORE" && !!fromLocation)) && !!toLocation && toLocation !== "none") ? (
              <div className="space-y-3">
                <div className="text-sm font-medium text-muted-foreground bg-accent/20 p-2 rounded flex items-center gap-2">
                  <Package className="w-4 h-4" />
                  {activeAllocations.length > 0 
                    ? `Available Allocations (${activeAllocations.length})` 
                    : "No active allocations found for this source and destination"}
                </div>
                <div className="grid gap-2">
                  {activeAllocations.map((alloc) => {
                    const isSelected = items.some(i => i.allocationId === alloc.id);
                    return (
                      <div 
                        key={alloc.id} 
                        className={`flex items-center justify-between p-3 border rounded-lg transition-colors ${
                          isSelected ? "bg-primary/5 border-primary" : "bg-white"
                        }`}
                      >
                        <div className="flex-1">
                          <div className="font-medium">{alloc.itemName}</div>
                          <div className="text-xs text-muted-foreground">
                            {alloc.batchNumber ? `Batch: ${alloc.batchNumber}` : "No Batch"} • {alloc.quantity} units held
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {isSelected && (
                            <div className="w-24">
                              <Input
                                type="number"
                                size={1}
                                className="h-8 py-0 px-2 text-xs"
                                min="1"
                                max={alloc.quantity}
                                value={items.find(i => i.allocationId === alloc.id)?.quantity || ""}
                                onChange={(e) => {
                                  const qty = parseInt(e.target.value) || 0;
                                  setItems(items.map(i => i.allocationId === alloc.id ? { ...i, quantity: qty } : i));
                                }}
                              />
                            </div>
                          )}
                          <Button
                            type="button"
                            variant={isSelected ? "secondary" : "outline"}
                            size="sm"
                            className="h-8"
                            onClick={() => {
                              if (isSelected) {
                                setItems(items.filter(i => i.allocationId !== alloc.id));
                              } else {
                                const newItems = items.filter(i => i.item !== "");
                                newItems.push({
                                  allocationId: alloc.id,
                                  item: alloc.item,
                                  batch: alloc.batch || "none",
                                  quantity: alloc.quantity
                                });
                                setItems(newItems);
                              }
                            }}
                          >
                            {isSelected ? "Remove" : "Return Item"}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : entryType === "RECEIPT" ? (
              <div className="p-8 text-center border border-dashed rounded-lg text-muted-foreground bg-accent/10">
                <p className="text-sm">Please select a "Return From" and "Return To" location to view available allocations.</p>
              </div>
            ) : (
              items.map((item, index) => (
                <div key={index} className="flex gap-3 items-end p-3 border rounded-lg bg-accent/30">
                  <div className="flex-[2] space-y-2">
                    <Label className="text-xs">Item</Label>
                    <Select value={item.item} onValueChange={(v) => handleItemChange(index, "item", v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select item" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableInventoryItems.map((inv) => {
                          const totalStockAtSource = stockRecords
                            .filter(r => r.item === inv.id)
                            .reduce((sum, r) => sum + r.quantity, 0);
                          return (
                            <SelectItem key={inv.id} value={inv.id}>
                              {inv.name} (Available: {totalStockAtSource} {inv.acctUnit})
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>

                  {inventoryItems.find(i => i.id === item.item)?.trackingType === "BATCH" && (
                    <div className="flex-1 space-y-2">
                      <Label className="text-xs">Batch</Label>
                      <Select value={item.batch} onValueChange={(v) => handleItemChange(index, "batch", v)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select batch" />
                        </SelectTrigger>
                        <SelectContent>
                          {getAvailableBatches(item.item).map((record) => (
                            <SelectItem key={record.batch} value={record.batch || ""}>
                              {record.batchNumber} ({record.quantity} available)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="w-20 space-y-2">
                    <Label className="text-xs">Qty</Label>
                    <Input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(e) => handleItemChange(index, "quantity", parseInt(e.target.value) || 0)}
                    />
                  </div>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-destructive"
                    onClick={() => handleRemoveItem(index)}
                    disabled={items.length === 1}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <div className="flex gap-2">
              <Button 
                type="button" 
                variant="secondary" 
                onClick={(e) => handleSubmit(e as any, "DRAFT")}
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {existingEntry ? "Update Draft" : "Save as Draft"}
              </Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {createMutation.isPending || updateMutation.isPending ? "Saving..." : (existingEntry ? "Finalize & Submit" : "Create Stock Entry")}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
