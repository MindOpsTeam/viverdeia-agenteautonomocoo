import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Bot, CheckCircle2, ExternalLink, Inbox, Loader2, Play, RefreshCw, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

type TaskStatus = "todo" | "doing" | "done" | "blocked";

interface Task {
  id: string;
  notion_task_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: "high" | "medium" | "low";
  assigned_to: string | null;
  source: string | null;
  is_adhoc: boolean | null;
  block_reason: string | null;
  evidence_url: string | null;
  result: string | null;
  created_at: string;
  updated_at: string;
}

interface ExecutionLog {
  id: string;
  type: "action" | "report" | "error" | "briefing";
  content: string;
  created_at: string;
}

const COLUMNS: { key: TaskStatus; label: string }[] = [
  { key: "todo", label: "A fazer" },
  { key: "doing", label: "Em progresso" },
  { key: "blocked", label: "Bloqueado" },
  { key: "done", label: "Concluído" },
];

const SOURCE_LABEL: Record<string, string> = {
  notion: "Notion", asana: "Asana", discord: "Discord", slack: "Slack", routine: "Rotina", manual: "Manual",
};

const PRIORITY: Record<string, { label: string; cls: string }> = {
  high: { label: "Alta", cls: "bg-warning hover:bg-warning text-white" },
  medium: { label: "Média", cls: "bg-info hover:bg-info text-white" },
  low: { label: "Baixa", cls: "bg-muted hover:bg-muted text-foreground" },
};
const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

function isAgent(assigned: string | null): boolean {
  const v = (assigned ?? "").toLowerCase();
  return v === "" || v === "coo" || v === "agent";
}

// URL do Notion a partir do id (só quando é um id real de 32 hex, não rotina sintética).
function notionUrl(id: string | null): string | null {
  if (!id) return null;
  const clean = id.replace(/-/g, "");
  return /^[0-9a-f]{32}$/i.test(clean) ? `https://www.notion.so/${clean}` : null;
}

const sb = () => supabase as any;

export default function BacklogPage() {
  const { isAdmin } = useAuth();
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [respFilter, setRespFilter] = useState<string>("all");
  const [sort, setSort] = useState<string>("recent");
  const [selected, setSelected] = useState<Task | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: company } = await sb().from("companies").select("id").maybeSingle();
      if (cancelled) return;
      if (!company) { setLoading(false); return; }
      setCompanyId(company.id);
      setLastSync(localStorage.getItem(`atlas:lastSync:${company.id}`));
      const { data } = await sb().from("tasks").select("*").eq("company_id", company.id)
        .order("created_at", { ascending: false });
      if (cancelled) return;
      setTasks((data ?? []) as Task[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // Realtime: tasks da empresa
  useEffect(() => {
    if (!companyId) return;
    const channel = supabase
      .channel(`backlog-${companyId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "tasks", filter: `company_id=eq.${companyId}` },
        (payload) => {
          setTasks((prev) => {
            if (payload.eventType === "DELETE") return prev.filter((t) => t.id !== (payload.old as Task).id);
            const next = [...prev];
            const idx = next.findIndex((t) => t.id === (payload.new as Task).id);
            if (idx >= 0) next[idx] = payload.new as Task; else next.unshift(payload.new as Task);
            return next;
          });
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [companyId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = tasks.filter((t) => {
      if (q && !`${t.title} ${t.description ?? ""}`.toLowerCase().includes(q)) return false;
      if (priorityFilter !== "all" && (t.priority ?? "medium") !== priorityFilter) return false;
      if (respFilter === "agent" && !isAgent(t.assigned_to)) return false;
      if (respFilter === "human" && isAgent(t.assigned_to)) return false;
      return true;
    });
    list.sort((a, b) => sort === "priority"
      ? (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1)
      : +new Date(b.created_at) - +new Date(a.created_at));
    return list;
  }, [tasks, search, priorityFilter, respFilter, sort]);

  const handleSync = async () => {
    if (!companyId) return;
    setSyncing(true);
    const { data, error } = await supabase.functions.invoke("sync-notion-tasks", { body: { company_id: companyId } });
    setSyncing(false);
    if (error) { toast.error(`Falha ao sincronizar: ${error.message ?? "erro"}`); return; }
    const payload = data as { coo_tasks_synced?: number; error?: string };
    if (payload?.error) { toast.error(payload.error); return; }
    const now = new Date().toISOString();
    localStorage.setItem(`atlas:lastSync:${companyId}`, now);
    setLastSync(now);
    toast.success(`${payload?.coo_tasks_synced ?? 0} tarefa(s) sincronizada(s).`);
  };

  const executeTask = async (taskId: string) => {
    const { data, error } = await supabase.functions.invoke("coo-orchestrator", { body: { type: "task", task_id: taskId } });
    if (error || (data as any)?.ok === false) { toast.error((data as any)?.error ?? "Falha ao despachar"); return; }
    const where = (data as any)?.dispatched === "vps" ? "enviado à instância OpenClaw" : "executando (fallback no painel)";
    toast.success(`Tarefa despachada — ${where}.`);
  };

  if (loading) {
    return (
      <AppShell>
        <div className="space-y-6">
          <Skeleton className="h-9 w-48" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {COLUMNS.map((c) => <Skeleton key={c.key} className="h-64" />)}
          </div>
        </div>
      </AppShell>
    );
  }

  if (!companyId) {
    return (
      <AppShell>
        <div className="space-y-4">
          <h1 className="text-3xl font-bold">Backlog</h1>
          <p className="text-muted-foreground">Conclua o onboarding para sincronizar o backlog do Notion.</p>
          <Button asChild><a href="/onboarding">Fazer onboarding</a></Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <header className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-3xl font-bold">Backlog</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Tarefas sincronizadas do Notion e comandos ad hoc.
                {lastSync && <> · Última sincronização: {new Date(lastSync).toLocaleString("pt-BR")}</>}
              </p>
            </div>
            <Button onClick={handleSync} disabled={syncing} size="sm">
              {syncing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
              Sincronizar Notion
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar tarefa…" className="pl-8" />
            </div>
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="w-36"><SelectValue placeholder="Prioridade" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toda prioridade</SelectItem>
                <SelectItem value="high">Alta</SelectItem>
                <SelectItem value="medium">Média</SelectItem>
                <SelectItem value="low">Baixa</SelectItem>
              </SelectContent>
            </Select>
            <Select value={respFilter} onValueChange={setRespFilter}>
              <SelectTrigger className="w-36"><SelectValue placeholder="Responsável" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="agent">Agente</SelectItem>
                <SelectItem value="human">Humano</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sort} onValueChange={setSort}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Ordenar" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">Mais recentes</SelectItem>
                <SelectItem value="priority">Por prioridade</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {COLUMNS.map((col) => {
            const items = filtered.filter((t) => t.status === col.key);
            return (
              <div key={col.key} className="rounded-xl bg-muted/40 p-3">
                <div className="flex items-center justify-between mb-3 px-1">
                  <h2 className="text-sm font-semibold">{col.label}</h2>
                  <span className="text-xs text-muted-foreground">{items.length}</span>
                </div>
                <div className="space-y-2">
                  {items.length === 0 ? (
                    <div className="flex flex-col items-center gap-1.5 py-8 text-center text-muted-foreground">
                      <Inbox className="h-6 w-6 opacity-40" />
                      <p className="text-xs">Nada aqui</p>
                    </div>
                  ) : (
                    items.map((t) => (
                      <TaskCard key={t.id} task={t} isAdmin={isAdmin}
                        onOpen={() => setSelected(t)} onExecute={() => executeTask(t.id)} />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <TaskDrawer task={selected} isAdmin={isAdmin} onExecute={executeTask} onClose={() => setSelected(null)} />
    </AppShell>
  );
}

function Assignee({ assigned }: { assigned: string | null }) {
  if (isAgent(assigned)) {
    return <span title="Atlas" className="h-6 w-6 rounded-full bg-info text-white flex items-center justify-center shrink-0"><Bot className="h-3.5 w-3.5" /></span>;
  }
  const initials = (assigned ?? "?").replace(/^@/, "").slice(0, 2).toUpperCase();
  return <span title={assigned ?? ""} className="h-6 w-6 rounded-full bg-muted text-foreground text-[10px] font-medium flex items-center justify-center shrink-0">{initials}</span>;
}

function TaskCard({ task, isAdmin, onOpen, onExecute }: {
  task: Task; isAdmin?: boolean; onOpen: () => void; onExecute: () => void;
}) {
  const blocked = task.status === "blocked";
  const canRun = isAdmin && (task.status === "todo" || task.status === "blocked");
  return (
    <div
      onClick={onOpen}
      className={`cursor-pointer rounded-lg border bg-card p-3 shadow-sm hover:border-foreground/30 transition-colors ${blocked ? "border-warning/60" : ""}`}
    >
      <p className="text-sm font-medium leading-snug">{task.title}</p>
      <div className="flex flex-wrap items-center gap-1.5 mt-2">
        <Badge className={`text-[10px] ${PRIORITY[task.priority]?.cls ?? PRIORITY.medium.cls}`}>{PRIORITY[task.priority]?.label ?? "Média"}</Badge>
        <Badge variant="outline" className="text-[10px]">
          {task.is_adhoc ? `Ad hoc · ${SOURCE_LABEL[task.source ?? "discord"] ?? task.source}` : (SOURCE_LABEL[task.source ?? "notion"] ?? task.source)}
        </Badge>
        {task.status === "done" && (
          <Badge className="text-[10px] bg-success hover:bg-success text-white"><CheckCircle2 className="h-3 w-3 mr-0.5" /> Validado</Badge>
        )}
      </div>
      {blocked && task.block_reason && (
        <p className="text-xs text-warning mt-2 line-clamp-2">⛔ {task.block_reason}</p>
      )}
      <div className="flex items-center justify-between mt-3">
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <Assignee assigned={task.assigned_to} />
          <span>{new Date(task.created_at).toLocaleDateString("pt-BR")}</span>
        </div>
        {canRun && (
          <Button size="sm" variant="outline" className="h-7 px-2 text-xs"
            onClick={(e) => { e.stopPropagation(); onExecute(); }}>
            <Play className="h-3 w-3 mr-1" /> Executar
          </Button>
        )}
      </div>
    </div>
  );
}

function TaskDrawer({ task, isAdmin, onExecute, onClose }: {
  task: Task | null; isAdmin?: boolean; onExecute: (id: string) => void; onClose: () => void;
}) {
  const [logs, setLogs] = useState<ExecutionLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!task) { setLogs([]); return; }
    let cancelled = false;
    setLoadingLogs(true);
    (async () => {
      const { data } = await sb().from("execution_logs").select("*")
        .eq("task_id", task.id).order("created_at", { ascending: true });
      if (cancelled) return;
      setLogs((data ?? []) as ExecutionLog[]);
      setLoadingLogs(false);
    })();
    return () => { cancelled = true; };
  }, [task]);

  const runTask = async () => {
    if (!task) return;
    setRunning(true);
    await onExecute(task.id);
    setRunning(false);
    onClose();
  };

  const nUrl = task ? notionUrl(task.notion_task_id) : null;

  return (
    <Sheet open={!!task} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        {task && (
          <>
            <SheetHeader>
              <SheetTitle className="text-left">{task.title}</SheetTitle>
              <SheetDescription className="text-left">
                {SOURCE_LABEL[task.source ?? "notion"] ?? task.source} · {isAgent(task.assigned_to) ? "Atlas" : task.assigned_to}
              </SheetDescription>
            </SheetHeader>

            <div className="mt-4 space-y-4 text-sm">
              <div className="flex flex-wrap gap-2">
                <Badge className={`text-[10px] ${PRIORITY[task.priority]?.cls ?? PRIORITY.medium.cls}`}>Prioridade: {PRIORITY[task.priority]?.label ?? "Média"}</Badge>
                <Badge variant="secondary" className="text-[10px] capitalize">{task.status}</Badge>
              </div>

              {task.description && <p className="text-muted-foreground">{task.description}</p>}

              <div className="flex flex-wrap gap-2">
                {isAdmin && (task.status === "todo" || task.status === "blocked") && (
                  <Button size="sm" onClick={runTask} disabled={running}>
                    {running ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Play className="h-4 w-4 mr-1" />}
                    Executar agora
                  </Button>
                )}
                {nUrl && (
                  <Button size="sm" variant="outline" asChild>
                    <a href={nUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5 mr-1" /> Ver no Notion</a>
                  </Button>
                )}
              </div>

              {task.status === "blocked" && task.block_reason && (
                <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-warning">
                  <strong>Bloqueio:</strong> {task.block_reason}
                </div>
              )}

              {task.evidence_url && (
                <a href={task.evidence_url} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline">
                  <ExternalLink className="h-3 w-3" /> Ver evidência
                </a>
              )}

              {task.result && (
                <div>
                  <h4 className="font-semibold mb-1">Resultado</h4>
                  <p className="text-muted-foreground whitespace-pre-wrap">{task.result}</p>
                </div>
              )}

              <div>
                <h4 className="font-semibold mb-2">Histórico de execução</h4>
                {loadingLogs ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : logs.length === 0 ? (
                  <p className="text-muted-foreground text-xs">Sem passos registrados ainda.</p>
                ) : (
                  <ul className="space-y-2">
                    {logs.map((l) => (
                      <li key={l.id} className="border-l-2 pl-3 py-0.5">
                        <p className="text-xs break-words">{l.content}</p>
                        <p className="text-[10px] text-muted-foreground">{new Date(l.created_at).toLocaleString("pt-BR")}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
