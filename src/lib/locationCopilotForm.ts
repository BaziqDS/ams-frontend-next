export type LocationCopilotFormState = {
  name: string;
  code: string;
  main_store_name: string;
  parent_location: string;
  location_type: string;
  create_main_store: boolean;
  is_store: boolean;
  is_active: boolean;
  description: string;
  address: string;
  in_charge: string;
  contact_number: string;
};

const TEXT_FIELDS: Array<keyof Pick<
  LocationCopilotFormState,
  | "name"
  | "code"
  | "main_store_name"
  | "location_type"
  | "description"
  | "address"
  | "in_charge"
  | "contact_number"
>> = [
  "name",
  "code",
  "main_store_name",
  "location_type",
  "description",
  "address",
  "in_charge",
  "contact_number",
];

const BOOLEAN_FIELDS: Array<keyof Pick<
  LocationCopilotFormState,
  "create_main_store" | "is_store" | "is_active"
>> = ["create_main_store", "is_store", "is_active"];

export function buildLocationCopilotValuePatch(
  values: Record<string, unknown>,
): Partial<LocationCopilotFormState> {
  const patch: Partial<LocationCopilotFormState> = {};

  TEXT_FIELDS.forEach((field) => {
    if (typeof values[field] === "string") {
      patch[field] = values[field];
    }
  });

  if (typeof values.parent_location === "string" || typeof values.parent_location === "number") {
    patch.parent_location = String(values.parent_location);
  }

  BOOLEAN_FIELDS.forEach((field) => {
    if (typeof values[field] === "boolean") {
      patch[field] = values[field];
    }
  });

  return patch;
}
