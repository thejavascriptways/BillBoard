"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState } from "react";

import { api } from "@/lib/api-client";
import { defaultHomeId } from "@/lib/homes";
import type { MasterRow } from "@/lib/masters";

type Scope = {
  propertyId: string;
  setPropertyId: (id: string) => void;
  ready: boolean;
};

const PropertyScopeContext = createContext<Scope>({
  propertyId: "all",
  setPropertyId: () => undefined,
  ready: false,
});

export function PropertyScopeProvider({ children }: { children: React.ReactNode }) {
  const [propertyId, setPropertyIdState] = useState("all");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem("billboard.property");
    const timer = window.setTimeout(() => {
      if (saved) setPropertyIdState(saved);
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const setPropertyId = useCallback((id: string) => {
    setPropertyIdState(id);
    window.localStorage.setItem("billboard.property", id);
  }, []);

  return (
    <PropertyScopeContext.Provider value={{ propertyId, setPropertyId, ready }}>
      {children}
    </PropertyScopeContext.Provider>
  );
}

export function usePropertyScope(): Scope {
  return useContext(PropertyScopeContext);
}

export function scopeQuery(propertyId: string): string {
  if (!propertyId || propertyId === "all") return "";
  return `?propertyId=${encodeURIComponent(propertyId)}`;
}

export function PropertySwitcher() {
  const router = useRouter();
  const { propertyId, setPropertyId, ready } = usePropertyScope();
  const [properties, setProperties] = useState<MasterRow[]>([]);

  useEffect(() => {
    api<{ rows: MasterRow[] }>("/api/v1/masters?table=homes")
      .then((data) => {
        setProperties(data.rows);
        const saved = window.localStorage.getItem("billboard.property");
        if (!saved) setPropertyId(defaultHomeId(data.rows, null));
      })
      .catch(() => setProperties([]));
  }, [setPropertyId]);

  return (
    <label className="grid gap-1 text-xs font-medium text-white/80">
      <span className="sr-only">Property</span>
      <select
        aria-label="Property"
        value={ready ? propertyId : "all"}
        onChange={(event) => {
          if (event.target.value === "__new__") {
            router.push("/configuration?table=homes&add=1");
            return;
          }
          setPropertyId(event.target.value);
        }}
        className="h-10 min-w-40 rounded-lg border border-white/30 bg-white/10 px-3 text-sm text-white"
      >
        <option value="all" className="text-foreground">
          All homes
        </option>
        {properties.filter((property) => property.isActive || property.id === propertyId).map((property) => (
          <option key={property.id} value={property.id} className="text-foreground">
            {property.isActive ? property.name : `${property.name} (inactive)`}
          </option>
        ))}
        <option value="__new__" className="text-foreground">Add new…</option>
      </select>
    </label>
  );
}
