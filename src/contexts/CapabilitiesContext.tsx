"use client";

import { createContext, useContext, useEffect, useState, useCallback, useMemo, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

export type CapabilityLevel = "view" | "manage" | "full";
export type ModuleDependencies = Record<string, Partial<Record<CapabilityLevel, string[]>>>;

export interface CapabilitiesResponse {
  modules: Record<string, CapabilityLevel | null>;
  is_superuser: boolean;
  manifest: Record<string, CapabilityLevel[]>;
  dependencies?: ModuleDependencies;
}

interface CapabilitiesContextValue {
  modules: Record<string, CapabilityLevel | null>;
  manifest: Record<string, CapabilityLevel[]>;
  dependencies: ModuleDependencies;
  isSuperuser: boolean;
  isLoading: boolean;
  can: (module: string, level?: CapabilityLevel) => boolean;
  refresh: () => Promise<void>;
}

const LEVEL_RANK: Record<CapabilityLevel, number> = { view: 1, manage: 2, full: 3 };

const CapabilitiesContext = createContext<CapabilitiesContextValue | null>(null);

export function CapabilitiesProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [modules, setModules] = useState<Record<string, CapabilityLevel | null>>({});
  const [manifest, setManifest] = useState<Record<string, CapabilityLevel[]>>({});
  const [dependencies, setDependencies] = useState<ModuleDependencies>({});
  const [isSuperuser, setIsSuperuser] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch<CapabilitiesResponse>("/auth/capabilities/");
      setModules(res.modules ?? {});
      setManifest(res.manifest ?? {});
      setDependencies(res.dependencies ?? {});
      setIsSuperuser(!!res.is_superuser);
    } catch {
      setModules({});
      setManifest({});
      setDependencies({});
      setIsSuperuser(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      setModules({});
      setManifest({});
      setDependencies({});
      setIsSuperuser(false);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    load();
  }, [isAuthenticated, load]);

  const can = useCallback(
    (module: string, level: CapabilityLevel = "view") => {
      if (isSuperuser) return true;
      const held = modules[module];
      if (!held) return false;
      return LEVEL_RANK[held] >= LEVEL_RANK[level];
    },
    [modules, isSuperuser],
  );

  const value = useMemo<CapabilitiesContextValue>(
    () => ({ modules, manifest, dependencies, isSuperuser, isLoading, can, refresh: load }),
    [modules, manifest, dependencies, isSuperuser, isLoading, can, load],
  );

  return <CapabilitiesContext.Provider value={value}>{children}</CapabilitiesContext.Provider>;
}

export function useCapabilities() {
  const ctx = useContext(CapabilitiesContext);
  if (!ctx) throw new Error("useCapabilities must be used inside <CapabilitiesProvider>");
  return ctx;
}

export function useCan(module: string, level: CapabilityLevel = "view") {
  const { can } = useCapabilities();
  return can(module, level);
}
