export function normalizeCopilotFormId(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/_/g, "-").toLowerCase();
}

export function copilotFormIdsMatch(formId: string, targetFormId: unknown) {
  if (targetFormId === "" || targetFormId === null || targetFormId === undefined) return true;
  return normalizeCopilotFormId(formId) === normalizeCopilotFormId(targetFormId);
}
