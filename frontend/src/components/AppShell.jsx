import {
  LayoutGrid, Folder, Users, Database, Bell, FileText, ShieldAlert,
  Settings as SettingsIcon, BookOpen, ShieldCheck, Plug,
} from "lucide-react";
import Sidebar from "./Sidebar";
import { useAuth } from "../context/AuthContext";

// each item may declare a required permission via `perm`
const ALL_NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutGrid, end: true },
  { to: "/cases", label: "Cases", icon: Folder },
  { to: "/entities", label: "Entities", icon: Users, perm: "entities.view" },
  { to: "/collections", label: "Collections", icon: Database, perm: "evidence.view" },
  { to: "/alerts", label: "Alerts", icon: Bell },
  { to: "/reports", label: "Reports", icon: FileText },
  { to: "/audit", label: "Audit Log", icon: ShieldAlert, perm: "audit.view" },
  { to: "/admin", label: "Admin", icon: ShieldCheck, perm: "user.manage" },
  { to: "/integrations", label: "Integrations", icon: Plug },
  { to: "/resources", label: "OSINT Resources", icon: BookOpen },
  { to: "/settings", label: "Settings", icon: SettingsIcon, perm: "settings.manage" },
];

export function useMainNav() {
  const { can } = useAuth();
  return ALL_NAV.filter((n) => !n.perm || can(n.perm));
}

// static fallback (used where hook isn't convenient)
export const MAIN_NAV = ALL_NAV;

export default function AppShell({ title, children }) {
  const nav = useMainNav();
  return (
    <div className="flex h-screen">
      <Sidebar items={nav} />
      <main className="flex-1 overflow-y-auto px-8 py-6">
        {title && <h1 className="text-2xl font-semibold mb-6">{title}</h1>}
        {children}
      </main>
    </div>
  );
}
