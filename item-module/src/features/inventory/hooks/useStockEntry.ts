import { useState, useMemo, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { inventoryService, Person, Location } from "@/features/inventory/services/inventory";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { EntryItem } from "../types/stockEntry";

export function useStockEntry() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const editId = searchParams?.get("edit");
    const { toast } = useToast();
    const { user } = useAuth();
    const queryClient = useQueryClient();

    // Header State
    const [entryType, setEntryType] = useState<string>("ISSUE");
    const [issueToType, setIssueToType] = useState<"PERSON" | "STORE" | "NON_STORE">("PERSON");
    const [returnFromType, setReturnFromType] = useState<"PERSON" | "NON_STORE">("PERSON");
    const [fromLocation, setFromLocation] = useState<string>("");
    const [toLocation, setToLocation] = useState<string>("");
    const [issuedTo, setIssuedTo] = useState<string>("");
    const [remarks, setRemarks] = useState("");

    // Items State
    const [items, setItems] = useState<EntryItem[]>([
        { id: Math.random().toString(36).substr(2, 9), item: "", quantity: 1, batch: null, instances: [], stockRegister: "", pageNumber: null }
    ]);

    // Data Queries
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

    const { data: existingEntry, isLoading: isLoadingEntry } = useQuery({
        queryKey: ["stock-entries", editId],
        queryFn: () => (editId ? inventoryService.getStockEntry(editId) : null),
        enabled: !!editId,
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

    const { data: storeAllocations = [] } = useQuery({
        queryKey: ["store-allocations", toLocation],
        queryFn: () => inventoryService.getStockAllocations({ status: "ALLOCATED", source_location: toLocation }),
        enabled: entryType === "RECEIPT" && !!toLocation && toLocation !== "none",
    });

    const stockRegistersLocation = entryType === "RECEIPT" ? toLocation : fromLocation;
    const { data: stockRegisters = [] } = useQuery({
        queryKey: ["stock-registers", stockRegistersLocation],
        queryFn: () => (stockRegistersLocation && stockRegistersLocation !== "none" ? inventoryService.getStockRegisters(stockRegistersLocation) : []),
        enabled: !!stockRegistersLocation && stockRegistersLocation !== "none",
    });

    // Scope/Permissions logic (simplified from modal)
    const stores = useMemo(() => locations.filter(loc => loc.isStore), [locations]);
    const assignedStores = useMemo(() => {
        if (!user || user.is_superuser) return stores;
        const assignedIds = user.assigned_locations.map(String);
        return stores.filter(loc => assignedIds.includes(loc.id));
    }, [user, stores]);

    const availableFromLocations = useMemo(() => {
        if (entryType === "ISSUE") return assignedStores;
        return locations;
    }, [entryType, assignedStores, locations]);

    const getStandaloneRoot = (locId: string) => {
        const loc = locations.find(l => l.id === locId);
        if (!loc || !loc.hierarchyPath) return null;
        return loc.hierarchyPath.split('/')[0];
    };

    const transferrableLocations = useMemo(() => {
        if (!fromLocation || entryType !== "ISSUE" || issueToType !== "STORE") return [];

        const sourceRoot = getStandaloneRoot(fromLocation);
        return locations.filter(loc =>
            loc.isStore &&
            loc.id !== fromLocation &&
            getStandaloneRoot(loc.id) === sourceRoot
        );
    }, [entryType, issueToType, fromLocation, locations]);

    const { data: allocatableTargets } = useQuery({
        queryKey: ["locations", "allocatable", fromLocation],
        queryFn: () => (fromLocation && fromLocation !== "none" ? inventoryService.getAllocatableTargets(fromLocation) : { locations: [], persons: [] }),
        enabled: !!fromLocation && fromLocation !== "none" && entryType === "ISSUE" && (issueToType === "PERSON" || issueToType === "NON_STORE"),
    });

    const hierarchicalPersons = useMemo(() => {
        if (entryType === "ISSUE" && issueToType === "PERSON" && allocatableTargets) return allocatableTargets.persons;
        return persons;
    }, [entryType, issueToType, allocatableTargets, persons]);

    const hierarchicalNonStores = useMemo(() => {
        if (entryType === "ISSUE" && issueToType === "NON_STORE" && allocatableTargets) {
            return allocatableTargets.locations;
        }
        return locations.filter(loc => !loc.isStore && !loc.isStandalone);
    }, [entryType, issueToType, allocatableTargets, locations]);

    const filteredReturnPersons = useMemo(() => {
        if (entryType !== "RECEIPT" || !toLocation) return persons;
        const ids = new Set(storeAllocations.filter((a: any) => a.allocatedToPerson).map((a: any) => a.allocatedToPerson!));
        return persons.filter(p => ids.has(p.id));
    }, [entryType, toLocation, storeAllocations, persons]);

    const filteredReturnNonStores = useMemo(() => {
        if (entryType !== "RECEIPT" || !toLocation) return locations.filter(l => !l.isStore && !l.isStandalone);
        const ids = new Set(storeAllocations.filter((a: any) => a.allocatedToLocation).map((a: any) => a.allocatedToLocation!));
        return locations.filter(l => !l.isStore && !l.isStandalone && ids.has(l.id));
    }, [entryType, toLocation, storeAllocations, locations]);

    // Mutations
    const createMutation = useMutation({
        mutationFn: (data: any) => inventoryService.createStockEntry(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["stock-entries"] });
            router.refresh();
            toast({ title: "Success", description: "Stock entry created successfully" });
            router.push("/stock-entries");
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
        mutationFn: (data: any) => inventoryService.updateStockEntry(editId!, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["stock-entries"] });
            queryClient.invalidateQueries({ queryKey: ["stock-entries", editId] });
            router.refresh();
            toast({ title: "Success", description: "Draft entry updated successfully" });
            router.push(`/stock-entries/${editId}`);
        },
        onError: (error: any) => {
            toast({
                title: "Error",
                description: error.response?.data?.detail || "Failed to update draft",
                variant: "destructive",
            });
        },
    });

    // Handle Edit Mode & Auto-selection
    useEffect(() => {
        if (existingEntry && editId) {
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
            } else if (existingEntry.entryType === "RECEIPT") {
                setToLocation(existingEntry.toLocation || "");
            }

            setItems(existingEntry.items.map((i: any) => ({
                id: Math.random().toString(36).substr(2, 9),
                item: i.item,
                quantity: i.quantity,
                batch: i.batch || null,
                instances: i.instances || [],
                stockRegister: i.stockRegister || "",
                pageNumber: i.pageNumber || null
            })));
        } else if (!editId && availableFromLocations.length === 1 && entryType === "ISSUE") {
            setFromLocation(availableFromLocations[0].id);
        } else if (!editId && assignedStores.length === 1 && entryType === "RECEIPT") {
            setToLocation(assignedStores[0].id);
        }
    }, [existingEntry, editId, locations, availableFromLocations, assignedStores, entryType]);

    // Reset all fields when entryType switches (skip initial render)
    const isFirstRender = useRef(true);
    useEffect(() => {
        if (isFirstRender.current) {
            isFirstRender.current = false;
            return;
        }
        setFromLocation("");
        setToLocation("");
        setIssuedTo("");
        setItems([{ id: Math.random().toString(36).substr(2, 9), item: "", quantity: 1, batch: null, instances: [], stockRegister: "", pageNumber: null }]);
    }, [entryType]);

    // Reset recipient + items when toLocation changes in RECEIPT mode
    useEffect(() => {
        if (entryType === "RECEIPT" && !editId) {
            setIssuedTo("");
            setFromLocation("");
            setItems([{ id: Math.random().toString(36).substr(2, 9), item: "", quantity: 1, batch: null, instances: [], stockRegister: "", pageNumber: null }]);
        }
    }, [toLocation, entryType, editId]);

    // Reset items when recipient changes in RECEIPT mode
    useEffect(() => {
        if (entryType === "RECEIPT" && !editId) {
            setItems([{ id: Math.random().toString(36).substr(2, 9), item: "", quantity: 1, batch: null, instances: [], stockRegister: "", pageNumber: null }]);
        }
    }, [issuedTo, fromLocation, entryType, editId]);

    // Handlers
    const handleAddItem = () => {
        setItems(prev => [...prev, { id: Math.random().toString(36).substr(2, 9), item: "", quantity: 1, batch: null, instances: [], stockRegister: "", pageNumber: null }]);
    };

    const handleRemoveItem = (id: string) => {
        if (items.length > 1) {
            setItems(prev => prev.filter(i => i.id !== id));
        }
    };

    const handleItemChange = (id: string, field: keyof EntryItem, value: any) => {
        setItems(prev => prev.map(i => {
            if (i.id === id) {
                return { ...i, [field]: value };
            }
            return i;
        }));
    };

    const handleSubmit = (targetStatus: string = "COMPLETED") => {
        // Basic validation
        if (entryType === "ISSUE") {
            if (!fromLocation) { toast({ title: "Error", description: "Source location is required", variant: "destructive" }); return; }
            if (issueToType === "PERSON" && !issuedTo) { toast({ title: "Error", description: "Recipient person is required", variant: "destructive" }); return; }
            if (issueToType !== "PERSON" && !toLocation) { toast({ title: "Error", description: "Target location is required", variant: "destructive" }); return; }
        } else {
            if (!toLocation) { toast({ title: "Error", description: "Target store is required", variant: "destructive" }); return; }
            if (returnFromType === "PERSON" && !issuedTo) { toast({ title: "Error", description: "Returner person is required", variant: "destructive" }); return; }
            if (returnFromType !== "PERSON" && !fromLocation) { toast({ title: "Error", description: "Source location is required", variant: "destructive" }); return; }
        }

        if (items.some(i => !i.item || i.quantity <= 0 || !i.stockRegister || i.pageNumber === null)) {
            toast({ title: "Error", description: "All items must have a selected item, quantity, stock register, and page number", variant: "destructive" });
            return;
        }

        const finalItems: any[] = [];

        for (const item of items) {
            const itemDef = inventoryItems.find(i => i.id === item.item);

            // Multi-Batch Split Logic
            if (itemDef?.trackingType === "BATCH" && !item.batch && entryType === "ISSUE") {
                let remaining = item.quantity;
                const itemRecords = stockRecords
                    .filter(r => r.item === item.item && r.batch && r.quantity > 0)
                    .sort((a, b) => a.quantity - b.quantity); // Optional: sort by smallest batch first or expiry

                for (const record of itemRecords) {
                    if (remaining <= 0) break;
                    const take = Math.min(remaining, record.quantity);
                    finalItems.push({
                        item: item.item,
                        quantity: take,
                        batch: record.batch,
                        instances: [],
                        stockRegister: item.stockRegister,
                        pageNumber: item.pageNumber
                    });
                    remaining -= take;
                }

                if (remaining > 0) {
                    finalItems.push({
                        item: item.item,
                        quantity: remaining,
                        batch: null,
                        instances: [],
                        stockRegister: item.stockRegister,
                        pageNumber: item.pageNumber
                    });
                }
            } else {
                finalItems.push({
                    item: item.item,
                    quantity: item.quantity,
                    batch: item.batch,
                    instances: item.instances,
                    stockRegister: item.stockRegister,
                    pageNumber: item.pageNumber
                });
            }
        }

        let finalStatus = targetStatus;

        if (entryType === "ISSUE" && toLocation && issueToType === "STORE") {
            finalStatus = "PENDING_ACK";
        }

        const payload = {
            entryType,
            entryDate: new Date().toISOString(),
            status: finalStatus,
            fromLocation: (fromLocation === "none" || !fromLocation) ? null : fromLocation,
            toLocation: (toLocation === "none" || !toLocation) ? null : toLocation,
            issuedTo: ((entryType === "ISSUE" && issueToType === "PERSON") || (entryType === "RECEIPT" && returnFromType === "PERSON"))
                ? (issuedTo === "none" || !issuedTo ? null : issuedTo)
                : null,
            remarks,
            items: finalItems,
        };

        if (editId) {
            updateMutation.mutate(payload);
        } else {
            createMutation.mutate(payload);
        }
    };

    return {
        state: {
            editId,
            entryType,
            issueToType,
            returnFromType,
            fromLocation,
            toLocation,
            issuedTo,
            remarks,
            items,
            isLoadingEntry,
            isPendingSubmit: createMutation.isPending || updateMutation.isPending
        },
        actions: {
            setEntryType,
            setIssueToType,
            setReturnFromType,
            setFromLocation,
            setToLocation,
            setIssuedTo,
            setRemarks,
            handleAddItem,
            handleRemoveItem,
            handleItemChange,
            handleSubmit,
            goBack: () => router.back()
        },
        data: {
            locations,
            inventoryItems,
            persons,
            stockRecords,
            activeAllocations,
            stockRegisters,
            assignedStores,
            availableFromLocations,
            transferrableLocations,
            hierarchicalPersons,
            hierarchicalNonStores,
            filteredReturnPersons,
            filteredReturnNonStores,
        }
    };
}
