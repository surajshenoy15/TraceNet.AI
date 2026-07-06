import { useEffect, useState } from "react";
import { Plug, CheckCircle2, KeyRound, ExternalLink, ShieldAlert } from "lucide-react";
import AppShell from "../components/AppShell";
import { Card, Badge } from "../components/ui";
import api from "../lib/api";

const ENV_HINT = {
  behind_the_email: "BEHIND_THE_EMAIL_API_KEY",
  checkleaked_phone: "CHECKLEAKED_API_KEY",
  igdetective: "IGDETECTIVE_API_KEY",
  facecheck: "FACECHECK_API_KEY",
  osint_industries: "OSINT_INDUSTRIES_API_KEY",
  username_check: "ENABLE_LIVE_USERNAME_CHECK=true",
  apify_maigret: "APIFY_TOKEN + ENABLE_APIFY_MAIGRET=true",
  apify_public_search: "APIFY_TOKEN + ENABLE_APIFY_PUBLIC_SEARCH=true",
  apify_web_scraper: "APIFY_TOKEN + ENABLE_APIFY_WEB_SCRAPER=true",
  gravatar: "ENABLE_GRAVATAR=true (default)",
  github: "keyless (default)",
};

export default function Integrations() {
  const [data, setData] = useState({ connectors: [], note: "" });

  useEffect(() => {
    api.get("/connectors").then((r) => setData(r.data)).catch(() => {});
  }, []);

  return (
    <AppShell title="OSINT Integrations">
      <p className="text-sm text-muted mb-6 max-w-3xl">{data.note}</p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {data.connectors.map((c) => (
          <Card key={c.name} className="p-5">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Plug size={16} className="text-cyan-400" />
                <h3 className="font-medium">{c.label}</h3>
              </div>
              {c.active
                ? <Badge tone="success"><CheckCircle2 size={12} /> Active</Badge>
                : <Badge tone={c.requires_key ? "warning" : "muted"}>
                    {c.requires_key ? <><KeyRound size={12} /> Needs key</> : "Off"}
                  </Badge>}
            </div>
            <p className="text-xs text-muted mb-2">
              Enable via <span className="font-mono text-cyan-300">{ENV_HINT[c.name] || "config"}</span>
            </p>
            {c.disabled_reason && (
              <p className="text-xs text-amber-300 mb-2">Disabled: {c.disabled_reason}</p>
            )}
            {c.provider_url && (
              <a href={c.provider_url} target="_blank" rel="noreferrer" className="text-xs text-cyan-400 flex items-center gap-1">
                {c.provider_url} <ExternalLink size={11} />
              </a>
            )}
          </Card>
        ))}
      </div>

      <Card className="p-5 mt-5 border-amber-500/30">
        <div className="flex items-start gap-2">
          <ShieldAlert size={16} className="text-amber-400 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-300">
            This build defaults to TRACE_APIFY_ONLY_MODE=true: Maigret checks usernames, Google Search Scraper checks public username/email/phone/IP mentions, and Web Scraper extracts visible artifacts from officer-provided public URLs. Private account-enumeration checks such as Amazon, Flipkart, Truecaller, WhatsApp contact-sync, login, OTP, forgot-password probing, or deceptive IP grabbers are intentionally blocked.
          </p>
        </div>
      </Card>
    </AppShell>
  );
}
