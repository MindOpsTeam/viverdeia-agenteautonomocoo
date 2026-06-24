import { useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowDown, ArrowLeft, ArrowUp, Check, Globe, Loader2, Lock, Pencil, Plus,
  Search, Sparkles, Trash2, Upload, Users, X,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
  useProcessos, VISIBILITY_META,
  type Process, type ProcessStep, type Visibility, type ProcessosState,
} from "@/hooks/useProcessos";

function VisibilityBadge({ v }: { v: Visibility }) {
  const Icon = v === "admin" ? Lock : v === "authorized_team" ? Users : Globe;
  return <Badge variant="outline" className="text-[10px]"><Icon className="h-3 w-3 mr-1" />{VISIBILITY_META[v].label}</Badge>;
}

type View = { mode: "list" } | { mode: "edit"; process: Process | null; aiBadge?: boolean } | { mode: "read"; process: Process };

export default function ProcessosPage() {
  const { isAdmin } = useAuth();
  const state = useProcessos();
  const [view, setView] = useState<View>({ mode: "list" });
  const [query, setQuery] = useState("");
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const visibleProcesses = useMemo(() => {
    const q = query.trim().toLowerCase();
    return state.processes
      .filter((p) => isAdmin || p.status === "published")
      .filter((p) => !q || (p.name + " " + (p.area ?? "")).toLowerCase().includes(q));
  }, [state.processes, isAdmin, query]);

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    setImporting(true);
    const result = await state.importFromFile(file);
    setImporting(false);
    if (!result) return;
    setView({
      mode: "edit",
      aiBadge: true,
      process: {
        id: "", company_id: state.companyId ?? "", name: result.name, area: result.area,
        visibility: "admin", status: "draft", steps: result.steps, source: "imported", updated_at: "",
      },
    });
  };

  if (state.loading) {
    return <AppShell><div className="space-y-6 max-w-4xl"><Skeleton className="h-9 w-48" /><Skeleton className="h-40" /></div></AppShell>;
  }
  if (!state.companyId) {
    return (
      <AppShell>
        <div className="space-y-4 max-w-4xl">
          <h1 className="text-3xl font-bold">Processos</h1>
          <p className="text-muted-foreground">Conclua o onboarding para registrar processos.</p>
          <Button asChild><a href="/onboarding">Fazer onboarding</a></Button>
        </div>
      </AppShell>
    );
  }

  if (view.mode === "edit") {
    return <AppShell><ProcessEditor state={state} process={view.process} aiBadge={view.aiBadge} onBack={() => setView({ mode: "list" })} /></AppShell>;
  }
  if (view.mode === "read") {
    return <AppShell><ProcessReadOnly process={view.process} onBack={() => setView({ mode: "list" })} /></AppShell>;
  }

  return (
    <AppShell>
      <div className="space-y-6 max-w-4xl">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold">Processos</h1>
            <p className="text-sm text-muted-foreground mt-1">Memória operacional viva — como cada coisa é feita aqui.</p>
          </div>
          {isAdmin && (
            <div className="flex gap-2">
              <input ref={fileRef} type="file" className="hidden" accept=".pdf,.docx" onChange={onPickFile} />
              <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={importing}>
                {importing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Upload className="h-4 w-4 mr-1" />} Importar
              </Button>
              <Button size="sm" onClick={() => setView({ mode: "edit", process: null })}><Plus className="h-4 w-4 mr-1" /> Novo processo</Button>
            </div>
          )}
        </header>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar processo…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>

        {visibleProcesses.length === 0 ? (
          <p className="text-sm text-muted-foreground">{isAdmin ? "Nenhum processo ainda. Crie ou importe um." : "Nenhum processo publicado ainda."}</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {visibleProcesses.map((p) => (
              <button key={p.id} onClick={() => setView(isAdmin ? { mode: "edit", process: p } : { mode: "read", process: p })}
                className="text-left rounded-xl border bg-card p-4 hover:border-foreground/30 transition-colors">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{p.name}</span>
                  {p.status === "draft" ? <Badge variant="secondary" className="text-[10px]">Rascunho</Badge> : <Badge className="text-[10px] bg-emerald-600 hover:bg-emerald-600">Publicado</Badge>}
                </div>
                <p className="text-xs text-muted-foreground mt-1">{p.area || "Sem área"} · {p.steps.length} passo(s)</p>
                <div className="mt-2"><VisibilityBadge v={p.visibility} /></div>
              </button>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

/* ---------------- Editor ---------------- */

function ProcessEditor({ state, process, aiBadge, onBack }: {
  state: ProcessosState; process: Process | null; aiBadge?: boolean; onBack: () => void;
}) {
  const [name, setName] = useState(process?.name ?? "");
  const [area, setArea] = useState(process?.area ?? "");
  const [visibility, setVisibility] = useState<Visibility>(process?.visibility ?? "admin");
  const [steps, setSteps] = useState<ProcessStep[]>(process?.steps ?? []);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const procSuggestions = process?.id ? state.suggestions.filter((s) => s.process_id === process.id) : [];

  const setStep = (i: number, patch: Partial<ProcessStep>) =>
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const addStep = (s?: ProcessStep) => setSteps((prev) => [...prev, s ?? { description: "", responsible: "", sla: "" }]);
  const removeStep = (i: number) => setSteps((prev) => prev.filter((_, idx) => idx !== i));
  const move = (i: number, dir: -1 | 1) => setSteps((prev) => {
    const j = i + dir; if (j < 0 || j >= prev.length) return prev;
    const next = [...prev]; [next[i], next[j]] = [next[j], next[i]]; return next;
  });

  const valid = !!name.trim() && steps.some((s) => s.description.trim());

  const save = async (status: "draft" | "published") => {
    if (!valid) { toast.error("Informe o nome e ao menos um passo."); return; }
    setSaving(true);
    const saved = await state.saveProcess({
      id: process?.id || undefined, name, area, visibility, status,
      steps: steps.filter((s) => s.description.trim()),
      source: process?.source ?? "manual",
    });
    setSaving(false);
    if (saved) { toast.success(status === "published" ? "Processo publicado" : "Rascunho salvo"); onBack(); }
  };

  const remove = async () => {
    if (!process?.id) { onBack(); return; }
    await state.deleteProcess(process.id);
    toast.success("Processo excluído");
    onBack();
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <button onClick={onBack} className="text-sm text-muted-foreground inline-flex items-center gap-1 hover:underline"><ArrowLeft className="h-4 w-4" /> Voltar</button>

      <div>
        <h1 className="text-2xl font-bold">{process?.id ? "Editar processo" : "Novo processo"}</h1>
        {aiBadge && <Badge className="mt-2 bg-blue-600 hover:bg-blue-600">Estruturado por IA · Revise antes de publicar</Badge>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5 col-span-2 sm:col-span-1"><Label>Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="space-y-1.5 col-span-2 sm:col-span-1"><Label>Área</Label><Input value={area} onChange={(e) => setArea(e.target.value)} placeholder="Ex.: Financeiro" /></div>
        <div className="space-y-1.5 col-span-2 sm:col-span-1">
          <Label>Visibilidade</Label>
          <Select value={visibility} onValueChange={(v) => setVisibility(v as Visibility)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">🔒 Admin</SelectItem>
              <SelectItem value="authorized_team">👥 Time autorizado</SelectItem>
              <SelectItem value="everyone">🌐 Todo o time</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Sugestões do Atlas (process_suggestions pendentes deste processo) */}
      {procSuggestions.map((sg) => {
        const isEditing = editing?.id === sg.id;
        return (
          <div key={sg.id} className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Sparkles className="h-4 w-4 text-blue-600" />
              <span className="text-sm font-medium">Sugestão do Atlas</span>
              <Badge className="text-[10px] bg-blue-600 hover:bg-blue-600">OBSERVADO EM CAMPO</Badge>
              {sg.evidence?.count ? <span className="text-xs text-muted-foreground">{sg.evidence.count} execução(ões) observada(s)</span> : null}
            </div>
            {isEditing ? (
              <Textarea value={editing!.text} onChange={(e) => setEditing({ id: sg.id, text: e.target.value })} rows={2} />
            ) : (
              <p className="text-sm">{sg.suggested_step.description}</p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700"
                onClick={async () => {
                  const desc = isEditing ? editing!.text : sg.suggested_step.description;
                  addStep({ description: desc, responsible: sg.suggested_step.responsible ?? "", sla: sg.suggested_step.sla ?? "" });
                  await state.setSuggestionStatus(sg.id, "accepted");
                  setEditing(null);
                  toast.success("Passo adicionado — salve o processo para confirmar.");
                }}>
                <Check className="h-4 w-4 mr-1" /> Aceitar
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditing(isEditing ? null : { id: sg.id, text: sg.suggested_step.description })}><Pencil className="h-4 w-4 mr-1" /> Editar</Button>
              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => state.setSuggestionStatus(sg.id, "ignored")}><X className="h-4 w-4 mr-1" /> Ignorar</Button>
            </div>
          </div>
        );
      })}

      {/* Passos */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Passos</h2>
          <Button size="sm" variant="outline" onClick={() => addStep()}><Plus className="h-4 w-4 mr-1" /> Adicionar passo</Button>
        </div>
        {steps.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum passo. Adicione o primeiro.</p>
        ) : steps.map((s, i) => (
          <div key={i} className="rounded-lg border p-3 space-y-2">
            <div className="flex items-start gap-2">
              <span className="mt-2 h-6 w-6 shrink-0 rounded-full bg-muted flex items-center justify-center text-xs font-medium">{i + 1}</span>
              <Textarea value={s.description} onChange={(e) => setStep(i, { description: e.target.value })} rows={2} placeholder="O que fazer neste passo" className="flex-1" />
              <div className="flex flex-col gap-1">
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => move(i, -1)} disabled={i === 0}><ArrowUp className="h-3.5 w-3.5" /></Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => move(i, 1)} disabled={i === steps.length - 1}><ArrowDown className="h-3.5 w-3.5" /></Button>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeStep(i)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 pl-8">
              <div className="space-y-1">
                <Label className="text-xs">Responsável</Label>
                <Select value={s.responsible || "none"} onValueChange={(v) => setStep(i, { responsible: v === "none" ? "" : v })}>
                  <SelectTrigger className="h-8"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {state.members.map((m) => <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">SLA</Label>
                <Input className="h-8" value={s.sla} onChange={(e) => setStep(i, { sla: e.target.value })} placeholder="Ex.: 24h" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
        {process?.id ? <Button variant="ghost" className="text-destructive" onClick={remove}><Trash2 className="h-4 w-4 mr-1" /> Excluir</Button> : <span />}
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => save("draft")} disabled={saving || !valid}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Salvar rascunho
          </Button>
          <Button onClick={() => save("published")} disabled={saving || !valid}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Publicar
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Leitura (não-admin) ---------------- */

function ProcessReadOnly({ process, onBack }: { process: Process; onBack: () => void }) {
  return (
    <div className="space-y-5 max-w-3xl">
      <button onClick={onBack} className="text-sm text-muted-foreground inline-flex items-center gap-1 hover:underline"><ArrowLeft className="h-4 w-4" /> Voltar</button>
      <div>
        <h1 className="text-2xl font-bold">{process.name}</h1>
        <p className="text-sm text-muted-foreground mt-1">{process.area || "Sem área"}</p>
      </div>
      <ol className="space-y-2">
        {process.steps.map((s, i) => (
          <li key={i} className="rounded-lg border p-3">
            <div className="flex gap-2">
              <span className="h-6 w-6 shrink-0 rounded-full bg-muted flex items-center justify-center text-xs font-medium">{i + 1}</span>
              <div className="flex-1">
                <p className="text-sm">{s.description}</p>
                {(s.responsible || s.sla) && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {s.responsible && `Responsável: ${s.responsible}`}{s.responsible && s.sla && " · "}{s.sla && `SLA: ${s.sla}`}
                  </p>
                )}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
