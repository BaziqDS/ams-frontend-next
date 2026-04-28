import { useMemo } from "react";
import { DataTable, Column } from "@/components/dashboard/DataTable";
import { AnimatedTable } from "@/components/dashboard/AnimatedTable";
import { Users } from "lucide-react";
import { DataGrid } from "@/components/dashboard/DataGrid";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { UserManagementData } from "@/features/users/services/user";
import { usePermissions } from "@/features/auth/hooks/usePermissions";

interface UsersTableProps {
    users: UserManagementData[];
    isLoading: boolean;
    isFetching: boolean;
    viewMode: "table" | "grid";
    handleEdit: (user: UserManagementData) => void;
    handleDelete: (user: UserManagementData) => void;
}

export function UsersTable({ users, isLoading, isFetching, viewMode, handleEdit, handleDelete }: UsersTableProps) {
    const { can } = usePermissions();

    const columns: Column<UserManagementData>[] = useMemo(() => [
        {
            key: "username",
            header: "User",
            sortable: true,
            render: (item) => (
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-sm font-semibold text-primary">
                            {item.first_name?.charAt(0) || item.username.charAt(0).toUpperCase()}
                        </span>
                    </div>
                    <div className="flex flex-col">
                        <span className="font-medium text-foreground">{item.first_name} {item.last_name}</span>
                        <span className="text-[11px] text-muted-foreground uppercase tracking-wider">@{item.username}</span>
                    </div>
                </div>
            ),
        },
        { key: "email", header: "Email", sortable: true },
        {
            key: "assigned_locations",
            header: "Associated Locations",
            render: (item) => (
                <div className="flex flex-wrap gap-1 max-w-xs">
                    {item.power_level === 0 ? (
                        <span className="text-[10px] text-muted-foreground uppercase tracking-widest italic opacity-60">Full University Access</span>
                    ) : item.assigned_locations_display?.length > 0 ? (
                        item.assigned_locations_display.slice(0, 2).map((loc, idx) => (
                            <span key={idx} className="px-1.5 py-0.5 rounded bg-navy-surface text-[10px] text-primary border border-navy-muted">
                                {loc}
                            </span>
                        ))
                    ) : (
                        <span className="text-[10px] text-muted-foreground italic opacity-60">Personal Scope Only</span>
                    )}
                    {item.assigned_locations_display?.length > 2 && (
                        <span className="text-[10px] text-muted-foreground pt-0.5">+{item.assigned_locations_display.length - 2}</span>
                    )}
                </div>
            )
        },
        {
            key: "is_active",
            header: "Status",
            render: (item) => (
                <StatusBadge status={item.is_active ? "active" : "inactive"} />
            ),
        },
    ], []);

    const renderCard = (item: UserManagementData) => {
        const tiers: Record<number, { label: string, color: string }> = {
            0: { label: "Global", color: "bg-navy-surface text-primary border border-navy-muted" },
            1: { label: "Departmental", color: "bg-navy-surface text-primary border border-navy-muted" },
            2: { label: "Operational", color: "bg-success-muted text-success border border-success/30" },
            3: { label: "Personal", color: "bg-muted text-muted-foreground border border-border" }
        };
        const tier = tiers[item.power_level] || tiers[3];

        return (
            <div
                key={item.id}
                className="bg-card border border-border rounded-xl p-5 h-full hover:shadow-elevated transition-shadow group"
            >
                <div className="flex items-start justify-between mb-4">
                    <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center border-2 border-white shadow-sm ring-4 ring-muted/50">
                        <span className="text-xl font-bold text-primary">
                            {item.first_name?.charAt(0) || item.username.charAt(0).toUpperCase()}
                        </span>
                    </div>
                    <StatusBadge status={item.is_active ? "active" : "inactive"} />
                </div>

                <h3 className="text-lg font-bold text-foreground group-hover:text-primary transition-colors tracking-tight mb-1">
                    {item.first_name} {item.last_name}
                </h3>
                <p className="text-xs text-muted-foreground mb-4">@{item.username}</p>

                <div className="space-y-3 pt-4 border-t border-border mt-auto">
                    <div className="flex flex-col">
                        <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest leading-tight">Associated Locations</span>
                        <p className="text-[10px] font-medium text-muted-foreground truncate mt-0.5">
                            {item.power_level === 0 ? "Full University Access" : item.assigned_locations_display?.join(", ") || "Personal Scope"}
                        </p>
                    </div>
                </div>

                <div className="mt-4 pt-4 border-t border-border flex gap-2">
                    <button
                        onClick={() => handleEdit(item)}
                        className="flex-1 py-2 text-[10px] font-bold uppercase rounded-lg border border-border hover:bg-muted/50 transition-all"
                    >
                        Settings
                    </button>
                    <button
                        onClick={() => handleDelete(item)}
                        className="px-3 py-2 text-[10px] font-bold uppercase rounded-lg text-rose-600 hover:bg-rose-50 transition-all opacity-0 group-hover:opacity-100"
                    >
                        Remove
                    </button>
                </div>
            </div>
        );
    };

    if (viewMode === "table") {
        return (
            <AnimatedTable title="Users List" icon={Users}>
                <DataTable
                    data={users}
                    columns={columns}
                    isLoading={isLoading}
                    isFetching={isFetching}
                    onEdit={can("change_user") ? handleEdit : undefined}
                    onDelete={can("delete_user") ? handleDelete : undefined}
                />
            </AnimatedTable>
        );
    }

    return (
        <DataGrid
            data={users}
            renderCard={renderCard}
            isLoading={isLoading}
            isFetching={isFetching}
        />
    );
}
