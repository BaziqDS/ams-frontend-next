export const ADMIN_PERMISSIONS = {
  users: {
    view: "user_management.view_user_accounts",
    add: "user_management.create_user_accounts",
    change: "user_management.edit_user_accounts",
    delete: "user_management.delete_user_accounts",
    assignLocations: "user_management.assign_user_locations",
    assignRoles: "user_management.assign_user_roles",
  },
  roles: {
    view: "user_management.view_roles",
    add: "user_management.create_roles",
    change: "user_management.edit_roles",
    delete: "user_management.delete_roles",
    assignPermissions: "user_management.assign_permissions_to_roles",
  },
  locations: {
    view: "inventory.view_location",
    add: "inventory.add_location",
    change: "inventory.change_location",
    delete: "inventory.delete_location",
  },
  categories: {
    view: "inventory.view_categories",
    add: "inventory.create_categories",
    change: "inventory.edit_categories",
    delete: "inventory.delete_categories",
  },
  items: {
    view: "inventory.view_items",
    add: "inventory.create_items",
    change: "inventory.edit_items",
    delete: "inventory.delete_items",
  },
  stockEntries: {
    view: "inventory.view_stock_entries",
    add: "inventory.create_stock_entries",
    change: "inventory.edit_stock_entries",
    delete: "inventory.delete_stock_entries",
  },
  stockRegisters: {
    view: "inventory.view_stock_registers",
    add: "inventory.create_stock_registers",
    change: "inventory.edit_stock_registers",
    delete: "inventory.delete_stock_registers",
  },
  reports: {
    view: "inventory.view_reports",
  },
  inspections: {
    view: "inventory.view_inspectioncertificate",
    add: "inventory.add_inspectioncertificate",
    change: "inventory.change_inspectioncertificate",
    delete: "inventory.delete_inspectioncertificate",
  },
} as const;

export const PROTECTED_ADMIN_ROUTES = {
  "/users": ADMIN_PERMISSIONS.users.view,
  "/roles": ADMIN_PERMISSIONS.roles.view,
  "/locations": ADMIN_PERMISSIONS.locations.view,
  "/categories": ADMIN_PERMISSIONS.categories.view,
  "/items": ADMIN_PERMISSIONS.items.view,
  "/stock-entries": ADMIN_PERMISSIONS.stockEntries.view,
  "/stock-registers": ADMIN_PERMISSIONS.stockRegisters.view,
  "/reports": ADMIN_PERMISSIONS.reports.view,
  "/inspections": ADMIN_PERMISSIONS.inspections.view,
} as const;

export function hasPermission(userPermissions: string[] | undefined, requiredPermission: string) {
  if (!userPermissions?.length) return false;
  return userPermissions.some(permission => permission === requiredPermission || permission.endsWith(`.${requiredPermission}`));
}
