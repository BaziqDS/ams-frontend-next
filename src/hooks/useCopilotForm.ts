"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useCopilotActivity } from "@/contexts/CopilotContext";
import { useCopilotAction } from "@/hooks/useCopilotAction";
import { useCopilotReadable } from "@/hooks/useCopilotReadable";
import type { CapabilityLevel } from "@/contexts/CapabilitiesContext";
import {
  createCopilotFormRuntimeState,
  normalizeCopilotSubmitError,
  normalizeCopilotSubmitResult,
  updateCopilotFormRuntimeState,
} from "@/lib/copilotFormRuntime";

export type CopilotFormFieldOption = {
  label: string;
  value: string | number | boolean;
};

export type CopilotFormField = {
  name: string;
  label: string;
  type?: "string" | "number" | "boolean" | "date" | "select" | "array" | "object";
  required?: boolean;
  readOnly?: boolean;
  description?: string;
  options?: CopilotFormFieldOption[];
};

export type CopilotFormActionRequirements = {
  requiredPermissions?: string[];
  requiredCapabilities?: Array<{ module: string; level?: CapabilityLevel }>;
};

type CopilotFormSubmitIntent = "save" | "submit" | "save_draft";

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
  focusField?: (field: string) => unknown | Promise<unknown>;
  validate?: () => unknown | Promise<unknown>;
  submit?: (intent?: CopilotFormSubmitIntent) => unknown | Promise<unknown>;
};

function matchesForm(formId: string, targetFormId: unknown) {
  return !targetFormId || targetFormId === formId;
}

export function useCopilotForm(config: CopilotFormConfig) {
  const pathname = usePathname();
  const trackActivity = useCopilotActivity();
  const pendingAssistantFieldsRef = useRef<string[]>([]);
  const runtimeFormIdRef = useRef(config.formId);
  const runtimeActiveRef = useRef(config.active);
  const activityActiveRef = useRef(false);
  const activityLastChangeKeyRef = useRef<string | null>(null);
  const [runtimeState, setRuntimeState] = useState(() =>
    createCopilotFormRuntimeState(config.values),
  );

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

  const activeFormContext = useMemo(
    () =>
      config.active
        ? {
            formId: config.formId,
            title: config.title,
            description: config.description,
            mode: config.mode,
            fields: config.fields,
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
      config.fields,
      config.focusField,
      config.formId,
      config.mode,
      config.submit,
      config.title,
      config.validate,
      config.values,
      runtimeState,
    ],
  );
  const readableValue = useMemo(
    () => ({ route: pathname, activeForm: activeFormContext }),
    [activeFormContext, pathname],
  );

  useCopilotReadable({
    description: activeFormContext
      ? `Active AMS form: ${config.title}. Use set_form_values with exact field names from this context.`
      : `AMS form not active: ${config.title}.`,
    value: readableValue,
  });

  useCopilotAction({
    name: "set_form_values",
    description:
      "Patch fields on the active AMS form. Args: { formId?: string, values: Record<string, unknown>, reason?: string }.",
    parameters: {
      formId: { type: "string", description: "Optional target form id." },
      values: {
        type: "object",
        description: "Field/value map using exact field names from activeForm.fields.",
        required: true,
      },
      reason: { type: "string", description: "Optional reason for audit/debugging." },
    },
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

      const incoming = values && typeof values === "object" ? values : {};
      const accepted: Record<string, unknown> = {};
      const unknown: string[] = [];

      for (const [field, value] of Object.entries(incoming)) {
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
        const extraResult = extra && typeof extra === "object"
          ? extra as { applied?: unknown; ignored?: unknown; reason?: unknown }
          : null;
        const response = {
          ok: true,
          applied: Object.keys(accepted),
          unknown,
          ignored: Array.isArray(extraResult?.ignored)
            ? extraResult.ignored.filter((field): field is string => typeof field === "string")
            : [],
          result: extra ?? null,
        };
        trackActivity({
          kind: "form_values_set",
          actor: "assistant",
          title: `Assistant set ${response.applied.length} field${response.applied.length === 1 ? "" : "s"} in ${config.title}`,
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
}
