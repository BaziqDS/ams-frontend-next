export function shouldLoadUserAssignmentSelectors(
  mode: "create" | "edit",
  canCreateUserAccounts: boolean,
  canEditUserAccounts: boolean,
) {
  return mode === "edit" ? canEditUserAccounts : canCreateUserAccounts;
}
