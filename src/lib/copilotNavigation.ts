const ROUTE_PATTERN = /^\/[A-Za-z0-9/_?=&.%#-]*$/;

export function normalizeCopilotRoute(path: unknown): string | null {
  if (typeof path !== "string") return null;
  const trimmed = path.trim();
  if (!trimmed || !ROUTE_PATTERN.test(trimmed)) return null;
  if (trimmed.startsWith("//")) return null;
  return trimmed;
}

export function isSameCopilotRoute(currentPathname: string, targetRoute: string) {
  return normalizeCopilotRoute(currentPathname) === normalizeCopilotRoute(targetRoute);
}
