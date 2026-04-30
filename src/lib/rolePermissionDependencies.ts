import type { CapabilityLevel, ModuleDependencies } from "@/contexts/CapabilitiesContext";

export type ModuleSelections = Record<string, CapabilityLevel | null>;
export type DependencyMinimums = Record<string, CapabilityLevel>;

const LEVEL_RANK: Record<CapabilityLevel, number> = { view: 1, manage: 2, full: 3 };

export function getDependencyMinimums(
  selections: ModuleSelections,
  dependencies: ModuleDependencies,
): DependencyMinimums {
  const minimums: DependencyMinimums = {};
  for (const [module, level] of Object.entries(selections)) {
    if (!level) continue;
    const reads = dependencies[module]?.[level] ?? [];
    for (const dep of reads) {
      const existing = minimums[dep];
      if (!existing || LEVEL_RANK.view > LEVEL_RANK[existing]) {
        minimums[dep] = "view";
      }
    }
  }
  return minimums;
}

export function getInspectionStageMinimums(
  selections: ModuleSelections,
  inspectionStages: string[],
): DependencyMinimums {
  if (selections.inspections !== "manage") {
    return {};
  }

  const minimums: DependencyMinimums = {};
  if (inspectionStages.includes("fill_central_register")) {
    minimums.items = "manage";
  }
  if (inspectionStages.includes("review_finance")) {
    minimums.depreciation = "manage";
  }
  return minimums;
}

export function canSelectDependencyLevel(
  module: string,
  level: CapabilityLevel | null,
  minimums: DependencyMinimums,
) {
  const minimum = minimums[module];
  if (!minimum) return true;
  if (!level) return false;
  return LEVEL_RANK[level] >= LEVEL_RANK[minimum];
}

export function normalizeSelectionsForDependencies(
  selections: ModuleSelections,
  dependencies: ModuleDependencies,
): ModuleSelections {
  const next = { ...selections };
  const minimums = getDependencyMinimums(next, dependencies);
  for (const [module, minimum] of Object.entries(minimums)) {
    if (!canSelectDependencyLevel(module, next[module] ?? null, minimums)) {
      next[module] = minimum;
    }
  }
  return next;
}

export function normalizeSelectionsForInspectionStages(
  selections: ModuleSelections,
  inspectionStages: string[],
): ModuleSelections {
  if (selections.inspections !== "manage") {
    return selections;
  }

  const minimums = getInspectionStageMinimums(selections, inspectionStages);
  let changed = false;
  const next = { ...selections };

  for (const [module, minimum] of Object.entries(minimums)) {
    const current = next[module] ?? null;
    if (!current || LEVEL_RANK[current] < LEVEL_RANK[minimum]) {
      next[module] = minimum;
      changed = true;
    }
  }

  if (!changed) {
    return selections;
  }
  return next;
}
