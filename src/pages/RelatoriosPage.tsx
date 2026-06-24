import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ChevronDown, ChevronRight, Loader2, Send } from "lucide-react";
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const sb = () => supabase as any;

interface Report {
  id: string;
  type: string;
  content: string;
  tasks_done: number;
  tasks_doing: number;
  tasks_blocked: number;
  sent_to_discord: boolean;
  created_at: string;
}

const RANGES = [7, 14, 30] as const;
type Range = (typeof RANGES)[number];

export default function RelatoriosPage() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<Range>(14);
  const [sending, setSending] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = async () => {
    const { data: company } = await sb().from("companies").select("id").maybeSingle();
    if (!company) { setLoading(false); return; }
    setCompanyId(company.id);
    const { data } = await sb().from("reports").select("*").eq("company_id", company.id)
      .order("created_at", { ascending: false });
    setReports((data ?? []) as Report[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const chartData = useMemo(() => {
    const cutoff = Date.now() - range * 24 * 60 * 60 * 1000;
    return reports
      .filter((r) => new Date(r.created_at).getTime() >= cutoff)
      .slice().reverse()
      .map((r) => {
        const total = r.tasks_done + r.tasks_blocked;
        const rate = total > 0 ? Math.round((r.tasks_done / total) * 100) : 0;
        return { date: new Date(r.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }), rate };
      });
  }, [reports, range]);

  const sendNow = async () => {
    if (!companyId) return;
    setSending(true);
    const { data, error } = await supabase.functions.invoke("generate-report", {
      body: { type: "daily", company_id: companyId },
    });
    setSending(false);
    if (error || (data as any)?.error) { toast.error((data as any)?.error ?? "Falha ao gerar relatório"); return; }
    toast.success("Relatório gerado");
    setLoading(true);
    load();
  };

  if (loading) {
    return <AppShell><div className="space-y-4 max-w-4xl"><Skeleton className="h-9 w-48" /><Skeleton className="h-64" /></div></AppShell>;
  }

  if (!companyId) {
    return (
      <AppShell>
        <div className="space-y-4 max-w-4xl">
          <h1 className="text-3xl font-bold">Relatórios</h1>
          <p className="text-muted-foreground">Conclua o onboarding para ver os relatórios.</p>
          <Button asChild><a href="/onboarding">Fazer onboarding</a></Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6 max-w-4xl">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold">Relatórios</h1>
            <p className="text-sm text-muted-foreground mt-1">Daily Reports e tendência de taxa de sucesso.</p>
          </div>
          <Button size="sm" onClick={sendNow} disabled={sending}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
            Enviar relatório agora
          </Button>
        </header>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold">Taxa de sucesso</h2>
              <ToggleGroup type="single" value={String(range)} onValueChange={(v) => v && setRange(Number(v) as Range)} size="sm">
                {RANGES.map((r) => <ToggleGroupItem key={r} value={String(r)}>{r}d</ToggleGroupItem>)}
              </ToggleGroup>
            </div>
            {chartData.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Sem relatórios no período.</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" fontSize={11} />
                  <YAxis domain={[0, 100]} fontSize={11} unit="%" />
                  <Tooltip formatter={(v: number) => [`${v}%`, "Sucesso"]} />
                  <Line type="monotone" dataKey="rate" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">Histórico</h2>
          {reports.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum relatório gerado ainda.</p>
          ) : (
            <div className="space-y-2">
              {reports.map((r) => {
                const open = expanded === r.id;
                return (
                  <div key={r.id} className="rounded-xl border bg-card">
                    <button className="w-full flex items-center gap-3 p-4 text-left" onClick={() => setExpanded(open ? null : r.id)}>
                      {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{new Date(r.created_at).toLocaleString("pt-BR")}</span>
                          <Badge variant="outline" className="text-[10px] capitalize">{r.type}</Badge>
                          {r.sent_to_discord && <Badge variant="secondary" className="text-[10px]">Enviado ao Discord</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {r.tasks_done} concluídas · {r.tasks_blocked} bloqueadas · {r.tasks_doing} em andamento
                        </p>
                      </div>
                    </button>
                    {open && <div className="px-4 pb-4 pt-0 text-sm whitespace-pre-wrap text-muted-foreground border-t mt-0">{r.content}</div>}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
