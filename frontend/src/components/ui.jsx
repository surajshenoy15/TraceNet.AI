export function Card({ className = "", children }) {
  return (
    <div className={`bg-panel border border-border rounded-xl ${className}`}>
      {children}
    </div>
  );
}

export function Badge({ tone = "muted", children }) {
  const tones = {
    muted: "bg-slate-800 text-slate-300",
    success: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
    warning: "bg-amber-500/15 text-amber-400 border border-amber-500/30",
    danger: "bg-red-500/15 text-red-400 border border-red-500/30",
    accent: "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30",
    purple: "bg-violet-500/15 text-violet-300 border border-violet-500/30",
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${tones[tone] || tones.muted}`}>
      {children}
    </span>
  );
}

export function priorityTone(priority) {
  const p = (priority || "").toLowerCase();
  if (p === "critical") return "danger";
  if (p === "high") return "danger";
  if (p === "medium") return "warning";
  return "accent";
}

export function statusTone(status) {
  const s = (status || "").toLowerCase();
  if (s === "active") return "success";
  if (s === "under_review") return "purple";
  if (s === "closed") return "muted";
  return "accent";
}

export function Button({ children, variant = "primary", className = "", ...rest }) {
  const variants = {
    primary: "bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold",
    ghost: "bg-transparent border border-border hover:bg-slate-800/60 text-slate-200",
    danger: "bg-red-500/15 border border-red-500/30 text-red-300 hover:bg-red-500/25",
  };
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function ConfidenceRing({ value = 0, size = 110, stroke = 9, label }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="glow-ring -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} stroke="#1e293b" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          stroke="#22d3ee" strokeWidth={stroke} fill="none"
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-ink">{value}%</span>
        {label && <span className="text-[10px] text-muted mt-0.5">{label}</span>}
      </div>
    </div>
  );
}

export function EmptyState({ title, hint }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <p className="text-slate-300 font-medium">{title}</p>
      {hint && <p className="text-sm text-muted mt-1 max-w-sm">{hint}</p>}
    </div>
  );
}
