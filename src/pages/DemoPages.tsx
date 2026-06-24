import { useMemo, useState } from "react";
import { DemoShell } from "@/demo/DemoShell";
import { DEMO, demoGreeting, type DemoTask } from "@/demo/seed";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  ArrowRight, Bot, ChevronDown, ChevronRight, Send, Sparkles, User, Lock, Users as UsersIcon, Globe, GitBranch, ExternalLink,
} from "lucide-react";

const PERM_LABEL: Record<string, { label: string; cls: string }> = {
  can_command: { label: "Pode dar ordens", cls: "bg-blue-600 hover:bg-blue-600" },
  receives_notifications: { label: "Recebe notificações", cls: "bg-emerald-600 hover:bg-emerald-600" },
  authorizes_approvals: { label: "Autoriza aprovações", cls: "bg-amber-500 hover:bg-amber-500" },
  readonly: { label: "Somente leitura", cls: "bg-slate-400 hover:bg-slate-400" },
};
const PURPOSE_LABEL: Record<string, string> = { receive_commands: "Receber comandos", send_reports: "Enviar relatórios", alerts: "Alertas de bloqueio", notifications: "Notificações de conclusão" };
const VIS = { admin: { I: Lock, l: "Admin" }, authorized_team: { I: UsersIcon, l: "Time autorizado" }, everyone: { I: Globe, l: "Todo o time" } } as const;
const SOURCE_LABEL: Record<string, string> = { notion: "Notion", routine: "Rotina", discord: "Discord", asana: "Asana" };

function isAgent(a: string) { return a === "coo" || a === "agent"; }

/* ---------------- Início ---------------- */
export function DemoHome() {
  const stats = useMemo(() => ({
    done: DEMO.tasks.filter((t) => t.status === "done").length,
    doing: DEMO.tasks.filter((t) => t.status === "doing").length,
    blocked: DEMO.tasks.filter((t) => t.status === "blocked").length,
  }), []);
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const send = (text: string) => {
    const msg = text.trim(); if (!msg) return;
    setMessages((p) => [...p, { role: "user", content: msg },
      { role: "assistant", content: "No modo demonstração eu não executo ações de verdade — mas na plataforma real eu faria isso agora e te avisaria no Discord. 🙂" }]);
    setInput("");
  };

  const suggestions = [
    { id: "blk", text: `${stats.blocked} tarefa(s) bloqueada(s) esperando você.`, href: "/demo/backlog", label: "Ver no Backlog" },
    { id: "sug", text: `${DEMO.suggestions.length} sugestão(ões) de processo observadas em campo.`, href: "/demo/processos", label: "Ver processos" },
    { id: "rot", text: `Próxima rotina: "${DEMO.routines[0].name}" · ${DEMO.routines[0].schedule}.`, href: "/demo/rotinas", label: "Ver rotinas" },
  ].filter((s) => !dismissed.has(s.id));

  return (
    <DemoShell>
      <div className="max-w-3xl mx-auto space-y-5">
        <div className="flex gap-3 pt-2">
          <div className="h-9 w-9 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0"><Bot className="h-5 w-5" /></div>
          <div>
            <h1 className="text-xl font-semibold">{demoGreeting()}, {DEMO.user}. Aqui está o que importa agora:</h1>
            <p className="text-sm text-muted-foreground mt-1">{stats.done} concluída(s) · {stats.doing} em andamento · {stats.blocked} bloqueada(s) em {DEMO.company}.</p>
          </div>
        </div>

        <div className="space-y-2 md:pl-12">
          {suggestions.map((s) => (
            <div key={s.id} className="rounded-xl border bg-card p-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm flex-1 min-w-[200px]">{s.text}</span>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" asChild><a href={s.href}>{s.label} <ArrowRight className="h-3.5 w-3.5 ml-1" /></a></Button>
                <Button size="sm" variant="ghost" onClick={() => setDismissed((p) => new Set(p).add(s.id))}>Ignorar</Button>
              </div>
            </div>
          ))}

          {messages.map((m, i) => (
            <div key={i} className={`flex gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              {m.role === "assistant" && <div className="h-8 w-8 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0"><Bot className="h-4 w-4" /></div>}
              <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{m.content}</div>
              {m.role === "user" && <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0"><User className="h-4 w-4" /></div>}
            </div>
          ))}
        </div>

        <div className="sticky bottom-16 md:bottom-2 border-t bg-background pt-3 flex gap-2">
          <Input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send(input)} placeholder="Fale com o Atlas..." />
          <Button onClick={() => send(input)} disabled={!input.trim()}><Send className="h-4 w-4" /></Button>
        </div>
      </div>
    </DemoShell>
  );
}

/* ---------------- Backlog ---------------- */
const COLS: { key: DemoTask["status"]; label: string }[] = [
  { key: "todo", label: "A Fazer" }, { key: "doing", label: "Em Execução" }, { key: "blocked", label: "Bloqueado" }, { key: "done", label: "Concluído" },
];
export function DemoBacklog() {
  return (
    <DemoShell>
      <header className="mb-6"><h1 className="text-3xl font-bold">Backlog</h1><p className="text-sm text-muted-foreground mt-1">Tarefas sincronizadas do Notion e comandos ad hoc.</p></header>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {COLS.map((col) => {
          const items = DEMO.tasks.filter((t) => t.status === col.key);
          return (
            <div key={col.key} className="rounded-xl bg-muted/40 p-3">
              <div className="flex items-center justify-between mb-3 px-1"><h2 className="text-sm font-semibold">{col.label}</h2><span className="text-xs text-muted-foreground">{items.length}</span></div>
              <div className="space-y-2">
                {items.map((t) => (
                  <div key={t.id} className={`rounded-lg border bg-card p-3 ${t.status === "blocked" ? "border-amber-400" : ""}`}>
                    <p className="text-sm font-medium leading-snug">{t.title}</p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <Badge variant="outline" className="text-[10px]">{t.is_adhoc ? `Ad hoc · ${SOURCE_LABEL[t.source]}` : SOURCE_LABEL[t.source]}</Badge>
                      {isAgent(t.assigned_to)
                        ? <Badge className="text-[10px] bg-blue-600 hover:bg-blue-600"><Bot className="h-3 w-3 mr-0.5" /> Atlas</Badge>
                        : <Badge variant="secondary" className="text-[10px]"><User className="h-3 w-3 mr-0.5" /> {t.assigned_to}</Badge>}
                      {t.status === "done" && <Badge className="text-[10px] bg-emerald-600 hover:bg-emerald-600">✓ Validado</Badge>}
                    </div>
                    {t.block_reason && <p className="text-xs text-amber-700 mt-2">⛔ {t.block_reason}</p>}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </DemoShell>
  );
}

/* ---------------- Rotinas ---------------- */
const FREQ: Record<string, string> = { daily: "Diária", weekly: "Semanal", monthly: "Mensal" };
export function DemoRotinas() {
  return (
    <DemoShell>
      <header className="mb-6"><h1 className="text-3xl font-bold">Rotinas</h1><p className="text-sm text-muted-foreground mt-1">Tarefas recorrentes que o Atlas executa sozinho.</p></header>
      <div className="space-y-2 max-w-3xl">
        {DEMO.routines.map((r) => (
          <div key={r.id} className={`flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4 ${r.status === "paused" ? "opacity-50" : ""}`}>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2"><p className="font-medium">{r.name}</p><Badge variant="outline" className="text-[10px]">{FREQ[r.frequency]}</Badge></div>
              <p className="text-xs text-muted-foreground mt-0.5">{r.schedule} · {r.target} · última: {r.last}</p>
            </div>
            <div className="flex items-center gap-2"><span className="text-xs text-muted-foreground">{r.status === "paused" ? "Pausada" : "Ativa"}</span><Switch checked={r.status === "active"} disabled /></div>
          </div>
        ))}
      </div>
    </DemoShell>
  );
}

/* ---------------- Processos ---------------- */
export function DemoProcessos() {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = DEMO.processes.find((p) => p.id === openId);
  if (open) {
    const sugg = DEMO.suggestions.filter((s) => s.process_id === open.id);
    return (
      <DemoShell>
        <div className="max-w-3xl space-y-5">
          <button onClick={() => setOpenId(null)} className="text-sm text-muted-foreground hover:underline">← Voltar</button>
          <div><h1 className="text-2xl font-bold">{open.name}</h1><p className="text-sm text-muted-foreground">{open.area}</p></div>
          {sugg.map((s) => (
            <div key={s.id} className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 space-y-2">
              <div className="flex items-center gap-2 flex-wrap"><Sparkles className="h-4 w-4 text-blue-600" /><span className="text-sm font-medium">Sugestão do Atlas</span><Badge className="text-[10px] bg-blue-600 hover:bg-blue-600">OBSERVADO EM CAMPO</Badge><span className="text-xs text-muted-foreground">{s.count} execuções observadas</span></div>
              <p className="text-sm">{s.description}</p>
              <div className="flex gap-2"><Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" disabled>Aceitar</Button><Button size="sm" variant="ghost" disabled>Ignorar</Button></div>
            </div>
          ))}
          <ol className="space-y-2">
            {open.steps.map((s, i) => (
              <li key={i} className="rounded-lg border p-3 flex gap-2">
                <span className="h-6 w-6 shrink-0 rounded-full bg-muted flex items-center justify-center text-xs font-medium">{i + 1}</span>
                <div><p className="text-sm">{s.description}</p>{(s.responsible || s.sla) && <p className="text-xs text-muted-foreground mt-1">{s.responsible && `Responsável: ${s.responsible}`}{s.responsible && s.sla && " · "}{s.sla && `SLA: ${s.sla}`}</p>}</div>
              </li>
            ))}
          </ol>
        </div>
      </DemoShell>
    );
  }
  return (
    <DemoShell>
      <header className="mb-6"><h1 className="text-3xl font-bold">Processos</h1><p className="text-sm text-muted-foreground mt-1">Memória operacional viva — como cada coisa é feita aqui.</p></header>
      <div className="grid gap-3 md:grid-cols-2 max-w-3xl">
        {DEMO.processes.map((p) => {
          const V = VIS[p.visibility];
          return (
            <button key={p.id} onClick={() => setOpenId(p.id)} className="text-left rounded-xl border bg-card p-4 hover:border-foreground/30 transition-colors">
              <div className="flex items-center justify-between gap-2"><span className="font-medium">{p.name}</span><Badge className="text-[10px] bg-emerald-600 hover:bg-emerald-600">Publicado</Badge></div>
              <p className="text-xs text-muted-foreground mt-1">{p.area} · {p.steps.length} passo(s)</p>
              <Badge variant="outline" className="text-[10px] mt-2"><V.I className="h-3 w-3 mr-1" />{V.l}</Badge>
            </button>
          );
        })}
      </div>
    </DemoShell>
  );
}

/* ---------------- Time & Canais ---------------- */
export function DemoTime() {
  return (
    <DemoShell>
      <header className="mb-6"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quem é quem</p><h1 className="text-3xl font-bold">Time & Canais</h1><p className="text-sm text-muted-foreground mt-1">O Atlas trata cada pessoa conforme a permissão.</p></header>
      <div className="max-w-4xl space-y-8">
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Membros do time</h2>
          <div className="rounded-xl border">
            <Table>
              <TableHeader><TableRow><TableHead>Membro</TableHead><TableHead>Cargo</TableHead><TableHead>Permissão</TableHead></TableRow></TableHeader>
              <TableBody>
                {DEMO.members.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell><div className="flex items-center gap-2"><Avatar className="h-8 w-8"><AvatarFallback className="text-xs">{m.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}</AvatarFallback></Avatar><div><div className="font-medium text-sm">{m.name}</div><div className="text-xs text-muted-foreground">{m.handle} · {m.channel}</div></div></div></TableCell>
                    <TableCell className="text-sm">{m.role}</TableCell>
                    <TableCell><div className="flex flex-wrap gap-1">{m.permissions.map((p) => <Badge key={p} className={`text-[10px] ${PERM_LABEL[p].cls}`}>{PERM_LABEL[p].label}</Badge>)}</div></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Canais e seus propósitos</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {DEMO.channels.map((c) => (
              <div key={c.name} className="rounded-xl border bg-card p-4">
                <span className="font-medium">{c.name}</span>
                <div className="flex flex-wrap gap-1 mt-2">{c.purposes.map((p) => <Badge key={p} variant="secondary" className="text-[10px]">{PURPOSE_LABEL[p]}</Badge>)}</div>
                <p className="text-xs text-muted-foreground mt-2">{c.platform} · Menciona: {c.mentions.join(", ")}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </DemoShell>
  );
}

/* ---------------- Conversar ---------------- */
const TYPE_LABEL: Record<string, string> = { command: "Comando", response: "Resposta", report: "Relatório", alert: "Alerta" };
export function DemoConversar() {
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [input, setInput] = useState("");
  const send = (text: string) => {
    const msg = text.trim(); if (!msg) return;
    setMessages((p) => [...p, { role: "user", content: msg }, { role: "assistant", content: "Modo demonstração: não executo ações reais aqui. Na plataforma, eu responderia com base na identidade e diretrizes do Cérebro." }]);
    setInput("");
  };
  return (
    <DemoShell>
      <div className="max-w-4xl space-y-6">
        <header><h1 className="text-3xl font-bold">Conversar</h1><p className="text-sm text-muted-foreground mt-1">Atlas · responde aqui, no Discord e no Slack.</p></header>
        <Tabs defaultValue="chat">
          <TabsList><TabsTrigger value="chat">Chat direto</TabsTrigger><TabsTrigger value="hist">Histórico de canais</TabsTrigger></TabsList>
          <TabsContent value="chat" className="mt-6">
            <div className="rounded-xl border bg-card p-4 space-y-3 min-h-[40vh]">
              {messages.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">Dê uma ordem ou pergunte algo.</p>}
              {messages.map((m, i) => (
                <div key={i} className={`flex gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  {m.role === "assistant" && <div className="h-8 w-8 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0"><Bot className="h-4 w-4" /></div>}
                  <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{m.content}</div>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-3"><Input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send(input)} placeholder="Dê uma ordem..." /><Button onClick={() => send(input)} disabled={!input.trim()}><Send className="h-4 w-4" /></Button></div>
          </TabsContent>
          <TabsContent value="hist" className="mt-6">
            <ul className="divide-y rounded-xl border">
              {DEMO.messages.map((m) => (
                <li key={m.id} className="px-4 py-3 flex gap-3">
                  <Badge variant="outline" className="text-[10px] h-fit">discord</Badge>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap"><span className="text-xs font-medium">{m.channel}</span><span className="text-xs text-muted-foreground">· {m.sender}</span><Badge variant="secondary" className="text-[10px]">{TYPE_LABEL[m.type]}</Badge></div>
                    <p className="text-sm mt-1">{m.content}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{m.at}</p>
                  </div>
                </li>
              ))}
            </ul>
          </TabsContent>
        </Tabs>
      </div>
    </DemoShell>
  );
}

/* ---------------- Relatórios ---------------- */
export function DemoRelatorios() {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <DemoShell>
      <div className="max-w-4xl space-y-6">
        <header><h1 className="text-3xl font-bold">Relatórios</h1><p className="text-sm text-muted-foreground mt-1">Daily Reports e tendência de taxa de sucesso.</p></header>
        <Card><CardContent className="pt-6">
          <h2 className="text-sm font-semibold mb-4">Taxa de sucesso · últimos 7 dias</h2>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={DEMO.trend} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" /><XAxis dataKey="date" fontSize={11} /><YAxis domain={[0, 100]} fontSize={11} unit="%" /><Tooltip /><Line type="monotone" dataKey="taxa" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent></Card>
        <section className="space-y-2">
          <h2 className="text-xl font-semibold">Histórico</h2>
          {DEMO.reports.map((r) => (
            <div key={r.id} className="rounded-xl border bg-card">
              <button className="w-full flex items-center gap-3 p-4 text-left" onClick={() => setOpen(open === r.id ? null : r.id)}>
                {open === r.id ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                <div className="flex-1"><span className="font-medium text-sm">{r.date}</span><p className="text-xs text-muted-foreground mt-0.5">{r.done} concluídas · {r.blocked} bloqueadas · {r.doing} em andamento</p></div>
              </button>
              {open === r.id && <div className="px-4 pb-4 text-sm whitespace-pre-wrap text-muted-foreground border-t">{r.content}</div>}
            </div>
          ))}
        </section>
      </div>
    </DemoShell>
  );
}

/* ---------------- Cérebro ---------------- */
export function DemoCerebro() {
  return (
    <DemoShell>
      <div className="max-w-5xl space-y-6">
        <h1 className="text-3xl font-bold flex items-center gap-2"><Bot className="h-7 w-7" /> Cérebro</h1>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border bg-card px-4 py-3 text-sm">
          <span className="flex items-center gap-2 font-medium"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Cérebro online</span>
          <span className="text-muted-foreground">· {DEMO.github.version} · commit {DEMO.github.commit}</span>
          <Button size="sm" variant="outline" className="ml-auto" disabled title="Desabilitado no modo demo">Sincronizar tudo</Button>
        </div>
        <Card>
          <CardHeader className="pb-3"><div className="flex items-center gap-3"><CardTitle className="text-xl">{DEMO.agent.name}</CardTitle><Badge variant="secondary">{DEMO.agent.tone}</Badge><Badge className="bg-blue-600 hover:bg-blue-600">Gerado por IA</Badge></div></CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">{DEMO.agent.presentation}</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Metric label="Guardrails ativos" value={DEMO.guardrails.length} />
              <Metric label="Processos publicados" value={DEMO.processes.length} />
              <Metric label="Identidade" value="Configurada" />
              <Metric label="Cérebro" value="Sincronizado" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><GitBranch className="h-4 w-4" /> Skills no GitHub</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <a href={DEMO.github.repoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline text-xs"><ExternalLink className="h-3 w-3" /> {DEMO.github.repoUrl.replace(/^https?:\/\//, "")}</a>
            <div className="grid grid-cols-3 gap-3"><Metric label="Commit ativo" value={DEMO.github.commit} /><Metric label="Versão" value={DEMO.github.version} /><Metric label="Última sync" value="há 1 min" /></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Guardrails</CardTitle></CardHeader>
          <CardContent><ul className="space-y-2 text-sm">{DEMO.guardrails.map((g, i) => <li key={i} className="rounded-lg border p-3">{g}</li>)}</ul></CardContent>
        </Card>
      </div>
    </DemoShell>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-lg border p-3"><div className="text-lg font-bold">{value}</div><div className="text-xs text-muted-foreground">{label}</div></div>;
}
