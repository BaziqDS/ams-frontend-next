"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { useCopilotInternal, type CopilotAction } from "@/contexts/CopilotContext";

export function useCopilotAction(action: CopilotAction & { enabled?: boolean }) {
  const { registerAction } = useCopilotInternal();
  const actionRef = useRef(action);
  actionRef.current = action;
  const unregisterRef = useRef<(() => void) | null>(null);
  const registeredNameRef = useRef<string | null>(null);
  const parametersKey = JSON.stringify(action.parameters ?? {});
  const requiredPermissionsKey = JSON.stringify(action.requiredPermissions ?? []);
  const requiredCapabilitiesKey = JSON.stringify(action.requiredCapabilities ?? []);

  useLayoutEffect(() => {
    if (action.enabled === false) {
      unregisterRef.current?.();
      unregisterRef.current = null;
      registeredNameRef.current = null;
      return;
    }

    const stable: CopilotAction = {
      name: action.name,
      description: action.description,
      parameters: action.parameters,
      requiredPermissions: action.requiredPermissions,
      requiredCapabilities: action.requiredCapabilities,
      allowed: action.allowed,
      handler: (args: unknown) => actionRef.current.handler(args),
    };

    if (registeredNameRef.current && registeredNameRef.current !== action.name) {
      unregisterRef.current?.();
      unregisterRef.current = null;
      registeredNameRef.current = null;
    }

    const unregister = registerAction(stable);
    if (!unregisterRef.current) {
      unregisterRef.current = unregister;
      registeredNameRef.current = action.name;
    }
  }, [
    action.name,
    action.description,
    action.allowed,
    action.enabled,
    parametersKey,
    requiredPermissionsKey,
    requiredCapabilitiesKey,
    registerAction,
  ]);

  useEffect(
    () => () => {
      unregisterRef.current?.();
      unregisterRef.current = null;
      registeredNameRef.current = null;
    },
    [],
  );
}
