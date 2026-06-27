"use client";
import { createContext, useContext, useState } from "react";
import type { ViewerRole } from "@/lib/types";
const RoleContext = createContext<{ role: ViewerRole; setRole: (role: ViewerRole) => void }>({ role: "team-member", setRole: () => undefined });
export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [role, setRoleState] = useState<ViewerRole>("team-member");
  const setRole = (next: ViewerRole) => { setRoleState(next); localStorage.setItem("kuzana-role", next); };
  return <RoleContext.Provider value={{ role, setRole }}>{children}</RoleContext.Provider>;
}
export const useRole = () => useContext(RoleContext);
