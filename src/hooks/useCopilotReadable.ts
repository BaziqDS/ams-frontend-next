"use client";

import { useEffect, useId, useLayoutEffect, useRef } from "react";
import { useCopilotInternal } from "@/contexts/CopilotContext";

export function useCopilotReadable({
  description,
  value,
}: {
  description: string;
  value: unknown;
}) {
  const { registerReadable } = useCopilotInternal();
  const id = useId();
  const unregisterRef = useRef<(() => void) | null>(null);

  useLayoutEffect(() => {
    const unregister = registerReadable({ id, description, value });
    if (!unregisterRef.current) {
      unregisterRef.current = unregister;
    }
  }, [id, description, value, registerReadable]);

  useEffect(
    () => () => {
      unregisterRef.current?.();
      unregisterRef.current = null;
    },
    [],
  );
}
