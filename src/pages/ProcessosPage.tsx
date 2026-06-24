import { useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowDown, ArrowLeft, ArrowUp, Check, Eye, FileText, Globe, Link2, Loader2, Lock, Music,
  Pencil, Plus, Search, Sparkles, Trash2, Upload, UploadCloud, Users, Video, X,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
  useProcessos, VISIBILITY_META, detectImportKind,
  type Process, type ProcessStep, type Visibility, type ProcessosState,
  type ProcessImport, type ImportStatus, type DetectedProcess, type ProcessSuggestion,
} from "@/hooks/useProcessos";

function VisibilityBadge({ v }: { v: Visibility }) {
  const Icon = v === "admin" ? Lock : v === "authorized_team" ? Users : Globe;
  return <Badge variant="outline" className="text-[10px]"><Icon className="h-3 w-3 mr-1" />{VISIBILITY_META[v].label}</Badge>;
}

const STATUS_PCT: Record<ImportStatus, number> = {
  queued: 8, transcribing: 35, analyzing: 65, structuring: 85, ready: 100, error: 100,
};

function kindIcon(kind: string) {
  if (kind === "audio") return <Music className="h-4 w-4 text-violet-500" />;
  if (kind === "video") return <Video className="h-4 w-4 text-rose-500" />;
  if (kind === "url") return <Link2 className="h-4 w-4 text-blue-500" />;
  return <FileText className="h-4 w-4 text-muted-foreground" />;
}

type View = { mode: "list" } | { mode: "edit"; process: Process | null; aiBadge?: boolean } | { mode: "read"; process: Process };

export default function ProcessosPage() {
  const { isAdmin } = useAuth();
  const state = useProcessos();
  const [view, setView] = useState<View>({ mode: "list" });
  const [query, setQuery] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [reviewJob, setReviewJob] = useState<ProcessImport | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const visibleProcesses = useMemo(() => {
    const q = query.trim().toLowerCase();
    return state.processes
      .filter((p) => isAdmin || p.status === "published")
      .filter((p) => !q || (p.name + " " + (p.area ?? "")).toLowerCase().includes(q));
  }, [state.processes, isAdmin, query]);

  const observed = useMemo(
    () => state.suggestions.filter((s) => !s.process_id && s.suggested_process),
    [state.suggestions],
  );

  const handleFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    for (const f of Array.from(files)) await state.startFileImport(f);
  };

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (fileRef.current) fileRef.current.value = "";
    await handleFiles(files);
  };

  const importUrl = async () => {
    const u = urlInput.trim();
    if (!u) return;
    const ok = await state.startUrlImport(u);
    if (ok) setUrlInput("");
  };

  // Abre o resultado de um job pronto para revisão.
  const openReview = async (job: ProcessImport) => {
    const result = job.result ?? [];
    if (result.length === 0) {
      toast.message("Nenhum processo identificado neste conteúdo.", { description: "Você pode criar um processo manualmente." });
      await state.dismissImport(job.id);
      setView({ mode: "edit", process: null });
      return;
    }
    if (result.length === 1) {
      const created = await state.createProcessesFromImport(job, result);
      if (created[0]) setView({ mode: "edit", process: created[0], aiBadge: true });
      return;
    }
    setReviewJob(job);
  };

  const confirmMultiSelect = async (picks: DetectedProcess[]) => {
    if (!reviewJob) return;
    const created = await state.createProcessesFromImport(reviewJob, picks);
    setReviewJob(null);
    toast.success(`${created.length} rascunho(s) criado(s) — revise e publique.`);
    if (created[0]) setView({ mode: "edit", process: created[0], aiBadge: true });
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
            <Button size="sm" onClick={() => setView({ mode: "edit", process: null })}><Plus className="h-4 w-4 mr-1" /> Novo processo</Button>
          )}
        </header>

        {/* Importação multi-formato */}
        {isAdmin && (
          <div className="space-y-3">
            <input ref={fileRef} type="file" className="hidden" multiple
              accept=".pdf,.docx,.txt,.vtt,.srt,.mp3,.m4a,.wav,.mp4,.mov,audio/*,video/*" onChange={onPickFile} />
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
              onClick={() => fileRef.current?.click()}
              className={`cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition ${dragOver ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"}`}
            >
              <UploadCloud className="h-7 w-7 mx-auto text-muted-foreground" />
              <p className="text-sm font-medium mt-2">Arraste arquivos aqui ou clique para enviar</p>
              <p className="text-xs text-muted-foreground mt-1">
                <Music className="inline h-3 w-3" /> áudio · <Video className="inline h-3 w-3" /> vídeo ·{" "}
                <FileText className="inline h-3 w-3" /> PDF/DOCX · transcrição (TXT/VTT/SRT) — até 25MB
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">O Atlas transcreve, analisa e estrutura em passos. Você revisa e publica.</p>
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input className="pl-9" placeholder="Cole um link do YouTube ou Loom…" value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") importUrl(); }} />
              </div>
              <Button variant="outline" onClick={importUrl} disabled={!urlInput.trim()}><Upload className="h-4 w-4 mr-1" /> Importar URL</Button>
            </div>
          </div>
        )}

        {/* Jobs de importação em andamento / prontos */}
        {state.imports.length > 0 && (
          <div className="space-y-2">
            {state.imports.map((job) => (
              <ImportRow key={job.id} job={job} onReview={() => openReview(job)} onDismiss={() => state.dismissImport(job.id)} />
            ))}
          </div>
        )}

        {/* Card: O que o Atlas observou (processos não documentados) */}
        {isAdmin && observed.map((s) => (
          <ObservedCard key={s.id} suggestion={s} processes={state.processes}
            onCreate={async () => { const p = await state.createProcessFromSuggestion(s); if (p) setView({ mode: "edit", process: p, aiBadge: true }); }}
            onAddTo={(pid) => state.addSuggestionToProcess(s, pid)}
            onIgnore={() => state.setSuggestionStatus(s.id, "ignored")} />
        ))}

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar processo…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>

        {visibleProcesses.length === 0 ? (
          <p className="text-sm text-muted-foreground">{isAdmin ? "Nenhum processo ainda. Crie, importe ou cole um link." : "Nenhum processo publicado ainda."}</p>
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

      {/* Dialog de seleção quando 2+ processos detectados */}
      <MultiSelectDialog job={reviewJob} onClose={() => setReviewJob(null)} onConfirm={confirmMultiSelect} />
    </AppShell>
  );
}

/* ---------------- Linha de importação (job) ---------------- */

function ImportRow({ job, onReview, onDismiss }: { job: ProcessImport; onReview: () => void; onDismiss: () => void }) {
  if (job.status === "error") {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50/60 p-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {kindIcon(job.kind)}
          <div className="min-w-0">
            <p className="text-sm truncate">{job.source_name}</p>
            <p className="text-xs text-rose-700">{job.error ?? "Falha ao processar."}</p>
          </div>
        </div>
        <Button size="sm" variant="ghost" onClick={onDismiss}><X className="h-3.5 w-3.5" /></Button>
      </div>
    );
  }
  if (job.status === "ready") {
    const n = (job.result ?? []).length;
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {kindIcon(job.kind)}
          <div className="min-w-0">
            <p className="text-sm truncate">{job.source_name}</p>
            <p className="text-xs text-emerald-700">{n > 0 ? `${n} processo(s) detectado(s) · pronto para revisar` : "Nenhum processo identificado"}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={onReview}><Eye className="h-3.5 w-3.5 mr-1" /> Revisar</Button>
          <Button size="sm" variant="ghost" onClick={onDismiss}><X className="h-3.5 w-3.5" /></Button>
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-lg border bg-card p-3 space-y-2">
      <div className="flex items-center gap-2">
        {kindIcon(job.kind)}
        <span className="text-sm truncate flex-1">{job.source_name}</span>
        <span className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />{job.progress_message ?? "Processando…"}</span>
      </div>
      <Progress value={STATUS_PCT[job.status]} className="h-1.5" />
    </div>
  );
}

/* ---------------- Card "O que o Atlas observou" ---------------- */

function ObservedCard({ suggestion, processes, onCreate, onAddTo, onIgnore }: {
  suggestion: ProcessSuggestion; processes: Process[];
  onCreate: () => void; onAddTo: (processId: string) => void; onIgnore: () => void;
}) {
  const sp = suggestion.suggested_process!;
  const published = processes.filter((p) => p.status === "published");
  const [addMode, setAddMode] = useState(false);
  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Sparkles className="h-4 w-4 text-blue-600" />
        <span className="text-sm font-medium">O que o Atlas observou</span>
        {suggestion.evidence?.count ? <Badge className="text-[10px] bg-blue-600 hover:bg-blue-600">{suggestion.evidence.count} execução(ões) observada(s)</Badge> : null}
      </div>
      <div>
        <p className="text-sm font-medium">{sp.name}{sp.area ? ` · ${sp.area}` : ""}</p>
        <ol className="list-decimal pl-5 mt-1 text-sm text-muted-foreground space-y-0.5">
          {sp.steps.slice(0, 5).map((s, i) => <li key={i}>{s.description}</li>)}
        </ol>
      </div>
      {addMode ? (
        <div className="flex flex-wrap items-center gap-2">
          <Select onValueChange={(pid) => { onAddTo(pid); setAddMode(false); }}>
            <SelectTrigger className="w-64"><SelectValue placeholder="Escolha o processo…" /></SelectTrigger>
            <SelectContent>
              {published.length ? published.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)
                : <div className="px-2 py-1.5 text-xs text-muted-foreground">Nenhum processo publicado</div>}
            </SelectContent>
          </Select>
          <Button size="sm" variant="ghost" onClick={() => setAddMode(false)}>Cancelar</Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={onCreate}><Plus className="h-4 w-4 mr-1" /> Criar processo a partir disso</Button>
          <Button size="sm" variant="outline" onClick={() => setAddMode(true)}><Pencil className="h-4 w-4 mr-1" /> Adicionar a processo existente</Button>
          <Button size="sm" variant="ghost" className="text-destructive" onClick={onIgnore}><X className="h-4 w-4 mr-1" /> Ignorar</Button>
        </div>
      )}
    </div>
  );
}

/* ---------------- Dialog de seleção múltipla ---------------- */

function MultiSelectDialog({ job, onClose, onConfirm }: {
  job: ProcessImport | null; onClose: () => void; onConfirm: (picks: DetectedProcess[]) => void;
}) {
  const result = job?.result ?? [];
  const [picked, setPicked] = useState<Record<number, boolean>>({});
  const [saving, setSaving] = useState(false);

  // Reinicia a seleção (tudo marcado) quando um novo job entra.
  const jobId = job?.id ?? "";
  const initKey = useRef("");
  if (jobId && initKey.current !== jobId) {
    initKey.current = jobId;
    const all: Record<number, boolean> = {};
    result.forEach((_, i) => { all[i] = true; });
    setPicked(all);
  }

  const chosen = result.filter((_, i) => picked[i]);

  return (
    <Dialog open={!!job} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Identifiquei {result.length} processos nesse conteúdo</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">Escolha quais o Atlas deve documentar. Cada um vira um rascunho para você revisar.</p>
        <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
          {result.map((p, i) => (
            <label key={i} className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/40">
              <Checkbox checked={!!picked[i]} onCheckedChange={(v) => setPicked((s) => ({ ...s, [i]: !!v }))} className="mt-0.5" />
              <div className="min-w-0">
                <p className="text-sm font-medium">{p.name}{p.area ? ` · ${p.area}` : ""}</p>
                <p className="text-xs text-muted-foreground">{p.steps.length} passo(s)</p>
              </div>
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button disabled={!chosen.length || saving} onClick={async () => { setSaving(true); await onConfirm(chosen); setSaving(false); }}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Documentar {chosen.length || ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
        const stepDesc = sg.suggested_step?.description ?? "";
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
              <p className="text-sm">{stepDesc}</p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700"
                onClick={async () => {
                  const desc = isEditing ? editing!.text : stepDesc;
                  addStep({ description: desc, responsible: sg.suggested_step?.responsible ?? "", sla: sg.suggested_step?.sla ?? "" });
                  await state.setSuggestionStatus(sg.id, "accepted");
                  setEditing(null);
                  toast.success("Passo adicionado — salve o processo para confirmar.");
                }}>
                <Check className="h-4 w-4 mr-1" /> Aceitar
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditing(isEditing ? null : { id: sg.id, text: stepDesc })}><Pencil className="h-4 w-4 mr-1" /> Editar</Button>
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
