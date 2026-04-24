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
} as const;

export const PROTECTED_ADMIN_ROUTES = {
  "/users": ADMIN_PERMISSIONS.users.view,
  "/roles": ADMIN_PERMISSIONS.roles.view,
  "/locations": ADMIN_PERMISSIONS.locations.view,
  "/categories": ADMIN_PERMISSIONS.categories.view,
} as const;

export function hasPermission(userPermissions: string[] | undefined, requiredPermission: string) {
  if (!userPermissions?.length) return false;
  return userPermissions.some(permission => permission === requiredPermission || permission.endsWith(`.${requiredPermission}`));
}
