import type { CapabilityLevel } from "@/contexts/CapabilitiesContext";
import { copilotFormIdsMatch } from "@/lib/copilotFormIds";

export type CopilotModuleId =
  | "inspections"
  | "locations"
  | "categories"
  | "items"
  | "stock-entries"
  | "stock-registers";

export type CopilotCapabilityContract = {
  module: string;
  level?: CapabilityLevel;
};

export type CopilotOpenFormContract = {
  formId: string;
  label: string;
  route?: string;
  routePattern?: string;
  samePageOnly?: boolean;
  openActionName: string;
  capability: CopilotCapabilityContract;
};

export type CopilotModuleContract = {
  id: CopilotModuleId;
  label: string;
  listRoute: string;
  detailRoutePattern: string;
  createForm: CopilotOpenFormContract;
  scopedForms?: CopilotOpenFormContract[];
};

export const COPILOT_MODULE_MANIFEST: CopilotModuleContract[] = [
  {
    id: "inspections",
    label: "Inspections",
    listRoute: "/inspections",
    detailRoutePattern: "/inspections/:id",
    createForm: {
      formId: "inspection_create",
      label: "New Inspection Certificate",
      route: "/inspections",
      openActionName: "open_create_inspection_form",
      capability: { module: "inspections", level: "manage" },
    },
  },
  {
    id: "locations",
    label: "Locations",
    listRoute: "/locations",
    detailRoutePattern: "/locations/:id",
    createForm: {
      formId: "location_create",
      label: "Create Location",
      route: "/locations",
      openActionName: "open_create_location_form",
      capability: { module: "locations", level: "manage" },
    },
    scopedForms: [
      {
        formId: "sublocation_create",
        label: "Add Sub-Location",
        routePattern: "/locations/:id",
        samePageOnly: true,
        openActionName: "open_create_location_form",
        capability: { module: "locations", level: "manage" },
      },
    ],
  },
  {
    id: "categories",
    label: "Categories",
    listRoute: "/categories",
    detailRoutePattern: "/categories/:id",
    createForm: {
      formId: "category_create",
      label: "Add Category",
      route: "/categories",
      openActionName: "open_create_category_form",
      capability: { module: "categories", level: "manage" },
    },
    scopedForms: [
      {
        formId: "subcategory_create",
        label: "Add Subcategory",
        routePattern: "/categories/:id",
        samePageOnly: true,
        openActionName: "open_create_subcategory_form",
        capability: { module: "categories", level: "manage" },
      },
    ],
  },
  {
    id: "items",
    label: "Items",
    listRoute: "/items",
    detailRoutePattern: "/items/:id",
    createForm: {
      formId: "item_create",
      label: "Add Item",
      route: "/items",
      openActionName: "open_create_item_form",
      capability: { module: "items", level: "manage" },
    },
  },
  {
    id: "stock-entries",
    label: "Stock Entries",
    listRoute: "/stock-entries",
    detailRoutePattern: "/stock-entries/:id",
    createForm: {
      formId: "stock_entry_create",
      label: "Create Stock Entry",
      route: "/stock-entries",
      openActionName: "open_create_stock_entry_form",
      capability: { module: "stock-entries", level: "manage" },
    },
  },
  {
    id: "stock-registers",
    label: "Stock Registers",
    listRoute: "/stock-registers",
    detailRoutePattern: "/stock-registers/:id",
    createForm: {
      formId: "stock_register_create",
      label: "Create Stock Register",
      route: "/stock-registers",
      openActionName: "open_create_stock_register_form",
      capability: { module: "stock-registers", level: "manage" },
    },
  },
];

export function getCopilotListRoutes() {
  return COPILOT_MODULE_MANIFEST.map((module) => module.listRoute);
}

export function getCopilotOpenFormContracts() {
  return COPILOT_MODULE_MANIFEST.flatMap((module) => [
    module.createForm,
    ...(module.scopedForms ?? []),
  ]);
}

export function getCopilotOpenFormIds() {
  return getCopilotOpenFormContracts().map((form) => form.formId);
}

export function getCopilotOpenFormContract(formId: string) {
  return getCopilotOpenFormContracts().find((form) =>
    copilotFormIdsMatch(form.formId, formId),
  );
}

export function routeMatchesCopilotPattern(
  route: string,
  pattern: string | undefined,
) {
  if (!pattern) return false;
  const routeParts = route.split("?")[0].split("#")[0].split("/").filter(Boolean);
  const patternParts = pattern.split("/").filter(Boolean);
  if (routeParts.length !== patternParts.length) return false;

  return patternParts.every((part, index) => {
    return part.startsWith(":") || part === routeParts[index];
  });
}
