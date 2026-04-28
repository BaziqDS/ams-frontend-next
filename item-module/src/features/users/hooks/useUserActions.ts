import { useState } from "react";
import { keepPreviousData, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { userService, UserManagementData } from "@/features/users/services/user";
import { useDebounce } from "@/hooks/use-debounce";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { exportToCSV } from "@/lib/export-utils";
import { useRouter } from "next/navigation";

export function useUserActions() {
    const router = useRouter();
    const [modalOpen, setModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<UserManagementData | null>(null);
    const [modalMode, setModalMode] = useState<"edit" | "view">("edit");
    const [search, setSearch] = useState("");
    const [viewMode, setViewMode] = useState<"table" | "grid">("table");

    const debouncedSearch = useDebounce(search, 300);
    const queryClient = useQueryClient();

    const { data: users = [], isLoading, isFetching } = useQuery({
        queryKey: ['users', debouncedSearch],
        queryFn: () => userService.getUsers(debouncedSearch),
        placeholderData: keepPreviousData,
    });

    const handleExport = () => {
        const exportData = (users as any[]).map(user => ({
            'Username': user.username,
            'First Name': user.first_name,
            'Last Name': user.last_name,
            'Email': user.email,
            'Employee ID': user.employee_id,
            'Power Level': user.power_level,
            'Status': user.is_active ? 'Active' : 'Inactive'
        }));
        exportToCSV(exportData, `users-${format(new Date(), "yyyy-MM-dd")}.csv`);
    };

    const deleteMutation = useMutation({
        mutationFn: userService.deleteUser,
        onMutate: async (userId) => {
            await queryClient.cancelQueries({ queryKey: ['users'] });
            const previousUsers = queryClient.getQueryData(['users']);
            queryClient.setQueryData(['users'], (old: any) =>
                (old || []).filter((u: any) => u.id !== userId)
            );
            return { previousUsers };
        },
        onError: (err, userId, context) => {
            queryClient.setQueryData(['users'], context?.previousUsers);
            toast({ title: "Error", description: "Failed to delete user.", variant: "destructive" });
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['users'] });
            router.refresh();
        },
        onSuccess: () => {
            toast({ title: "User deleted", description: "Successfully removed user account." });
        }
    });

    const handleModalOpenChange = (open: boolean) => {
        setModalOpen(open);
        if (!open) {
            setEditingUser(null);
            setModalMode("edit");
        }
    };

    const handleEdit = (user: UserManagementData) => {
        setEditingUser(user);
        setModalMode("edit");
        setModalOpen(true);
    };

    const handleView = (user: UserManagementData) => {
        setEditingUser(user);
        setModalMode("view");
        setModalOpen(true);
    };

    const openViewById = async (id: number) => {
        const user = await userService.getUser(id);
        setEditingUser(user);
        setModalMode("view");
        setModalOpen(true);
    };

    const handleDelete = async (user: UserManagementData) => {
        if (confirm(`Are you sure you want to delete user ${user.username}?`)) {
            deleteMutation.mutate(user.id);
        }
    };

    const handleAddNew = () => {
        setEditingUser(null);
        setModalMode("edit");
        setModalOpen(true);
    };

    // Calculate simple metrics for Status Cards
    const totalUsers = users.length;
    const activeUsers = users.filter((u: any) => u.is_active).length;
    const adminUsers = users.filter((u: any) => u.power_level === 0).length;

    return {
        state: { modalOpen, editingUser, modalMode, search, viewMode, users, isLoading, isFetching, metrics: { totalUsers, activeUsers, adminUsers } },
        actions: { setSearch, setViewMode, handleExport, handleModalOpenChange, handleEdit, handleView, openViewById, handleDelete, handleAddNew }
    };
}
