import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Bot, CheckCircle2, ExternalLink, Loader2, RefreshCw, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
  { key: "todo", label: "A Fazer" },
  { key: "doing", label: "Em Execução" },
  { key: "blocked", label: "Bloqueado" },
  { key: "done", label: "Concluído" },
];

const SOURCE_LABEL: Record<string, string> = {
  notion: "Notion", asana: "Asana", discord: "Discord", slack: "Slack", routine: "Rotina", manual: "Manual",
};

function isAgent(assigned: string | null): boolean {
  const v = (assigned ?? "").toLowerCase();
  return v === "" || v === "coo" || v === "agent";
}

const sb = () => supabase as any;

export default function BacklogPage() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [respFilter, setRespFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Task | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: company } = await sb().from("companies").select("id").maybeSingle();
      if (cancelled) return;
      if (!company) { setLoading(false); return; }
      setCompanyId(company.id);
      const { data } = await sb().from("tasks").select("*").eq("company_id", company.id)
        .order("created_at", { ascending: false });
      if (cancelled) return;
      setTasks((data ?? []) as Task[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // Realtime: tasks da empresa (mesma publicação usada no Dashboard)
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

  const filtered = useMemo(() => tasks.filter((t) => {
    if (sourceFilter === "adhoc" && !t.is_adhoc) return false;
    if (sourceFilter !== "all" && sourceFilter !== "adhoc" && (t.source ?? "notion") !== sourceFilter) return false;
    if (respFilter === "agent" && !isAgent(t.assigned_to)) return false;
    if (respFilter === "human" && isAgent(t.assigned_to)) return false;
    return true;
  }), [tasks, sourceFilter, respFilter]);

  const handleSync = async () => {
    if (!companyId) return;
    setSyncing(true);
    const { data, error } = await supabase.functions.invoke("sync-notion-tasks", { body: { company_id: companyId } });
    setSyncing(false);
    if (error) { toast.error(`Falha ao sincronizar: ${error.message ?? "erro"}`); return; }
    const payload = data as { coo_tasks_synced?: number; error?: string };
    if (payload?.error) { toast.error(payload.error); return; }
    toast.success(`${payload?.coo_tasks_synced ?? 0} tarefa(s) sincronizada(s).`);
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
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold">Backlog</h1>
            <p className="text-sm text-muted-foreground mt-1">Tarefas sincronizadas do Notion e comandos ad hoc.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger className="w-36"><SelectValue placeholder="Origem" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as origens</SelectItem>
                <SelectItem value="notion">Notion</SelectItem>
                <SelectItem value="asana">Asana</SelectItem>
                <SelectItem value="adhoc">Ad hoc</SelectItem>
                <SelectItem value="routine">Rotina</SelectItem>
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
            <Button onClick={handleSync} disabled={syncing} size="sm">
              {syncing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
              Sincronizar Notion
            </Button>
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
                    <p className="text-xs text-muted-foreground px-1 py-4 text-center">Vazio</p>
                  ) : (
                    items.map((t) => <TaskCard key={t.id} task={t} onClick={() => setSelected(t)} />)
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <TaskDrawer task={selected} onClose={() => setSelected(null)} />
    </AppShell>
  );
}

function TaskCard({ task, onClick }: { task: Task; onClick: () => void }) {
  const blocked = task.status === "blocked";
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-lg border bg-card p-3 hover:border-foreground/30 transition-colors ${blocked ? "border-amber-400" : ""}`}
    >
      <p className="text-sm font-medium leading-snug">{task.title}</p>
      <div className="flex flex-wrap gap-1.5 mt-2">
        {task.is_adhoc ? (
          <Badge variant="outline" className="text-[10px]">Ad hoc · {SOURCE_LABEL[task.source ?? "discord"] ?? task.source}</Badge>
        ) : (
          <Badge variant="outline" className="text-[10px]">{SOURCE_LABEL[task.source ?? "notion"] ?? task.source}</Badge>
        )}
        {isAgent(task.assigned_to) ? (
          <Badge className="text-[10px] bg-info hover:bg-info text-white"><Bot className="h-3 w-3 mr-0.5" /> Atlas</Badge>
        ) : (
          <Badge variant="secondary" className="text-[10px]"><User className="h-3 w-3 mr-0.5" /> {task.assigned_to}</Badge>
        )}
        {task.status === "done" && (
          <Badge className="text-[10px] bg-success hover:bg-success text-white"><CheckCircle2 className="h-3 w-3 mr-0.5" /> Validado</Badge>
        )}
      </div>
      {blocked && task.block_reason && (
        <p className="text-xs text-warning mt-2 line-clamp-2">⛔ {task.block_reason}</p>
      )}
    </button>
  );
}

function TaskDrawer({ task, onClose }: { task: Task | null; onClose: () => void }) {
  const [logs, setLogs] = useState<ExecutionLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

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
              {task.description && <p className="text-muted-foreground">{task.description}</p>}

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
