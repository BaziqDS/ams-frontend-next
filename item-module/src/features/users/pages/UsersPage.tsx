"use client";

import { useEffect } from "react";
import { AnimatedListingLayout } from "@/components/dashboard/AnimatedListingLayout";
import { StatusCard } from "@/components/dashboard/StatusCard";
import { Users, UserCheck, Shield } from "lucide-react";
import { ActionBar } from "@/components/dashboard/ActionBar";
import { UserModal } from "@/features/users/components/UserModal";
import { UserWizard } from "@/features/users/components/UserWizard";
import { usePermissions } from "@/features/auth/hooks/usePermissions";
import { useSearchParams } from "next/navigation";
import { useUserActions } from "../hooks/useUserActions";
import { UserFilters } from "../components/UserFilters";
import { UsersTable } from "../components/UsersTable";

export default function UsersPage() {
  const { can } = usePermissions();
  const { state, actions } = useUserActions();
  const searchParams = useSearchParams();
  const editUserId = searchParams.get("editUserId");

  useEffect(() => {
    const asNumber = editUserId ? Number(editUserId) : NaN;
    if (!Number.isFinite(asNumber) || asNumber <= 0) return;
    actions.openViewById(asNumber).catch(() => {
      return;
    });
  }, [actions, editUserId]);

  if (state.isLoading && state.users.length === 0) {
    return <div className="p-8 text-center uppercase tracking-widest text-[10px] font-bold text-muted-foreground animate-pulse">Loading users...</div>;
  }

  return (
    <AnimatedListingLayout
      title="User Management"
      subtitle="Manage system users, roles, and permissions."
      statusCards={
        <>
          <StatusCard
            title="Total Users"
            value={state.metrics.totalUsers}
            icon={Users}
          />
          <StatusCard
            title="Active Users"
            value={state.metrics.activeUsers}
            icon={UserCheck}
          />
          <StatusCard
            title="Global Admins"
            value={state.metrics.adminUsers}
            icon={Shield}
          />
        </>
      }
    >
      <ActionBar
        onAddNew={can("add_user") ? actions.handleAddNew : undefined}
        addNewLabel="Add New User"
        viewMode={state.viewMode}
        onViewModeChange={actions.setViewMode}
        onExport={actions.handleExport}
      >
        <UserFilters search={state.search} setSearch={actions.setSearch} />
      </ActionBar>

      <UsersTable
        users={state.users}
        isLoading={state.isLoading}
        isFetching={state.isFetching}
        viewMode={state.viewMode}
        handleEdit={actions.handleEdit}
        handleDelete={actions.handleDelete}
      />

      {/* Wizard for creating new users */}
      <UserWizard
        open={state.modalOpen && !state.editingUser}
        onOpenChange={actions.handleModalOpenChange}
      />

      {/* Existing modal for editing users */}
      <UserModal
        open={state.modalOpen && !!state.editingUser}
        onOpenChange={actions.handleModalOpenChange}
        user={state.editingUser}
        mode={state.modalMode}
      />
    </AnimatedListingLayout>
  );
}
