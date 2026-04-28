"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { useDebounce } from "@/hooks/use-debounce";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { inspectionsAPI } from "@/features/inspections/services/inspections";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AnimatedListingLayout } from "@/components/dashboard/AnimatedListingLayout";
import { AnimatedTable } from "@/components/dashboard/AnimatedTable";
import { StatusCard } from "@/components/dashboard/StatusCard";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import { ActionBar } from "@/components/dashboard/ActionBar";
import { DataTable, Column } from "@/components/dashboard/DataTable";
import { DataGrid } from "@/components/dashboard/DataGrid";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { Card, CardContent } from "@/components/ui/card";
import { usePermissions } from "@/features/auth/hooks/usePermissions";
import { exportToCSV } from "@/lib/export-utils";

export default function InspectionsListPage() {
  const router = useRouter();
  const { can } = usePermissions();

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");

  const { data: inspections = [], isLoading, isFetching } = useQuery({
    queryKey: ["inspections", debouncedSearch],
    queryFn: () => inspectionsAPI.getAll({ search: debouncedSearch }),
    placeholderData: keepPreviousData,
    refetchInterval: 30000,
  });

  const handleExport = () => {
    const exportData = (inspections as any[]).map(inspection => ({
      'Contract No': inspection.contract_no,
      'Contractor': inspection.contractor_name,
      'Indenter': inspection.indenter,
      'Department': inspection.department_name,
      'Date': inspection.date ? format(new Date(inspection.date), "yyyy-MM-dd") : '',
      'Stage': inspection.stage,
      'Items Count': inspection.items?.length || 0
    }));
    exportToCSV(exportData, `inspections-${format(new Date(), "yyyy-MM-dd")}.csv`);
  };

  const getStageStatus = (stage: string) => {
    if (stage === "COMPLETED") return "completed";
    if (stage === "REJECTED") return "rejected";
    if (stage === "STOCK_DETAILS" || stage === "CENTRAL_REGISTER") return "pending_ack";
    if (stage === "FINANCE_REVIEW") return "location";
    return "draft";
  };

  const stageMap: Record<string, string> = {
    DRAFT: "Draft",
    STOCK_DETAILS: "Stock Details",
    CENTRAL_REGISTER: "Central Register",
    FINANCE_REVIEW: "Finance Review",
    COMPLETED: "Completed",
    REJECTED: "Rejected"
  };

  const totalInspections = inspections.length;
  const pendingInspections = inspections.filter((i: any) => i.stage !== "COMPLETED" && i.stage !== "REJECTED").length;
  const completedInspections = inspections.filter((i: any) => i.stage === "COMPLETED").length;

  const columns: Column<any>[] = [
    {
      key: "contract_no",
      header: "Contract / Invoice #",
      sortable: true,
      render: (inspection) => (
        <div className="flex flex-col">
          <span className="font-medium text-foreground">{inspection.contract_no}</span>
          <span className="text-[11px] text-muted-foreground uppercase tracking-wider">{inspection.indenter}</span>
        </div>
      ),
    },
    {
      key: "contractor_name",
      header: "Contractor",
      sortable: true,
      render: (inspection) => (
        <div className="flex flex-col">
          <span className="font-medium text-foreground">{inspection.contractor_name}</span>
          <span className="text-[11px] text-muted-foreground uppercase tracking-wider">{inspection.department_name}</span>
        </div>
      ),
    },
    {
      key: "items",
      header: "Items",
      render: (inspection) => (
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium text-foreground">{inspection.items?.length || 0}</span>
          <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Items</span>
        </div>
      ),
    },
    {
      key: "date",
      header: "Date",
      sortable: true,
      render: (inspection) => (
        <span className="text-sm text-muted-foreground">
          {inspection.date ? format(new Date(inspection.date), "dd MMM yyyy") : "—"}
        </span>
      ),
    },
    {
      key: "stage",
      header: "Stage",
      sortable: true,
      render: (inspection) => (
        <StatusBadge
          status={getStageStatus(inspection.stage)}
          label={stageMap[inspection.stage] || inspection.stage}
        />
      ),
    },
  ];

  const renderCard = (inspection: any) => (
    <Card
      key={inspection.id}
      className="h-full hover:shadow-lg transition-all duration-200 group cursor-pointer border-border/50 hover:border-primary/20 overflow-hidden"
      onClick={() => router.push(`/inspections/${inspection.id}`)}
    >
      <CardContent className="p-5 flex flex-col h-full">
        <div className="flex items-start justify-between mb-4">
          <StatusBadge
            status={getStageStatus(inspection.stage)}
            label={stageMap[inspection.stage] || inspection.stage}
          />
        </div>

        <h3 className="text-lg font-bold text-foreground group-hover:text-primary transition-colors tracking-tight line-clamp-1 mb-1">
          {inspection.contract_no}
        </h3>
        <p className="text-xs text-muted-foreground font-medium mb-4 flex items-center gap-2">
          <span className="uppercase tracking-widest text-[10px] font-bold line-clamp-1">{inspection.contractor_name}</span>
        </p>

        <div className="space-y-4 pt-4 mt-auto border-t border-border/50">
          <div className="flex flex-col">
            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest mb-1">Indenter / Dept</span>
            <span className="text-sm font-bold truncate text-foreground">
              {inspection.indenter} <span className="text-muted-foreground font-normal mx-1">•</span> {inspection.department_name}
            </span>
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-muted-foreground font-medium bg-muted/30 px-2 py-1 rounded-md">
              {inspection.date ? format(new Date(inspection.date), "MMM dd, yyyy") : "—"}
            </span>
            <div className="flex items-center gap-2 bg-primary/5 px-2 py-1 rounded-md border border-primary/10">
              <span className="text-primary text-xs font-bold font-mono">{inspection.items?.length || 0}</span>
              <span className="text-[10px] text-primary/70 font-bold uppercase tracking-widest">Items</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <AnimatedListingLayout
      title="Inspection Certificates"
      subtitle="Verify and track the quality and delivery of new asset arrivals."
      statusCards={
        <>
          <StatusCard
            title="Total Inspections"
            value={totalInspections}
            icon={Search} // Adjust as needed
          />
          <StatusCard
            title="Pending Inspections"
            value={pendingInspections}
            icon={Search} // Adjust as needed
          />
          <StatusCard
            title="Completed Inspections"
            value={completedInspections}
            icon={Search} // Adjust as needed
          />
        </>
      }
    >
      {viewMode === "table" ? (
        <AnimatedTable
          title="Inspections List"
          icon={Search}
          toolbar={
            <ActionBar
              onAddNew={can("add_inspectioncertificate") ? () => router.push("/inspections/new") : undefined}
              addNewLabel="Add New Inspection"
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              onExport={handleExport}
            >
              <div className="flex items-center gap-4 bg-card px-4 py-1.5 rounded-xl border border-border shadow-sm ml-auto focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/10 transition-all duration-200">
                <Search className="w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search contracts, contractors..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="border-none focus-within:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 text-sm h-7 p-0 bg-transparent min-w-[200px] focus:outline-none"
                />
              </div>
            </ActionBar>
          }
        >
          <DataTable
            data={inspections}
            columns={columns}
            isLoading={isLoading}
            isFetching={isFetching}
            onRowClick={(item) => router.push(`/inspections/${item.id}`)}
          />
        </AnimatedTable>
      ) : (
        <>
          <ActionBar
            onAddNew={can("add_inspectioncertificate") ? () => router.push("/inspections/new") : undefined}
            addNewLabel="Add New Inspection"
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            onExport={handleExport}
          >
            <div className="flex items-center gap-4 bg-card px-4 py-1.5 rounded-xl border border-border shadow-sm ml-auto focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/10 transition-all duration-200">
              <Search className="w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search contracts, contractors..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="border-none focus-within:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 text-sm h-7 p-0 bg-transparent min-w-[200px] focus:outline-none"
              />
            </div>
          </ActionBar>
          <DataGrid
            data={inspections}
            renderCard={renderCard}
            isLoading={isLoading}
            isFetching={isFetching}
          />
        </>
      )}
    </AnimatedListingLayout>
  );
}
