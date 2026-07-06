import { useEffect, useState } from "react";
import {
  LayoutGrid, Folder, Users, Database, Bell, FileText, ShieldAlert, Settings as SettingsIcon,
  ExternalLink, BookOpen,
} from "lucide-react";
import Sidebar from "../components/Sidebar";
import { Card } from "../components/ui";
import api from "../lib/api";

import { useMainNav } from "../components/AppShell";

export default function Resources() {
  const nav = useMainNav();
  const [data, setData] = useState({ resources: [], note: "" });

  useEffect(() => {
    api.get("/resources").then((r) => setData(r.data)).catch(() => {});
  }, []);

  return (
    <div className="flex h-screen">
      <Sidebar items={nav} />
      <main className="flex-1 overflow-y-auto px-8 py-6">
        <h1 className="text-2xl font-semibold mb-1">OSINT Resources</h1>
        <p className="text-sm text-muted mb-6">{data.note}</p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-w-4xl">
          {data.resources.map((r) => (
            <Card key={r.url} className="p-5">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-cyan-300">{r.name}</h3>
                <a href={r.url} target="_blank" rel="noreferrer" className="text-muted hover:text-cyan-400">
                  <ExternalLink size={15} />
                </a>
              </div>
              <p className="text-sm text-muted mt-2">{r.desc}</p>
              <a href={r.url} target="_blank" rel="noreferrer" className="text-xs text-cyan-400 break-all mt-2 block">
                {r.url}
              </a>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}
