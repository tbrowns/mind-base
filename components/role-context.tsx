"use client";
import { createContext, useContext, useState } from "react";
import type { ViewerRole } from "@/lib/types";
const ROLE_KEY = "mindbase-role";
const LEGACY_ROLE_KEY = "kuzana-role";
const viewerRoles: ViewerRole[] = [
  "team-member",
  "management",
  "management-investees",
];
const RoleContext = createContext<{ role: ViewerRole; setRole: (role: ViewerRole) => void }>({ role: "team-member", setRole: () => undefined });
function getInitialRole(): ViewerRole {
  if (typeof window === "undefined") {
    return "team-member";
  }

  const stored =
    localStorage.getItem(ROLE_KEY) || localStorage.getItem(LEGACY_ROLE_KEY);

  return viewerRoles.includes(stored as ViewerRole)
    ? (stored as ViewerRole)
    : "team-member";
}

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [role, setRoleState] = useState<ViewerRole>(getInitialRole);
  const setRole = (next: ViewerRole) => { setRoleState(next); localStorage.setItem(ROLE_KEY, next); };
  return <RoleContext.Provider value={{ role, setRole }}>{children}</RoleContext.Provider>;
}
export const useRole = () => useContext(RoleContext);
