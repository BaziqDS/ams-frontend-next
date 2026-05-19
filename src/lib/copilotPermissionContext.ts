import type {
  CapabilityLevel,
  InspectionStagesData,
} from "@/contexts/CapabilitiesContext";
import type { AuthUser } from "@/contexts/AuthContext";

type CapabilityRequirement = {
  module: string;
  level?: CapabilityLevel;
};

export type CopilotPermissionAction = {
  name: string;
  description: string;
  parameters: Record<
    string,
    { type: string; description?: string; required?: boolean }
  >;
  requiredPermissions?: string[];
  requiredCapabilities?: CapabilityRequirement[];
  allowed?: boolean;
};

type CapabilityState = {
  modules: Record<string, CapabilityLevel | null>;
  manifest: Record<string, CapabilityLevel[]>;
  isSuperuser: boolean;
  inspectionStages: InspectionStagesData;
};

type ActionAccessInput = {
  permissionValues: string[];
  capabilities: CapabilityState;
};

const LEVEL_RANK: Record<CapabilityLevel, number> = {
  view: 1,
  manage: 2,
  full: 3,
};

function hasPermission(
  permissionValues: string[],
  permission: string,
  isSuperuser: boolean,
) {
  if (isSuperuser) return true;
  return permissionValues.some(
    (value) => value === permission || value.endsWith(`.${permission}`),
  );
}

function canCapability(
  capabilities: CapabilityState,
  module: string,
  level: CapabilityLevel = "view",
) {
  if (capabilities.isSuperuser) return true;
  const held = capabilities.modules[module];
  if (!held) return false;
  return LEVEL_RANK[held] >= LEVEL_RANK[level];
}

function describeMissingCapability(
  capabilities: CapabilityState,
  requirement: CapabilityRequirement,
) {
  const level = requirement.level ?? "view";
  const held = capabilities.isSuperuser
    ? "superuser"
    : (capabilities.modules[requirement.module] ?? "none");
  return `Requires capability ${requirement.module}:${level}, current level is ${held}.`;
}

export function getCopilotActionAccess(
  action: CopilotPermissionAction,
  input: ActionAccessInput,
):
  | { allowed: true; blockedReason?: undefined }
  | { allowed: false; blockedReason: string } {
  const reasons: string[] = [];

  const missingPermissions = (action.requiredPermissions ?? []).filter(
    (permission) =>
      !hasPermission(
        input.permissionValues,
        permission,
        input.capabilities.isSuperuser,
      ),
  );
  if (missingPermissions.length > 0) {
    reasons.push(
      `Missing permission${missingPermissions.length === 1 ? "" : "s"}: ${missingPermissions.join(", ")}.`,
    );
  }

  const missingCapabilities = (action.requiredCapabilities ?? []).filter(
    (requirement) =>
      !canCapability(
        input.capabilities,
        requirement.module,
        requirement.level ?? "view",
      ),
  );
  for (const requirement of missingCapabilities) {
    reasons.push(describeMissingCapability(input.capabilities, requirement));
  }

  if (action.allowed === false) {
    reasons.push("Action is disabled by the current page or form state.");
  }

  if (reasons.length > 0) {
    return {
      allowed: false,
      blockedReason: reasons.join(" "),
    };
  }

  return { allowed: true };
}

function sorted(values: string[]) {
  return [...values].sort((a, b) => a.localeCompare(b));
}

function modulesWithLevel(
  capabilities: CapabilityState,
  level: CapabilityLevel,
) {
  const modules = Object.keys(capabilities.manifest);
  return sorted(
    modules.filter((module) => canCapability(capabilities, module, level)),
  );
}

function modulesWithoutLevel(
  capabilities: CapabilityState,
  level: CapabilityLevel,
) {
  const modules = Object.keys(capabilities.manifest);
  return sorted(
    modules.filter((module) => !canCapability(capabilities, module, level)),
  );
}

export function buildCopilotPermissionSnapshot({
  user,
  permissionValues,
  capabilities,
  actions,
}: {
  user: Pick<
    AuthUser,
    | "id"
    | "username"
    | "is_superuser"
    | "is_staff"
    | "groups_display"
    | "assigned_locations"
  > | null;
  permissionValues: string[];
  capabilities: CapabilityState;
  actions: CopilotPermissionAction[];
}) {
  const actionRows = actions.map((action) => {
    const access = getCopilotActionAccess(action, {
      permissionValues,
      capabilities,
    });
    return {
      name: action.name,
      description: action.description,
      allowed: access.allowed,
      blockedReason: access.blockedReason,
      requiredPermissions: action.requiredPermissions ?? [],
      requiredCapabilities: action.requiredCapabilities ?? [],
    };
  });

  return {
    user: user
      ? {
          id: user.id,
          username: user.username,
          is_superuser: user.is_superuser,
          is_staff: user.is_staff,
          groups: user.groups_display,
          assigned_locations: user.assigned_locations,
        }
      : null,
    permissions: {
      count: permissionValues.length,
      values: permissionValues.slice(0, 40),
    },
    capabilities: {
      isSuperuser: capabilities.isSuperuser,
      modules: capabilities.modules,
      canView: modulesWithLevel(capabilities, "view"),
      canManage: modulesWithLevel(capabilities, "manage"),
      canFull: modulesWithLevel(capabilities, "full"),
      cannotView: modulesWithoutLevel(capabilities, "view"),
      cannotManage: modulesWithoutLevel(capabilities, "manage"),
      cannotFull: modulesWithoutLevel(capabilities, "full"),
      inspectionStages: capabilities.inspectionStages,
    },
    frontendActions: {
      allowed: actionRows.filter((action) => action.allowed),
      blocked: actionRows.filter((action) => !action.allowed),
    },
    guidance: [
      "Use frontendActions.allowed before calling page actions.",
      "If a requested action is blocked, explain the blockedReason instead of trying the action.",
      "Backend and frontend still enforce permissions if the model calls a blocked action by mistake.",
    ],
  };
}
