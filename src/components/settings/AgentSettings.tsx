import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type AgentDocs = { soul_md: string; agents_md: string; user_md: string };

const FIELDS: { key: keyof AgentDocs; label: string; hint: string }[] = [
  { key: "soul_md", label: "SOUL.md", hint: "Identidade do agente — voz, missão, princípios." },
  { key: "agents_md", label: "AGENTS.md", hint: "Como o agente opera — fluxos, decisões, escalation." },
  { key: "user_md", label: "USER.md", hint: "Contexto do cliente — empresa, prioridades, restrições." },
];

export default function AgentSettings() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [docs, setDocs] = useState<AgentDocs>({ soul_md: "", agents_md: "", user_md: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const sb: any = supabase;
      const { data: company } = await sb.from("companies").select("id").maybeSingle();
      if (!company) { setLoading(false); return; }
      setCompanyId(company.id);
      const { data: cfg } = await sb
        .from("agent_config")
        .select("soul_md, agents_md, user_md")
        .eq("company_id", company.id)
        .maybeSingle();
      setDocs({
        soul_md: cfg?.soul_md ?? "",
        agents_md: cfg?.agents_md ?? "",
        user_md: cfg?.user_md ?? "",
      });
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    if (!companyId) return;
    setSaving(true);
    const { error } = await (supabase as any)
      .from("agent_config")
      .update(docs)
      .eq("company_id", companyId);
    setSaving(false);
    if (error) { toast.error(`Falha ao salvar: ${error.message}`); return; }
    toast.success("Documentos do agente atualizados");
  };

  if (loading) return <div className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>;
  if (!companyId) return <div className="text-sm text-muted-foreground">Conclua o onboarding primeiro.</div>;

  return (
    <div className="space-y-4">
      {FIELDS.map((f) => (
        <Card key={f.key}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{f.label}</CardTitle>
            <CardDescription>{f.hint}</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              value={docs[f.key]}
              onChange={(e) => setDocs((d) => ({ ...d, [f.key]: e.target.value }))}
              rows={10}
              maxLength={30000}
              className="font-mono text-xs"
            />
          </CardContent>
        </Card>
      ))}
      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
          Salvar documentos
        </Button>
      </div>
    </div>
  );
}
