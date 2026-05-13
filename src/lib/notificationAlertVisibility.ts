export interface SidebarAlertRecord {
  key: string;
  module: string;
  severity: string;
}

export interface SidebarAlertModuleCount {
  count: number;
  critical: number;
}

export function buildVisibleAlertModuleCounts(
  alerts: SidebarAlertRecord[],
  seenAlertKeys: ReadonlySet<string>,
): Record<string, SidebarAlertModuleCount> {
  return alerts.reduce<Record<string, SidebarAlertModuleCount>>((acc, alert) => {
    if (seenAlertKeys.has(alert.key)) return acc;

    const moduleName = alert.module || "general";
    const current = acc[moduleName] ?? { count: 0, critical: 0 };
    acc[moduleName] = {
      count: current.count + 1,
      critical: current.critical + (alert.severity === "critical" ? 1 : 0),
    };
    return acc;
  }, {});
}

export function getSeenAlertKeysAfterViewing(
  seenAlertKeys: ReadonlySet<string>,
  alerts: SidebarAlertRecord[],
) {
  const nextSeenAlertKeys = new Set(seenAlertKeys);
  alerts.forEach(alert => nextSeenAlertKeys.add(alert.key));
  return nextSeenAlertKeys;
}

export function getSeenAlertKeysAfterViewingModule(
  seenAlertKeys: ReadonlySet<string>,
  alerts: SidebarAlertRecord[],
  module: string,
) {
  const nextSeenAlertKeys = new Set(seenAlertKeys);
  alerts
    .filter(alert => alert.module === module)
    .forEach(alert => nextSeenAlertKeys.add(alert.key));
  return nextSeenAlertKeys;
}

export function getActiveSeenAlertKeys(
  seenAlertKeys: ReadonlySet<string>,
  alerts: SidebarAlertRecord[],
) {
  const activeAlertKeys = new Set(alerts.map(alert => alert.key));
  return new Set([...seenAlertKeys].filter(key => activeAlertKeys.has(key)));
}
