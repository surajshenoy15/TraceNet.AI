import { useEffect, useState } from "react";
import { Plus, Shield } from "lucide-react";
import AppShell from "../components/AppShell";
import { Card, Badge, Button } from "../components/ui";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";

const ROLES = ["investigator", "reviewer", "admin", "auditor"];

export default function Admin() {
  const { can } = useAuth();
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "demo1234", role: "investigator", unit: "Demo Cybercrime Unit" });
  const [err, setErr] = useState("");

  function load() {
    api.get("/admin/users").then((r) => setUsers(r.data)).catch(() => {});
    api.get("/admin/stats").then((r) => setStats(r.data)).catch(() => {});
  }
  useEffect(load, []);

  if (!can("user.manage")) {
    return <AppShell title="Admin Panel"><Card className="p-10 text-center text-muted">Your role does not have access to user management.</Card></AppShell>;
  }

  async function addUser() {
    setErr("");
    try {
      await api.post("/admin/users", form);
      setShowAdd(false);
      setForm({ ...form, name: "", email: "" });
      load();
    } catch (e) { setErr(e?.response?.data?.detail || "Could not create user."); }
  }

  async function changeRole(id, role) {
    await api.patch(`/admin/users/${id}`, { role });
    load();
  }

  return (
    <AppShell title="Admin Panel">
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card className="p-5"><p className="text-2xl font-bold">{stats.total_users}</p><p className="text-sm text-muted">Total Users</p></Card>
          <Card className="p-5"><p className="text-2xl font-bold">{stats.active_cases}</p><p className="text-sm text-muted">Active Cases</p></Card>
          {Object.entries(stats.by_role).slice(0, 2).map(([r, n]) => (
            <Card key={r} className="p-5"><p className="text-2xl font-bold">{n}</p><p className="text-sm text-muted capitalize">{r}s</p></Card>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <h2 className="font-medium">User Management</h2>
        <Button onClick={() => setShowAdd(!showAdd)}><Plus size={16} /> Add User</Button>
      </div>

      {showAdd && (
        <Card className="p-5 mb-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="bg-slate-900/60 border border-border rounded-lg px-3 py-2 text-sm outline-none" />
            <input placeholder="email@agency.gov.in" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="bg-slate-900/60 border border-border rounded-lg px-3 py-2 text-sm outline-none" />
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="bg-slate-900/60 border border-border rounded-lg px-3 py-2 text-sm outline-none">
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <input placeholder="Unit" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className="bg-slate-900/60 border border-border rounded-lg px-3 py-2 text-sm outline-none" />
          </div>
          {err && <p className="text-sm text-red-400 mt-2">{err}</p>}
          <p className="text-xs text-muted mt-2">Default password: demo1234 · MFA: 123456</p>
          <div className="flex gap-2 mt-3"><Button onClick={addUser}>Create</Button><Button variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button></div>
        </Card>
      )}

      <Card className="p-5">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted border-b border-border">
              <th className="py-2 pr-4 font-normal">Name</th>
              <th className="py-2 pr-4 font-normal">Email</th>
              <th className="py-2 pr-4 font-normal">Unit</th>
              <th className="py-2 pr-4 font-normal">Role</th>
              <th className="py-2 pr-4 font-normal">Status</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-border/60">
                <td className="py-3 pr-4">{u.name}</td>
                <td className="py-3 pr-4 text-muted">{u.email}</td>
                <td className="py-3 pr-4 text-muted">{u.unit}</td>
                <td className="py-3 pr-4">
                  <select value={u.role} onChange={(e) => changeRole(u.id, e.target.value)}
                    className="bg-slate-900/60 border border-border rounded-md px-2 py-1 text-xs outline-none">
                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </td>
                <td className="py-3 pr-4"><Badge tone="success">{u.status}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="flex items-center gap-2 mt-4 text-xs text-muted">
        <Shield size={13} /> All administrative actions are logged in the audit trail.
      </div>
    </AppShell>
  );
}
