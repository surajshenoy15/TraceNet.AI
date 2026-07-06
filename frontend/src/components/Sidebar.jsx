import { NavLink } from "react-router-dom";
import { Fingerprint } from "lucide-react";
import { useAuth } from "../context/AuthContext";

export default function Sidebar({ items, footerExtra }) {
  const { user, logout } = useAuth();

  return (
    <aside className="w-60 shrink-0 h-full bg-panel border-r border-border flex flex-col">
      <div className="flex items-center gap-2 px-5 py-5 border-b border-border">
        <Fingerprint className="text-cyan-400" size={22} />
        <span className="font-semibold text-lg">
          TraceNet <span className="text-cyan-400">AI</span>
        </span>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                isActive
                  ? "bg-cyan-500/10 text-cyan-300 border border-cyan-500/30"
                  : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
              }`
            }
          >
            <item.icon size={17} />
            {item.label}
          </NavLink>
        ))}
      </nav>

      {footerExtra}

      <div className="border-t border-border px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-full bg-cyan-500/20 text-cyan-300 flex items-center justify-center text-xs font-semibold shrink-0">
            {(user?.name || "?").split(" ").map((p) => p[0]).join("").slice(0, 2)}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{user?.name}</p>
            <p className="text-[11px] text-muted truncate capitalize">{user?.role}</p>
          </div>
        </div>
        <button onClick={logout} className="text-[11px] text-muted hover:text-red-400">
          Sign out
        </button>
      </div>
    </aside>
  );
}
