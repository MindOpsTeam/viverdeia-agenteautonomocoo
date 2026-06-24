import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Check, Info, Plus, Trash2, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  useRotinas, FREQUENCY_LABEL, WEEKDAYS,
  type Routine, type Frequency, type RotinasState,
} from "@/hooks/useRotinas";

function scheduleLabel(r: Routine): string {
  const time = r.schedule_time?.slice(0, 5) ?? "";
  if (r.frequency === "daily") return `Diária ${time}`;
  if (r.frequency === "weekly") return `Semanal · ${WEEKDAYS[r.schedule_day ?? 1] ?? ""} ${time}`;
  return `Mensal · dia ${r.schedule_day ?? 1} ${time}`;
}

export default function RotinasPage() {
  const { isAdmin } = useAuth();
  const state = useRotinas();
  const [dialogOpen, setDialogOpen] = useState(false);

  if (state.loading) {
    return (
      <AppShell>
        <div className="space-y-6 max-w-4xl">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-40" />
        </div>
      </AppShell>
    );
  }

  if (!state.companyId) {
    return (
      <AppShell>
        <div className="space-y-4 max-w-4xl">
          <h1 className="text-3xl font-bold">Rotinas</h1>
          <p className="text-muted-foreground">Conclua o onboarding para criar rotinas.</p>
          <Button asChild><a href="/onboarding">Fazer onboarding</a></Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-8 max-w-4xl">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Rotinas</h1>
            <p className="text-sm text-muted-foreground mt-1">Tarefas recorrentes que o agente executa sozinho.</p>
          </div>
          {isAdmin && (
            <Button size="sm" onClick={() => setDialogOpen(true)}><Plus className="h-4 w-4 mr-1" /> Nova rotina</Button>
          )}
        </header>

        {/* Aguardando aprovação */}
        {state.pending.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-xl font-semibold">Aguardando aprovação</h2>
            <div className="space-y-2">
              {state.pending.map((r) => (
                <div key={r.id} className="rounded-xl border border-warning/30 bg-warning/10 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{r.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{scheduleLabel(r)} · {r.target_system ?? "—"}</p>
                      {r.requested_by && <Badge variant="secondary" className="mt-2 text-[10px]">Solicitada por {r.requested_by}</Badge>}
                      <p className="text-sm mt-2">{r.instruction}</p>
                    </div>
                    {isAdmin && (
                      <div className="flex gap-2">
                        <Button size="sm" className="bg-success hover:bg-success/90 text-white" onClick={() => state.setStatus(r.id, "active")}>
                          <Check className="h-4 w-4 mr-1" /> Aprovar
                        </Button>
                        <Button size="sm" variant="outline" className="text-destructive border-destructive/40" onClick={() => state.setStatus(r.id, "rejected")}>
                          <X className="h-4 w-4 mr-1" /> Rejeitar
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              Nenhuma rotina é ativada sem aprovação de um admin ou aprovador.
            </p>
          </section>
        )}

        {/* Rotinas */}
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Rotinas configuradas</h2>
          {state.managed.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma rotina ativa. {isAdmin ? 'Clique em "Nova rotina".' : ""}</p>
          ) : (
            <div className="space-y-2">
              {state.managed.map((r) => <RoutineRow key={r.id} routine={r} state={state} isAdmin={isAdmin} />)}
            </div>
          )}
        </section>
      </div>

      <NewRoutineDialog open={dialogOpen} onOpenChange={setDialogOpen} onCreate={state.createRoutine} />
    </AppShell>
  );
}

function RoutineRow({ routine, state, isAdmin }: { routine: Routine; state: RotinasState; isAdmin: boolean }) {
  const paused = routine.status === "paused";
  return (
    <div className={`flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4 ${paused ? "opacity-50" : ""}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium">{routine.name}</p>
          <Badge variant="outline" className="text-[10px]">{FREQUENCY_LABEL[routine.frequency]}</Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {scheduleLabel(routine)} · {routine.target_system ?? "—"}
          {routine.last_run_at && ` · última: ${new Date(routine.last_run_at).toLocaleDateString("pt-BR")} ${routine.last_run_status ?? ""}`}
        </p>
      </div>
      {isAdmin && (
        <>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{paused ? "Pausada" : "Ativa"}</span>
            <Switch
              checked={routine.status === "active"}
              onCheckedChange={(v) => state.setStatus(routine.id, v ? "active" : "paused")}
            />
          </div>
          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => state.deleteRoutine(routine.id)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </>
      )}
    </div>
  );
}

function NewRoutineDialog({
  open, onOpenChange, onCreate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreate: RotinasState["createRoutine"];
}) {
  const [name, setName] = useState("");
  const [frequency, setFrequency] = useState<Frequency>("daily");
  const [time, setTime] = useState("18:00");
  const [day, setDay] = useState<number>(1);
  const [instruction, setInstruction] = useState("");
  const [target, setTarget] = useState("");

  const reset = () => { setName(""); setFrequency("daily"); setTime("18:00"); setDay(1); setInstruction(""); setTarget(""); };

  const submit = async () => {
    if (!name.trim() || !instruction.trim()) return;
    await onCreate({
      name, frequency, schedule_time: time,
      schedule_day: frequency === "daily" ? null : day,
      instruction, target_system: target,
    });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Nova rotina</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5"><Label>Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Relatório diário de operações" /></div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Frequência</Label>
              <Select value={frequency} onValueChange={(v) => setFrequency(v as Frequency)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Diária</SelectItem>
                  <SelectItem value="weekly">Semanal</SelectItem>
                  <SelectItem value="monthly">Mensal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Horário</Label><Input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></div>
            {frequency === "weekly" && (
              <div className="space-y-1.5">
                <Label>Dia</Label>
                <Select value={String(day)} onValueChange={(v) => setDay(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {WEEKDAYS.map((w, i) => <SelectItem key={i} value={String(i)}>{w}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {frequency === "monthly" && (
              <div className="space-y-1.5"><Label>Dia do mês</Label><Input type="number" min={1} max={28} value={day} onChange={(e) => setDay(Number(e.target.value))} /></div>
            )}
          </div>
          <div className="space-y-1.5"><Label>Sistema-alvo</Label><Input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="Ex.: Notion, Portal do fornecedor, ERP" /></div>
          <div className="space-y-1.5"><Label>Instrução (linguagem natural)</Label><Textarea value={instruction} onChange={(e) => setInstruction(e.target.value)} rows={3} placeholder="O que o agente deve fazer nesta rotina." /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={!name.trim() || !instruction.trim()}>Criar rotina</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
