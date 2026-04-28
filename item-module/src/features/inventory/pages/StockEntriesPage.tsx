"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { keepPreviousData, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useDebounce } from "@/hooks/use-debounce";
import { Input } from "@/components/ui/input";
import { Search, Download } from "lucide-react";
import { exportToCSV } from "@/lib/export-utils";
import { AnimatedListingLayout } from "@/components/dashboard/AnimatedListingLayout";
import { AnimatedTable } from "@/components/dashboard/AnimatedTable";
import { StatusCard } from "@/components/dashboard/StatusCard";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import { ActionBar } from "@/components/dashboard/ActionBar";
import { DataTable, Column } from "@/components/dashboard/DataTable";
import { DataGrid } from "@/components/dashboard/DataGrid";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { inventoryService, StockEntry } from "@/features/inventory/services/inventory";
import { usePermissions } from "@/features/auth/hooks/usePermissions";
import { useToast } from "@/hooks/use-toast";
import { AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { StockEntryModal } from "@/features/inventory/components/StockEntryModal";
import { CancelEntryModal } from "@/components/modals/CancelEntryModal";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";

const getOriginName = (entry: StockEntry) => {
  const isReceiptSide = ["RECEIPT", "RETURN"].includes(entry.entryType);
  return isReceiptSide 
    ? (entry.issuedToName || entry.fromLocationName || "-") 
    : (entry.fromLocationName || "-");
};

const getRecipientName = (entry: StockEntry) => {
  const isReceiptSide = ["RECEIPT", "RETURN"].includes(entry.entryType);
  return isReceiptSide
    ? (entry.toLocationName || "-")
    : (entry.toLocationName || entry.issuedToName || "-");
};

export default function StockEntriesPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [entryToCancel, setEntryToCancel] = useState<StockEntry | null>(null);
  const router = useRouter();

  const { can } = usePermissions();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);

  const { data: entriesData = [], isLoading, isFetching } = useQuery({
    queryKey: ["stock-entries", debouncedSearch],
    queryFn: () => inventoryService.getStockEntries(undefined, debouncedSearch),
    placeholderData: keepPreviousData,
    refetchInterval: 30000,
  });

  const { user } = useAuth();

  const entries = useMemo(() => {
    if (!user) return [];
    if (user.is_superuser) return entriesData;

    const assignedIds = user.assigned_locations.map(String);

    return entriesData.filter(entry => {
      // Logic: 
      // - If it's an ISSUE or TRANSFER, you see it if you are the SENDER (fromLocation)
      // - If it's a RECEIPT or RETURN, you see it if you are the RECEIVER (toLocation)
      const isIssueSide = ["ISSUE", "TRANSFER"].includes(entry.entryType);
      const isReceiptSide = ["RECEIPT", "RETURN"].includes(entry.entryType);

      if (isIssueSide && entry.fromLocation && assignedIds.includes(String(entry.fromLocation))) {
        return true;
      }
      if (isReceiptSide && entry.toLocation && assignedIds.includes(String(entry.toLocation))) {
        return true;
      }
      return false;
    });
  }, [entriesData, user]);

  const handleExport = () => {
    const exportData = (entries as any[]).map(entry => ({
      'Entry Number': entry.entryNumber,
      'Entry Type': entry.entryType,
      'From Location': getOriginName(entry),
      'To Location': getRecipientName(entry),
      'Date': entry.entryDate ? format(new Date(entry.entryDate), "yyyy-MM-dd HH:mm") : '-',
      'Status': entry.status,
      'Items Count': entry.items?.length || 0
    }));
    exportToCSV(exportData, `stock-entries-${format(new Date(), "yyyy-MM-dd")}.csv`);
  };

  const acknowledgeMutation = useMutation({
    mutationFn: (id: string) => inventoryService.acknowledgeStockEntry(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock-entries"] });
      queryClient.invalidateQueries({ queryKey: ["stock-records"] });
      router.refresh();
      toast({ title: "Success", description: "Transfer acknowledged successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.detail || "Failed to acknowledge transfer",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => inventoryService.deleteStockEntry(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock-entries"] });
      router.refresh();
      toast({ title: "Deleted", description: "Draft entry deleted successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.detail || "Failed to delete entry",
        variant: "destructive",
      });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      inventoryService.cancelStockEntry(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock-entries"] });
      queryClient.invalidateQueries({ queryKey: ["stock-records"] });
      router.refresh();
      setIsCancelModalOpen(false);
      setEntryToCancel(null);
      toast({ title: "Cancelled", description: "Entry has been cancelled and stock reversed." });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.detail || "Failed to cancel entry",
        variant: "destructive",
      });
    },
  });


  const [viewMode, setViewMode] = useState<"table" | "grid">("table");

  const totalEntries = entries.length;
  const pendingEntries = entries.filter((e) => e.status === "PENDING_ACK").length;
  const completedEntries = entries.filter((e) => e.status === "COMPLETED").length;

  const renderCard = (entry: StockEntry) => {
    return (
      <div
        key={entry.id}
        className={cn(
          "bg-card border border-border rounded-xl p-5 h-full transition-shadow group cursor-pointer",
          entry.status === "PENDING_ACK" && entry.canAcknowledge
            ? "bg-navy-surface/50 border-navy-muted hover:bg-navy-surface"
            : "hover:shadow-elevated"
        )}
        onClick={() => router.push(`/stock-entries/${entry.id}`)}
      >
        <div className="flex items-start justify-between mb-4">
          <div className="w-10 h-10 rounded-xl bg-muted/30 flex items-center justify-center group-hover:bg-navy-surface transition-colors border border-border">
            <span className="font-bold text-xs">{entry.entryType}</span>
          </div>
          <StatusBadge status={entry.status.toLowerCase() as any} label={entry.status} />
        </div>

        <h3 className="text-lg font-bold text-foreground group-hover:text-primary transition-colors tracking-tight mb-1">
          {entry.entryNumber}
        </h3>
        <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest mb-4">
          {entry.entryType} • {entry.entryDate ? format(new Date(entry.entryDate), "MMM dd, yyyy") : "No Date"}
        </p>

        <div className="space-y-3 pt-4 border-t border-border mt-auto">
          <div className="flex flex-col">
            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest leading-tight">From</span>
            <span className="text-xs font-bold truncate">{getOriginName(entry)}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest leading-tight">To / Issued To</span>
            <span className="text-xs font-bold truncate">{getRecipientName(entry)}</span>
          </div>
        </div>

        {entry.status === "PENDING_ACK" && entry.canAcknowledge && (
          <div className="mt-4 pt-4 border-t border-border">
            <button
              onClick={(e) => {
                e.stopPropagation();
                router.push(`/stock-entries/${entry.id}/acknowledge`);
              }}
              className="w-full py-2 bg-primary text-white text-[10px] font-black uppercase rounded-lg hover:bg-primary/90 transition-all shadow-md shadow-primary/10 flex items-center justify-center gap-2"
            >
              <AlertCircle className="w-3.5 h-3.5" />
              Acknowledge
            </button>
          </div>
        )}
      </div>
    );
  };

  const handleAddNew = () => {
    router.push("/stock-entries/new");
  };

  const handleDelete = (entry: StockEntry) => {
    if (entry.status === "COMPLETED") {
      toast({
        title: "Forbidden",
        description: "Completed entries cannot be deleted or cancelled.",
        variant: "destructive",
      });
      return;
    }

    if (entry.status === "DRAFT") {
      if (confirm("Are you sure you want to delete this draft entry?")) {
        deleteMutation.mutate(entry.id);
      }
    } else {
      setEntryToCancel(entry);
      setIsCancelModalOpen(true);
    }
  };

  const columns: Column<StockEntry>[] = [
    {
      key: "entryNumber",
      header: "Entry #",
      sortable: true,
      render: (entry) => (
        <span className="font-medium text-foreground">{entry.entryNumber}</span>
      ),
    },
    {
      key: "entryType",
      header: "Type",
      sortable: true,
      render: (entry) => (
        <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-wider">
          {entry.entryType}
        </Badge>
      ),
    },
    {
      key: "fromLocationName",
      header: "From",
      render: (entry) => <span>{getOriginName(entry)}</span>,
    },
    {
      key: "toLocationName",
      header: "To / Issued To",
      render: (entry) => <span>{getRecipientName(entry)}</span>,
    },
    {
      key: "entryDate",
      header: "Date",
      sortable: true,
      render: (entry) => <span className="text-sm text-muted-foreground">{entry.entryDate ? format(new Date(entry.entryDate), "dd MMM yyyy HH:mm") : "-"}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (entry) => (
        <div className="flex items-center gap-3">
          <StatusBadge status={entry.status.toLowerCase() as any} label={entry.status} />
          {entry.status === "PENDING_ACK" && (
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-destructive animate-pulse" />
              {entry.canAcknowledge && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    router.push(`/stock-entries/${entry.id}/acknowledge`);
                  }}
                  className="px-3 py-1 bg-primary text-white text-[10px] font-black uppercase rounded hover:bg-primary/90 transition-colors"
                >
                  Acknowledge
                </button>
              )}
            </div>
          )}
        </div>
      ),
    },
  ];

  if (isLoading && entries.length === 0) {
    return (
      <AnimatedListingLayout title="Stock Entries" subtitle="Loading entries..." statusCards={<></>}>
        <div className="flex items-center justify-center p-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </AnimatedListingLayout>
    );
  }

  return (
    <AnimatedListingLayout
      title="Stock Entries"
      subtitle="Track the movement and receipt of inventory items."
      statusCards={
        <>
          <StatusCard
            title="Total Entries"
            value={totalEntries}
            icon={Search} // Adjust as needed
          />
          <StatusCard
            title="Pending Entries"
            value={pendingEntries}
            icon={Search} // Adjust as needed
          />
          <StatusCard
            title="Completed Entries"
            value={completedEntries}
            icon={Search} // Adjust as needed
          />
        </>
      }
    >
      {viewMode === "table" ? (
        <AnimatedTable
          title="Stock Entries List"
          icon={Search}
          toolbar={
            <ActionBar
              onAddNew={can("add_stockentry") ? handleAddNew : undefined}
              addNewLabel="New Stock Entry"
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              onExport={handleExport}
            >
              <div className="flex items-center gap-4 bg-card px-4 py-1.5 rounded-xl border border-border shadow-sm ml-auto focus-within:border-primary/50 focus-within:ring-4 focus-within:ring-primary/5 transition-all duration-200">
                <Search className="w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search entry number..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="border-none focus-within:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 text-sm h-7 p-0 bg-transparent min-w-[200px] focus:outline-none"
                />
              </div>
            </ActionBar>
          }
        >
          <DataTable
            data={entries}
            columns={columns}
            isLoading={isLoading}
            isFetching={isFetching}
            onRowClick={(item) => router.push(`/stock-entries/${item.id}`)}
          />
        </AnimatedTable>
      ) : (
        <>
          <ActionBar
            onAddNew={can("add_stockentry") ? handleAddNew : undefined}
            addNewLabel="New Stock Entry"
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            onExport={handleExport}
          >
            <div className="flex items-center gap-4 bg-card px-4 py-1.5 rounded-xl border border-border shadow-sm ml-auto focus-within:border-primary/50 focus-within:ring-4 focus-within:ring-primary/5 transition-all duration-200">
              <Search className="w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search entry number..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="border-none focus-within:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 text-sm h-7 p-0 bg-transparent min-w-[200px] focus:outline-none"
              />
            </div>
          </ActionBar>
          <DataGrid
            data={entries}
            renderCard={renderCard}
            isLoading={isLoading}
            isFetching={isFetching}
          />
        </>
      )}

      <StockEntryModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
      />

      <CancelEntryModal
        open={isCancelModalOpen}
        onOpenChange={setIsCancelModalOpen}
        entryNumber={entryToCancel?.entryNumber}
        onConfirm={(reason) => {
          if (entryToCancel) {
            cancelMutation.mutate({ id: entryToCancel.id, reason });
          }
        }}
        isSubmitting={cancelMutation.isPending}
      />

    </AnimatedListingLayout>
  );
}
