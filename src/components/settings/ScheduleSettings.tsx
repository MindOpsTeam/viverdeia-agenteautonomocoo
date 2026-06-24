import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const TIMEZONES = [
  "America/Sao_Paulo", "America/Manaus", "America/Fortaleza", "America/Recife",
  "America/Belem", "America/Cuiaba", "America/New_York", "Europe/Lisbon", "UTC",
];

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export default function ScheduleSettings() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [morning, setMorning] = useState("08:00");
  const [checkpoint, setCheckpoint] = useState("12:00");
  const [daily, setDaily] = useState("18:00");
  const [tz, setTz] = useState("America/Sao_Paulo");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const sb: any = supabase;
      const { data: company } = await sb.from("companies").select("id").maybeSingle();
      if (!company) { setLoading(false); return; }
      setCompanyId(company.id);
      const { data: cfg } = await sb.from("agent_config")
        .select("morning_briefing_time, checkpoint_time, daily_report_time, timezone")
        .eq("company_id", company.id).maybeSingle();
      if (cfg) {
        setMorning(cfg.morning_briefing_time ?? "08:00");
        setCheckpoint(cfg.checkpoint_time ?? "12:00");
        setDaily(cfg.daily_report_time ?? "18:00");
        setTz(cfg.timezone ?? "America/Sao_Paulo");
      }
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    if (!companyId) return;
    if (![morning, checkpoint, daily].every((t) => TIME_REGEX.test(t))) {
      toast.error("Horários devem estar no formato HH:MM");
      return;
    }
    setSaving(true);
    const { error } = await (supabase as any)
      .from("agent_config")
      .update({
        morning_briefing_time: morning,
        checkpoint_time: checkpoint,
        daily_report_time: daily,
        timezone: tz,
      })
      .eq("company_id", companyId);
    setSaving(false);
    if (error) { toast.error(`Falha ao salvar: ${error.message}`); return; }
    toast.success("Horários atualizados");
  };

  if (loading) return <div className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>;
  if (!companyId) return <div className="text-sm text-muted-foreground">Conclua o onboarding primeiro.</div>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Cron jobs do agente</CardTitle>
        <CardDescription>
          Os jobs rodam segunda a sexta no fuso horário configurado.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-2">
            <Label>Morning briefing</Label>
            <Input value={morning} onChange={(e) => setMorning(e.target.value)} placeholder="08:00" />
          </div>
          <div className="space-y-2">
            <Label>Checkpoint</Label>
            <Input value={checkpoint} onChange={(e) => setCheckpoint(e.target.value)} placeholder="12:00" />
          </div>
          <div className="space-y-2">
            <Label>Daily report</Label>
            <Input value={daily} onChange={(e) => setDaily(e.target.value)} placeholder="18:00" />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Fuso horário</Label>
          <Select value={tz} onValueChange={setTz}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {TIMEZONES.map((z) => <SelectItem key={z} value={z}>{z}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex justify-end">
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
            Salvar horários
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
