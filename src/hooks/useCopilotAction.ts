"use client";

import { useEffect, useRef } from "react";
import { useCopilotInternal, type CopilotAction } from "@/contexts/CopilotContext";

export function useCopilotAction(action: CopilotAction & { enabled?: boolean }) {
  const { registerAction } = useCopilotInternal();
  const actionRef = useRef(action);
  actionRef.current = action;
  const requiredPermissionsKey = JSON.stringify(action.requiredPermissions ?? []);
  const requiredCapabilitiesKey = JSON.stringify(action.requiredCapabilities ?? []);

  useEffect(() => {
    if (action.enabled === false) return;

    const stable: CopilotAction = {
      name: action.name,
      description: action.description,
      parameters: action.parameters,
      requiredPermissions: action.requiredPermissions,
      requiredCapabilities: action.requiredCapabilities,
      allowed: action.allowed,
      handler: (args: unknown) => actionRef.current.handler(args),
    };
    const unregister = registerAction(stable);
    return unregister;
  }, [
    action.name,
    action.description,
    action.allowed,
    action.enabled,
    requiredPermissionsKey,
    requiredCapabilitiesKey,
    registerAction,
  ]);
}
