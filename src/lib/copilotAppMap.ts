import type { CapabilityLevel } from "@/contexts/CapabilitiesContext";
import {
  COPILOT_MODULE_MANIFEST,
  getCopilotListRoutes,
  getCopilotOpenFormIds,
  routeMatchesCopilotPattern,
  type CopilotCapabilityContract,
  type CopilotModuleContract,
  type CopilotOpenFormContract,
} from "@/lib/copilotModuleManifest";

export const COPILOT_APP_MAP_READABLE_ID = "__ams_app_map";
export const COPILOT_APP_MAP_SCHEMA_VERSION = 1;

export type CopilotAppMapCapability = {
  module: string;
  level: CapabilityLevel;
};

export type CopilotAppMapForm = {
  moduleId: string;
  moduleLabel: string;
  formId: string;
  label: string;
  openActionName: string;
  openVia: "open_form";
  route?: string;
  routePattern?: string;
  samePageOnly: boolean;
  currentRouteEligible: boolean;
  available: boolean;
  blockedReason?: string;
  requiredCapabilities: CopilotAppMapCapability[];
  call: {
    action: "open_form";
    arguments: { form_id: string };
  };
};

export type CopilotAppMapModule = {
  id: string;
  label: string;
  listRoute: string;
  detailRoutePattern: string;
  createForms: CopilotAppMapForm[];
};

export type CopilotAppMap = {
  schemaVersion: typeof COPILOT_APP_MAP_SCHEMA_VERSION;
  observedAt: string;
  currentRoute: string | null;
  navigation: {
    routeAction: "navigate_to_route";
    openFormAction: "open_form";
    routeGuidance: string;
    formGuidance: string;
  };
  supportedListRoutes: string[];
  supportedOpenFormIds: string[];
  modules: CopilotAppMapModule[];
  forms: CopilotAppMapForm[];
  guidance: string[];
};

type BuildCopilotAppMapArgs = {
  currentRoute?: string | null;
  observedAt?: string;
  canAccess?: (capability: CopilotAppMapCapability) => boolean;
};

function normalizeCapability(
  capability: CopilotCapabilityContract,
): CopilotAppMapCapability {
  return {
    module: capability.module,
    level: capability.level ?? "view",
  };
}

function defaultCanAccess() {
  return true;
}

function blockedReasonFor(capability: CopilotAppMapCapability) {
  return `Requires capability ${capability.module}:${capability.level}.`;
}

function buildFormMapEntry({
  module,
  form,
  currentRoute,
  canAccess,
}: {
  module: CopilotModuleContract;
  form: CopilotOpenFormContract;
  currentRoute: string | null;
  canAccess: (capability: CopilotAppMapCapability) => boolean;
}): CopilotAppMapForm {
  const capability = normalizeCapability(form.capability);
  const available = canAccess(capability);
  const samePageOnly = Boolean(form.samePageOnly);
  const currentRouteEligible = samePageOnly
    ? routeMatchesCopilotPattern(currentRoute ?? "", form.routePattern)
    : true;

  return {
    moduleId: module.id,
    moduleLabel: module.label,
    formId: form.formId,
    label: form.label,
    openActionName: form.openActionName,
    openVia: "open_form",
    ...(form.route ? { route: form.route } : {}),
    ...(form.routePattern ? { routePattern: form.routePattern } : {}),
    samePageOnly,
    currentRouteEligible,
    available,
    ...(available ? {} : { blockedReason: blockedReasonFor(capability) }),
    requiredCapabilities: [capability],
    call: {
      action: "open_form",
      arguments: { form_id: form.formId },
    },
  };
}

export function buildCopilotAppMap({
  currentRoute = null,
  observedAt = new Date().toISOString(),
  canAccess = defaultCanAccess,
}: BuildCopilotAppMapArgs = {}): CopilotAppMap {
  const modules = COPILOT_MODULE_MANIFEST.map((module) => {
    const createForms = [module.createForm, ...(module.scopedForms ?? [])].map(
      (form) => buildFormMapEntry({ module, form, currentRoute, canAccess }),
    );
    return {
      id: module.id,
      label: module.label,
      listRoute: module.listRoute,
      detailRoutePattern: module.detailRoutePattern,
      createForms,
    };
  });

  return {
    schemaVersion: COPILOT_APP_MAP_SCHEMA_VERSION,
    observedAt,
    currentRoute,
    navigation: {
      routeAction: "navigate_to_route",
      openFormAction: "open_form",
      routeGuidance:
        "Use navigate_to_route only when the user asks to move to a page without opening a form.",
      formGuidance:
        "Use open_form with one of supportedOpenFormIds for create forms; it handles navigation and modal opening.",
    },
    supportedListRoutes: getCopilotListRoutes(),
    supportedOpenFormIds: getCopilotOpenFormIds(),
    modules,
    forms: modules.flatMap((module) => module.createForms),
    guidance: [
      "This map is for module, route, and form discovery only.",
      "Do not infer writable fields from this map; after opening a form, use activeForm.fields and activeForm.setValuesSchema.",
      "If available is false, explain the blockedReason instead of trying to open the form.",
      "For samePageOnly forms, navigate to a matching detail route before calling open_form.",
    ],
  };
}
