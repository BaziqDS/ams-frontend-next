"use client";

import { useEffect, useId, useRef } from "react";
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

  useEffect(() => {
    unregisterRef.current = registerReadable({ id, description, value });
    return () => {
      unregisterRef.current?.();
      unregisterRef.current = null;
    };
  }, [id, description, value, registerReadable]);
}
