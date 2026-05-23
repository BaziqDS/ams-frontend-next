"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useCopilotActivity } from "@/contexts/CopilotContext";
import { useCopilotAction } from "@/hooks/useCopilotAction";
import { useCopilotReadable } from "@/hooks/useCopilotReadable";
import type { CapabilityLevel } from "@/contexts/CapabilitiesContext";
import {
  buildCopilotFormContextFields,
  buildCopilotSetFormValuesParameters,
  createCopilotFormRuntimeState,
  findInvalidCopilotSelectValues,
  normalizeCopilotFormPatchValues,
  normalizeCopilotSetValuesResponse,
  normalizeCopilotSubmitError,
  normalizeCopilotSubmitResult,
  searchCopilotFormOptions,
  updateCopilotFormRuntimeState,
  validateCopilotFormPatchValues,
  type CopilotSubmitResult,
  type CopilotFormOptionSearchResult,
  type CopilotFormOptionsState,
} from "@/lib/copilotFormRuntime";
import { copilotFormIdsMatch } from "@/lib/copilotFormIds";
import {
  buildManualSubmitRequestedActivity,
  buildManualSubmitResultActivity,
} from "@/lib/copilotManualSubmitActivity";

export type CopilotFormFieldOption = {
  label: string;
  value: string | number | boolean;
};

export type CopilotFormField = {
  name: string;
  label: string;
  type?: "string" | "number" | "boolean" | "date" | "select" | "array" | "object";
  arrayItemType?: "string" | "number" | "boolean" | "unknown";
  required?: boolean;
  readOnly?: boolean;
  description?: string;
  options?: CopilotFormFieldOption[];
  arrayItemFields?: CopilotFormField[];
  dependsOn?: string[];
  affects?: string[];
  optionSource?: string;
  optionsMode?: "complete" | "local_search" | "remote_search";
  optionsState?: CopilotFormOptionsState;
  optionsPreview?: CopilotFormFieldOption[];
  totalCount?: number;
  hasMore?: boolean;
  resolver?: "search_form_options" | string;
  searchRequired?: boolean;
  missingDependencies?: string[];
};

export type CopilotFormActionRequirements = {
  requiredPermissions?: string[];
  requiredCapabilities?: Array<{ module: string; level?: CapabilityLevel }>;
};

export type CopilotFormSubmitIntent = "save" | "submit" | "save_draft";

export type CopilotFormOptionSearchRequest = {
  formId?: string;
  field: string;
  query?: string;
  currentValues?: Record<string, unknown>;
  limit?: number;
  reason?: string;
};

export type CopilotFormConfig = {
  formId: string;
  title: string;
  description?: string;
  mode?: string;
  active: boolean;
  canSetValues?: boolean;
  canValidate?: boolean;
  canSubmit?: boolean;
  fields: CopilotFormField[];
  values: Record<string, unknown>;
  errors?: Record<string, string>;
  requirements?: {
    setValues?: CopilotFormActionRequirements;
    validate?: CopilotFormActionRequirements;
    submit?: CopilotFormActionRequirements;
  };
  setValues: (values: Record<string, unknown>) => unknown | Promise<unknown>;
  searchOptions?: (
    request: CopilotFormOptionSearchRequest,
  ) => CopilotFormOptionSearchResult | Promise<CopilotFormOptionSearchResult>;
  focusField?: (field: string) => unknown | Promise<unknown>;
  validate?: () => unknown | Promise<unknown>;
  submit?: (intent?: CopilotFormSubmitIntent) => unknown | Promise<unknown>;
};

export type CopilotFormController = {
  submitManually: (intent?: CopilotFormSubmitIntent) => Promise<CopilotSubmitResult>;
};

function matchesForm(formId: string, targetFormId: unknown) {
  return copilotFormIdsMatch(formId, targetFormId);
}

export function useCopilotForm(config: CopilotFormConfig): CopilotFormController {
  const pathname = usePathname();
  const trackActivity = useCopilotActivity();
  const pendingAssistantFieldsRef = useRef<string[]>([]);
  const runtimeFormIdRef = useRef(config.formId);
  const runtimeActiveRef = useRef(config.active);
  const activityActiveRef = useRef(false);
  const activityMetaRef = useRef({
    formId: config.formId,
    title: config.title,
    mode: config.mode,
    route: pathname,
  });
  const trackActivityRef = useRef(trackActivity);
  const activityLastChangeKeyRef = useRef<string | null>(null);
  const [runtimeState, setRuntimeState] = useState(() =>
    createCopilotFormRuntimeState(config.values),
  );

  useEffect(() => {
    activityMetaRef.current = {
      formId: config.formId,
      title: config.title,
      mode: config.mode,
      route: pathname,
    };
    trackActivityRef.current = trackActivity;
  }, [config.formId, config.mode, config.title, pathname, trackActivity]);

  useEffect(() => {
    return () => {
      if (!activityActiveRef.current) return;
      const meta = activityMetaRef.current;
      trackActivityRef.current({
        kind: "form_closed",
        actor: "user",
        title: `Closed ${meta.title}`,
        route: meta.route,
        formId: meta.formId,
        formTitle: meta.title,
        details: {
          mode: meta.mode,
          reason: "unmount",
        },
      });
      activityActiveRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (config.active && !activityActiveRef.current) {
      trackActivity({
        kind: "form_opened",
        actor: "user",
        title: `Opened ${config.title}`,
        formId: config.formId,
        formTitle: config.title,
        details: {
          mode: config.mode,
          fields: config.fields.map(field => field.name),
        },
      });
    }

    if (!config.active && activityActiveRef.current) {
      trackActivity({
        kind: "form_closed",
        actor: "user",
        title: `Closed ${config.title}`,
        formId: config.formId,
        formTitle: config.title,
        details: {
          mode: config.mode,
        },
      });
    }

    activityActiveRef.current = config.active;
  }, [
    config.active,
    config.fields,
    config.formId,
    config.mode,
    config.title,
    trackActivity,
  ]);

  useEffect(() => {
    setRuntimeState(previous => {
      const becameActive = config.active && !runtimeActiveRef.current;
      const formChanged = runtimeFormIdRef.current !== config.formId;
      runtimeActiveRef.current = config.active;

      if (!config.active || becameActive || formChanged) {
        runtimeFormIdRef.current = config.formId;
        pendingAssistantFieldsRef.current = [];
        return createCopilotFormRuntimeState(config.values);
      }

      const next = updateCopilotFormRuntimeState(previous, config.values, {
        assistantPatchedFields: pendingAssistantFieldsRef.current,
      });
      pendingAssistantFieldsRef.current = [];
      return next;
    });
  }, [config.active, config.formId, config.values]);

  useEffect(() => {
    const change = runtimeState.lastChange;
    if (!config.active || !change) return;

    const key = `${change.changedAt}:${change.source}:${change.fields.join("|")}`;
    if (activityLastChangeKeyRef.current === key) return;
    activityLastChangeKeyRef.current = key;

    trackActivity({
      kind: "form_field_changed",
      actor:
        change.source === "assistant"
          ? "assistant"
          : change.source === "user"
            ? "user"
            : "system",
      title:
        change.fields.length === 1
          ? `Changed ${change.fields[0]} in ${config.title}`
          : `Changed ${change.fields.length} fields in ${config.title}`,
      formId: config.formId,
      formTitle: config.title,
      field: change.field,
      fields: change.fields,
      previousValue: change.previousValue,
      currentValue: change.currentValue,
      previousValues: change.previousValues,
      currentValues: change.currentValues,
      details: {
        source: change.source,
        changedAt: change.changedAt,
      },
    });
  }, [
    config.active,
    config.formId,
    config.title,
    runtimeState.lastChange,
    trackActivity,
  ]);

  const fieldNames = useMemo(
    () => new Set(config.fields.map(field => field.name)),
    [config.fields],
  );
  const setValuesParameters = useMemo(
    () => buildCopilotSetFormValuesParameters(config.fields),
    [config.fields],
  );
  const contextFields = useMemo(
    () => buildCopilotFormContextFields(config.fields, {
      values: config.values,
    }),
    [config.fields, config.values],
  );

  const activeFormContext = useMemo(
    () =>
      config.active
        ? {
            formId: config.formId,
            title: config.title,
            description: config.description,
            mode: config.mode,
            fields: contextFields,
            setValuesSchema: setValuesParameters.values,
            values: config.values,
            errors: config.errors ?? {},
            dirtyFields: runtimeState.dirtyFields,
            touchedFields: runtimeState.touchedFields,
            lastChange: runtimeState.lastChange,
            lastUserEdit: runtimeState.lastUserEdit,
            lastAssistantEdit: runtimeState.lastAssistantEdit,
            allowedActions: {
              set_form_values: config.canSetValues !== false,
              focus_form_field: Boolean(config.focusField),
              search_form_options: true,
              validate_active_form: Boolean(config.validate) && config.canValidate !== false,
              request_form_submit: Boolean(config.submit) && config.canSubmit !== false,
            },
          }
        : null,
    [
      config.active,
      config.canSetValues,
      config.canSubmit,
      config.canValidate,
      config.description,
      config.errors,
      config.focusField,
      config.formId,
      config.mode,
      config.submit,
      config.title,
      config.validate,
      config.values,
      contextFields,
      runtimeState,
      setValuesParameters.values,
    ],
  );
  const readableValue = useMemo(
    () => ({ route: pathname, activeForm: activeFormContext }),
    [activeFormContext, pathname],
  );

  const submitManually = useCallback(
    async (intent: CopilotFormSubmitIntent = "submit") => {
      trackActivity(
        buildManualSubmitRequestedActivity({
          formId: config.formId,
          formTitle: config.title,
          intent,
          route: pathname,
        }),
      );

      if (!config.active || !config.submit || config.canSubmit === false) {
        const failure: CopilotSubmitResult = {
          ok: false,
          errorType: "submit_unavailable",
          message: "Submit is not available for the active form right now.",
        };
        trackActivity(
          buildManualSubmitResultActivity({
            formId: config.formId,
            formTitle: config.title,
            intent,
            route: pathname,
            result: failure,
          }),
        );
        return failure;
      }

      try {
        const result = await config.submit(intent);
        const normalized = normalizeCopilotSubmitResult(result);
        trackActivity(
          buildManualSubmitResultActivity({
            formId: config.formId,
            formTitle: config.title,
            intent,
            route: pathname,
            result: normalized,
          }),
        );
        return normalized;
      } catch (error) {
        const normalized = normalizeCopilotSubmitError(error);
        trackActivity(
          buildManualSubmitResultActivity({
            formId: config.formId,
            formTitle: config.title,
            intent,
            route: pathname,
            result: normalized,
          }),
        );
        return normalized;
      }
    },
    [
      config.active,
      config.canSubmit,
      config.formId,
      config.submit,
      config.title,
      pathname,
      trackActivity,
    ],
  );

  useCopilotReadable({
    description: activeFormContext
      ? `Active AMS form: ${config.title}. Use set_form_values with exact field names from this context. For fields with optionsState truncated, requires_dependency, loading, remote_search, or resolver=search_form_options, call search_form_options before patching.`
      : `AMS form not active: ${config.title}.`,
    value: readableValue,
  });

  useCopilotAction({
    name: "set_form_values",
    description:
      "Patch fields on the active AMS form. Args: { formId?: string, values: Record<string, unknown>, reason?: string }.",
    parameters: setValuesParameters,
    allowed: config.canSetValues !== false,
    requiredPermissions: config.requirements?.setValues?.requiredPermissions,
    requiredCapabilities: config.requirements?.setValues?.requiredCapabilities,
    enabled: config.active,
    handler: ({ formId, values }: { formId?: string; values?: Record<string, unknown> }) => {
      if (!matchesForm(config.formId, formId)) {
        return { ok: false, reason: `Target form mismatch: ${String(formId)}` };
      }
      if (config.canSetValues === false) {
        return { ok: false, reason: "This form is read-only right now." };
      }

      const incoming = normalizeCopilotFormPatchValues(
        config.fields,
        values && typeof values === "object" ? values : {},
      );
      const invalidSelects = findInvalidCopilotSelectValues(
        config.fields,
        incoming,
      );
      if (invalidSelects.length > 0) {
        return {
          ok: false,
          errorType: "invalid_select_value",
          message:
            "One or more select fields used values that are not available in the active form options. Use the option value shown in the Writable field schema.",
          fieldErrors: Object.fromEntries(
            invalidSelects.map(failure => [
              failure.field,
              `Invalid option ${JSON.stringify(failure.value)}. Allowed: ${failure.allowedOptions
                .map(option => `${String(option.label ?? option.value)}=${String(option.value)}`)
                .join(", ")}`,
            ]),
          ),
        };
      }

      const schemaResult = validateCopilotFormPatchValues(
        config.fields,
        incoming,
      );
      if (!schemaResult.ok) {
        return {
          ok: false,
          errorType: "invalid_form_values_schema",
          message:
            "The submitted values do not match the active form schema. Use activeForm.setValuesSchema and exact writable field names.",
          fieldErrors: schemaResult.fieldErrors,
        };
      }
      const accepted: Record<string, unknown> = {};
      const unknown: string[] = [];

      for (const [field, value] of Object.entries(schemaResult.values)) {
        if (fieldNames.has(field)) {
          accepted[field] = value;
        } else {
          unknown.push(field);
        }
      }

      if (Object.keys(accepted).length === 0) {
        return { ok: false, reason: "No known fields were provided.", unknown };
      }

      pendingAssistantFieldsRef.current = [
        ...pendingAssistantFieldsRef.current,
        ...Object.keys(accepted),
      ];
      const result = config.setValues(accepted);
      return Promise.resolve(result).then(extra => {
        const response = normalizeCopilotSetValuesResponse({
          acceptedFields: Object.keys(accepted),
          unknownFields: unknown,
          setterResult: extra,
        });
        trackActivity({
          kind: "form_values_set",
          actor: "assistant",
          title: response.ok
            ? `Assistant set ${response.applied.length} field${response.applied.length === 1 ? "" : "s"} in ${config.title}`
            : `Assistant could not set fields in ${config.title}`,
          formId: config.formId,
          formTitle: config.title,
          fields: response.applied,
          currentValues: accepted,
          result: response,
        });
        return response;
      });
    },
  });

  useCopilotAction({
    name: "search_form_options",
    description:
      "Resolve user text against an active AMS form option field. Args: { formId?: string, field: string, query?: string, currentValues?: Record<string, unknown>, limit?: number }. Use when activeForm fields show optionsState truncated, requires_dependency, loading, remote_search, or resolver=search_form_options.",
    parameters: {
      formId: { type: "string", description: "Optional target form id." },
      field: {
        type: "string",
        description:
          "Exact option field name from activeForm.fields. For array rows, use dotted paths such as items.0.item or items.0.instances.",
        required: true,
      },
      query: {
        type: "string",
        description: "User-provided label/code/name text to resolve. Empty query returns leading candidates.",
      },
      currentValues: {
        type: "object",
        description: "Optional current or planned form values used for dependency-aware option resolution.",
      },
      limit: {
        type: "number",
        description: "Maximum candidates to return.",
      },
      reason: { type: "string", description: "Optional reason for audit/debugging." },
    },
    allowed: config.canSetValues !== false,
    requiredPermissions: config.requirements?.setValues?.requiredPermissions,
    requiredCapabilities: config.requirements?.setValues?.requiredCapabilities,
    enabled: config.active,
    handler: ({
      formId,
      field,
      query,
      currentValues,
      limit,
      reason,
    }: CopilotFormOptionSearchRequest) => {
      if (!matchesForm(config.formId, formId)) {
        return { ok: false, reason: `Target form mismatch: ${String(formId)}` };
      }
      if (!field || typeof field !== "string") {
        return {
          ok: false,
          errorType: "missing_field",
          message: "search_form_options requires an exact active form field name.",
        };
      }

      const request = {
        formId,
        field,
        query,
        currentValues:
          currentValues && typeof currentValues === "object"
            ? currentValues
            : config.values,
        limit,
        reason,
      };
      const response = config.searchOptions
        ? config.searchOptions(request)
        : searchCopilotFormOptions({
            fields: config.fields,
            field,
            query,
            currentValues: request.currentValues,
            limit,
          });

      return Promise.resolve(response).then(result => {
        trackActivity({
          kind: "frontend_action_result",
          actor: "assistant",
          title: `Resolved options for ${field} in ${config.title}`,
          formId: config.formId,
          formTitle: config.title,
          field,
          result,
          details: {
            query,
            reason,
          },
        });
        return result;
      });
    },
  });

  useCopilotAction({
    name: "focus_form_field",
    description:
      "Focus a field on the active AMS form. Args: { formId?: string, field: string, reason?: string }.",
    parameters: {
      formId: { type: "string", description: "Optional target form id." },
      field: { type: "string", description: "Exact field name.", required: true },
      reason: { type: "string", description: "Optional reason." },
    },
    enabled: config.active && Boolean(config.focusField),
    handler: ({ formId, field }: { formId?: string; field?: string }) => {
      if (!field || !matchesForm(config.formId, formId)) {
        return { ok: false, reason: "Field not available for this form." };
      }
      if (!fieldNames.has(field)) {
        return { ok: false, reason: `Unknown field: ${field}` };
      }
      return config.focusField?.(field) ?? { ok: true, field };
    },
  });

  useCopilotAction({
    name: "validate_active_form",
    description: "Run validation on the active AMS form. Args: { formId?: string }.",
    parameters: {
      formId: { type: "string", description: "Optional target form id." },
    },
    allowed: config.canValidate !== false,
    requiredPermissions: config.requirements?.validate?.requiredPermissions,
    requiredCapabilities: config.requirements?.validate?.requiredCapabilities,
    enabled: config.active && Boolean(config.validate),
    handler: ({ formId }: { formId?: string }) => {
      if (!matchesForm(config.formId, formId)) {
        return { ok: false, reason: `Target form mismatch: ${String(formId)}` };
      }
      if (config.canValidate === false) {
        return { ok: false, reason: "Validation is disabled for this form." };
      }
      const result = config.validate?.() ?? { ok: true };
      return Promise.resolve(result).then(response => {
        trackActivity({
          kind: "form_validated",
          actor: "assistant",
          title: `Validated ${config.title}`,
          formId: config.formId,
          formTitle: config.title,
          result: response,
        });
        return response;
      });
    },
  });

  useCopilotAction({
    name: "request_form_submit",
    description:
      "Request save/submit for the active AMS form. Args: { formId?: string, intent?: 'save' | 'submit' | 'save_draft' }.",
    parameters: {
      formId: { type: "string", description: "Optional target form id." },
      intent: { type: "string", description: "save, submit, or save_draft." },
    },
    allowed: config.canSubmit !== false,
    requiredPermissions: config.requirements?.submit?.requiredPermissions,
    requiredCapabilities: config.requirements?.submit?.requiredCapabilities,
    enabled: config.active && Boolean(config.submit),
    handler: async ({ formId, intent }: { formId?: string; intent?: CopilotFormSubmitIntent }) => {
      if (!matchesForm(config.formId, formId)) {
        return { ok: false, reason: `Target form mismatch: ${String(formId)}` };
      }
      if (config.canSubmit === false) {
        return { ok: false, reason: "Submit is not allowed for this form right now." };
      }
      trackActivity({
        kind: "form_submit_requested",
        actor: "assistant",
        title: `Assistant requested ${intent ?? "save"} for ${config.title}`,
        formId: config.formId,
        formTitle: config.title,
        details: { intent: intent ?? "save" },
      });
      try {
        const result = await config.submit?.(intent);
        const normalized = normalizeCopilotSubmitResult(result);
        trackActivity({
          kind: "form_submit_result",
          actor: "assistant",
          title: normalized.ok
            ? `Submit succeeded for ${config.title}`
            : `Submit failed for ${config.title}`,
          formId: config.formId,
          formTitle: config.title,
          result: normalized,
          details: { intent: intent ?? "save" },
        });
        return normalized;
      } catch (error) {
        const normalized = normalizeCopilotSubmitError(error);
        trackActivity({
          kind: "form_submit_result",
          actor: "assistant",
          title: `Submit failed for ${config.title}`,
          formId: config.formId,
          formTitle: config.title,
          result: normalized,
          details: { intent: intent ?? "save" },
        });
        return normalized;
      }
    },
  });

  return { submitManually };
}
