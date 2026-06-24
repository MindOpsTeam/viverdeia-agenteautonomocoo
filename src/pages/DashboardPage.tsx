import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  Loader2, RefreshCw, Pause, Play, Activity, CheckCircle2, AlertTriangle, FileText,
  Clock, AlertOctagon, UserRound, CalendarClock,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Task = {
  id: string;
  notion_task_id: string;
  title: string;
  description: string | null;
  status: "todo" | "doing" | "done" | "blocked";
  priority: "high" | "medium" | "low";
  source?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
};

type ExecutionLog = { id: string; type: "action" | "report" | "error" | "briefing"; content: string; created_at: string };
type Report = { id: string; type: string; created_at: string };
type AgentConfig = { is_active: boolean };
type Routine = { name: string; frequency: string; schedule_time: string | null; schedule_day: number | null; status: string };

const TASK_FILTERS = ["all", "todo", "doing", "blocked", "done"] as const;
type TaskFilter = (typeof TASK_FILTERS)[number];
const RANGES = [7, 14, 30] as const;
type Range = (typeof RANGES)[number];

export default function DashboardPage() {
  const { profile, role, user } = useAuth() as { profile: { full_name: string } | null; role?: string; user?: { id: string } };

  const [companyId, setCompanyId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string>("");
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [logs, setLogs] = useState<ExecutionLog[]>([]);
  const [lastReport, setLastReport] = useState<Report | null>(null);
  const [commandSenders, setCommandSenders] = useState<string[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null);

  const [loadingCompany, setLoadingCompany] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [togglingActive, setTogglingActive] = useState(false);
  const [filter, setFilter] = useState<TaskFilter>("all");
  const [range, setRange] = useState<Range>(7);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sb: any = supabase;
      const { data: company } = await sb.from("companies").select("id, name").maybeSingle();
      if (cancelled) return;
      if (!company) { setLoadingCompany(false); return; }
      setCompanyId(company.id);
      setCompanyName(company.name);

      const [{ data: cfg }, { data: ts }, { data: lg }, { data: reps }, { data: cmsgs }, { data: rts }, onb] = await Promise.all([
        sb.from("agent_config").select("is_active").eq("company_id", company.id).maybeSingle(),
        sb.from("tasks").select("*").eq("company_id", company.id).order("created_at", { ascending: false }),
        sb.from("execution_logs").select("*").eq("company_id", company.id).order("created_at", { ascending: false }).limit(50),
        sb.from("reports").select("id, type, created_at").eq("company_id", company.id).order("created_at", { ascending: false }).limit(1),
        sb.from("channel_messages").select("sender").eq("company_id", company.id).eq("message_type", "command").limit(500),
        sb.from("routines").select("name, frequency, schedule_time, schedule_day, status").eq("company_id", company.id).eq("status", "active"),
        user?.id
          ? sb.from("onboarding_progress").select("is_completed").eq("user_id", user.id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      if (cancelled) return;
      setConfig(cfg ?? null);
      setTasks((ts ?? []) as Task[]);
      setLogs((lg ?? []) as ExecutionLog[]);
      setLastReport(((reps ?? [])[0] ?? null) as Report | null);
      setCommandSenders(((cmsgs ?? []) as { sender: string }[]).map((m) => m.sender));
      setRoutines((rts ?? []) as Routine[]);
      setOnboardingDone((onb as any)?.data?.is_completed ?? null);
      setLoadingCompany(false);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  useEffect(() => {
    if (!companyId) return;
    const channel = supabase
      .channel(`logs-${companyId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "execution_logs", filter: `company_id=eq.${companyId}` },
        (payload) => setLogs((prev) => [payload.new as ExecutionLog, ...prev].slice(0, 50)))
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter: `company_id=eq.${companyId}` },
        (payload) => {
          setTasks((prev) => {
            const next = [...prev];
            const idx = next.findIndex((t) => t.id === (payload.new as Task)?.id);
            if (payload.eventType === "DELETE") return next.filter((t) => t.id !== (payload.old as Task).id);
            if (idx >= 0) next[idx] = payload.new as Task; else next.unshift(payload.new as Task);
            return next;
          });
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [companyId]);

  const stats = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const doneToday = tasks.filter((t) => t.status === "done" && new Date(t.updated_at) >= today).length;
    const doing = tasks.filter((t) => t.status === "doing").length;
    const blocked = tasks.filter((t) => t.status === "blocked").length;
    return { doneToday, doing, blocked };
  }, [tasks]);

  const visibleTasks = useMemo(() => filter === "all" ? tasks : tasks.filter((t) => t.status === filter), [tasks, filter]);

  const trend = useMemo(() => buildTrend(tasks, range), [tasks, range]);
  const insights = useMemo(() => buildInsights(tasks, commandSenders, routines), [tasks, commandSenders, routines]);

  const handleSyncNotion = async () => {
    if (!companyId) return;
    setSyncing(true);
    const { data, error } = await supabase.functions.invoke("sync-notion-tasks", { body: { company_id: companyId } });
    setSyncing(false);
    if (error) { toast.error(`Falha ao sincronizar: ${error.message ?? "erro"}`); return; }
    const payload = data as { coo_tasks_synced?: number; error?: string };
    if (payload?.error) { toast.error(payload.error); return; }
    toast.success(`${payload?.coo_tasks_synced ?? 0} tarefa(s) sincronizada(s).`);
  };

  const handleToggleActive = async () => {
    if (!companyId || !config) return;
    setTogglingActive(true);
    const next = !config.is_active;
    const { error } = await (supabase as any).from("agent_config").update({ is_active: next }).eq("company_id", companyId);
    setTogglingActive(false);
    if (error) { toast.error("Falha ao atualizar estado do agente"); return; }
    setConfig({ ...config, is_active: next });
    await (supabase as any).from("execution_logs").insert({
      company_id: companyId, type: "action",
      content: next ? "Agente retomado pelo usuário." : "Agente pausado pelo usuário.",
    });
    toast.success(next ? "Agente retomado" : "Agente pausado");
  };

  if (loadingCompany) {
    return (
      <AppShell>
        <div className="space-y-6 max-w-6xl">
          <header className="flex items-center justify-between">
            <Skeleton className="h-9 w-48" /><Skeleton className="h-8 w-32" />
          </header>
          <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}
          </section>
          <Skeleton className="h-64" /><Skeleton className="h-40" />
        </div>
      </AppShell>
    );
  }

  if (!companyId) {
    return (
      <AppShell>
        <EmptyState
          title="Dashboard"
          message={`Bem-vindo${profile ? `, ${profile.full_name}` : ""}! Você ainda não concluiu o onboarding do Atlas.`}
          actionLabel="Fazer onboarding"
          actionHref="/onboarding"
        />
      </AppShell>
    );
  }

  const setupPending = onboardingDone === false;
  const offline = !setupPending && !config?.is_active;

  return (
    <AppShell>
      <div className="space-y-6 max-w-6xl">
        {setupPending && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm text-amber-900">⚠️ Faltam passos para o Atlas ficar 100% operacional. Conclua o onboarding.</span>
            <Button size="sm" variant="outline" asChild><a href="/onboarding">Retomar configuração</a></Button>
          </div>
        )}
        {offline && (
          <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-900">
            🔴 Instância offline — o Atlas está pausado. Verifique o Cérebro e retome a operação.
          </div>
        )}

        <header className="flex flex-wrap items-center gap-3 justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold">Dashboard</h1>
              {role && <Badge variant="secondary" className="capitalize">{role}</Badge>}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Bem-vindo{profile ? `, ${profile.full_name}` : ""}! Operando em <strong>{companyName}</strong>.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <AgentStatusBadge active={!!config?.is_active} />
            <Button variant="outline" size="sm" onClick={handleToggleActive} disabled={togglingActive}>
              {togglingActive ? <Loader2 className="h-4 w-4 animate-spin" /> : config?.is_active
                ? <><Pause className="h-4 w-4 mr-1" /> Pausar</> : <><Play className="h-4 w-4 mr-1" /> Retomar</>}
            </Button>
          </div>
        </header>

        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Concluídas hoje" value={stats.doneToday} icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />} />
          <StatCard label="Em andamento" value={stats.doing} icon={<Activity className="h-4 w-4 text-blue-500" />} />
          <StatCard label="Bloqueadas" value={stats.blocked} icon={<AlertTriangle className="h-4 w-4 text-amber-500" />} />
          <StatCard label="Último relatório" value={lastReport ? new Date(lastReport.created_at).toLocaleDateString("pt-BR") : "—"} icon={<FileText className="h-4 w-4 text-muted-foreground" />} />
        </section>

        {/* Tendência */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Tendência de operação</CardTitle>
            <ToggleGroup type="single" value={String(range)} onValueChange={(v) => v && setRange(Number(v) as Range)} size="sm">
              {RANGES.map((r) => <ToggleGroupItem key={r} value={String(r)}>{r}d</ToggleGroupItem>)}
            </ToggleGroup>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={trend} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" fontSize={11} />
                <YAxis yAxisId="left" fontSize={11} allowDecimals={false} />
                <YAxis yAxisId="right" orientation="right" domain={[0, 100]} fontSize={11} unit="%" />
                <Tooltip />
                <Bar yAxisId="left" dataKey="concluidas" name="Concluídas" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="taxa" name="Taxa de sucesso" stroke="#1f9d6b" strokeWidth={2} dot={{ r: 2 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Insights */}
        <section className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <InsightCard icon={<Clock className="h-4 w-4 text-blue-500" />} label="Tempo médio de execução" value={insights.avgTime} />
          <InsightCard icon={<AlertOctagon className="h-4 w-4 text-rose-500" />} label="Rotina com mais falhas" value={insights.worstRoutine} />
          <InsightCard icon={<UserRound className="h-4 w-4 text-emerald-500" />} label="Quem mais aciona" value={insights.topRequester} />
          <InsightCard icon={<CalendarClock className="h-4 w-4 text-amber-500" />} label="Próxima rotina agendada" value={insights.nextRoutine} />
        </section>

        {/* Tarefas */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-semibold">Tarefas</h2>
            <div className="flex items-center gap-2">
              <Select value={filter} onValueChange={(v) => setFilter(v as TaskFilter)}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>{TASK_FILTERS.map((f) => <SelectItem key={f} value={f}>{filterLabel(f)}</SelectItem>)}</SelectContent>
              </Select>
              <Button onClick={handleSyncNotion} disabled={syncing} size="sm">
                {syncing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                Sincronizar Notion
              </Button>
            </div>
          </div>
          <Card>
            <CardContent className="p-0">
              {visibleTasks.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground text-sm">Nenhuma tarefa nesta visão. Sincronize com o Notion para começar.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Título</TableHead><TableHead>Status</TableHead><TableHead>Prioridade</TableHead><TableHead className="text-right">Atualizada</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleTasks.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="font-medium">{t.title}</TableCell>
                        <TableCell><StatusBadge status={t.status} /></TableCell>
                        <TableCell><PriorityBadge priority={t.priority} /></TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">{new Date(t.updated_at).toLocaleString("pt-BR")}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">Feed em tempo real</h2>
          <Card>
            <CardContent className="p-0">
              {logs.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground text-sm">Sem eventos ainda. Quando o agente agir, aparece aqui ao vivo.</div>
              ) : (
                <ul className="divide-y">
                  {logs.map((log) => (
                    <li key={log.id} className="px-4 py-3 flex gap-3">
                      <LogTypeBadge type={log.type} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm break-words">{log.content}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{new Date(log.created_at).toLocaleString("pt-BR")}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </AppShell>
  );
}

/* ---------- helpers de dados ---------- */

function buildTrend(tasks: Task[], range: number) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days: { key: string; date: string; concluidas: number; blocked: number }[] = [];
  for (let i = range - 1; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    days.push({ key: d.toISOString().slice(0, 10), date: d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }), concluidas: 0, blocked: 0 });
  }
  const map = new Map(days.map((d) => [d.key, d]));
  for (const t of tasks) {
    const ts = t.completed_at ?? t.updated_at;
    if (!ts) continue;
    const day = map.get(new Date(ts).toISOString().slice(0, 10));
    if (!day) continue;
    if (t.status === "done") day.concluidas++;
    else if (t.status === "blocked") day.blocked++;
  }
  return days.map((d) => ({ date: d.date, concluidas: d.concluidas, taxa: d.concluidas + d.blocked > 0 ? Math.round((d.concluidas / (d.concluidas + d.blocked)) * 100) : 0 }));
}

function buildInsights(tasks: Task[], senders: string[], routines: Routine[]) {
  // tempo médio start→complete
  const durations = tasks
    .filter((t) => t.status === "done" && t.started_at && t.completed_at)
    .map((t) => new Date(t.completed_at!).getTime() - new Date(t.started_at!).getTime())
    .filter((ms) => ms > 0);
  const avgTime = durations.length
    ? formatDuration(durations.reduce((a, b) => a + b, 0) / durations.length)
    : "—";

  // rotina com mais falhas (tasks source=routine bloqueadas, por título)
  const fails = new Map<string, number>();
  for (const t of tasks) if (t.source === "routine" && t.status === "blocked") fails.set(t.title, (fails.get(t.title) ?? 0) + 1);
  const worstRoutine = topEntry(fails) ?? "Nenhuma";

  // quem mais aciona
  const reqs = new Map<string, number>();
  for (const s of senders) reqs.set(s, (reqs.get(s) ?? 0) + 1);
  const topRequester = topEntry(reqs) ?? "—";

  // próxima rotina (menor schedule_time entre ativas)
  const next = routines
    .filter((r) => r.schedule_time)
    .sort((a, b) => (a.schedule_time! < b.schedule_time! ? -1 : 1))[0];
  const nextRoutine = next ? `${next.name} · ${next.schedule_time!.slice(0, 5)}` : "Nenhuma ativa";

  return { avgTime, worstRoutine, topRequester, nextRoutine };
}

function topEntry(m: Map<string, number>): string | null {
  let best: string | null = null; let max = 0;
  for (const [k, v] of m) if (v > max) { max = v; best = k; }
  return best;
}

function formatDuration(ms: number): string {
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60); const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/* ---------- subcomponentes ---------- */

function StatCard({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>{icon}
      </CardHeader>
      <CardContent><div className="text-2xl font-bold">{value}</div></CardContent>
    </Card>
  );
}

function InsightCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>{icon}
      </CardHeader>
      <CardContent><div className="text-lg font-semibold truncate">{value}</div></CardContent>
    </Card>
  );
}

function AgentStatusBadge({ active }: { active: boolean }) {
  return (
    <Badge variant={active ? "default" : "secondary"} className={active ? "bg-emerald-500 hover:bg-emerald-500" : ""}>
      <Activity className={`h-3 w-3 mr-1 ${active ? "animate-pulse" : ""}`} />
      {active ? "Agente ativo" : "Pausado"}
    </Badge>
  );
}

function StatusBadge({ status }: { status: Task["status"] }) {
  const map: Record<Task["status"], { label: string; cls: string }> = {
    todo: { label: "A fazer", cls: "bg-slate-200 text-slate-800" },
    doing: { label: "Em curso", cls: "bg-blue-100 text-blue-800" },
    done: { label: "Concluída", cls: "bg-emerald-100 text-emerald-800" },
    blocked: { label: "Bloqueada", cls: "bg-amber-100 text-amber-900" },
  };
  const { label, cls } = map[status];
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${cls}`}>{label}</span>;
}

function PriorityBadge({ priority }: { priority: Task["priority"] }) {
  const map: Record<Task["priority"], { label: string; cls: string }> = {
    high: { label: "Alta", cls: "bg-rose-100 text-rose-800" },
    medium: { label: "Média", cls: "bg-amber-100 text-amber-900" },
    low: { label: "Baixa", cls: "bg-slate-100 text-slate-700" },
  };
  const { label, cls } = map[priority];
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${cls}`}>{label}</span>;
}

function LogTypeBadge({ type }: { type: ExecutionLog["type"] }) {
  const map: Record<ExecutionLog["type"], { label: string; cls: string }> = {
    action: { label: "ACTION", cls: "bg-blue-100 text-blue-800" },
    report: { label: "REPORT", cls: "bg-emerald-100 text-emerald-800" },
    error: { label: "ERROR", cls: "bg-rose-100 text-rose-800" },
    briefing: { label: "BRIEFING", cls: "bg-violet-100 text-violet-800" },
  };
  const { label, cls } = map[type] ?? { label: type.toUpperCase(), cls: "bg-slate-100 text-slate-700" };
  return <span className={`inline-flex h-fit items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${cls}`}>{label}</span>;
}

function filterLabel(f: TaskFilter): string {
  switch (f) {
    case "all": return "Todas";
    case "todo": return "A fazer";
    case "doing": return "Em curso";
    case "blocked": return "Bloqueadas";
    case "done": return "Concluídas";
  }
}

function EmptyState({ title, message, actionLabel, actionHref }: { title: string; message: string; actionLabel: string; actionHref: string }) {
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">{title}</h1>
      <p className="text-muted-foreground">{message}</p>
      <Button asChild><a href={actionHref}>{actionLabel}</a></Button>
    </div>
  );
}
