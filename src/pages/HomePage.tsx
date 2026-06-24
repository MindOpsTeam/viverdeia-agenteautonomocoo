import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertTriangle, ArrowRight, ArrowUp, Bell, Check, Clock, CornerDownRight,
  Loader2, MessageSquare, Sparkles, User, X,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { MarkdownMessage } from "@/components/chat/MarkdownMessage";

const sb = () => supabase as any;

const QUICK_CATEGORIES = [
  { cat: "DIA A DIA", items: ["Resumo de hoje", "O que está bloqueado?"] },
  { cat: "EXECUÇÃO", items: ["Executar a próxima tarefa", "Extrair relatório de leads"] },
  { cat: "CULTURA", items: ["Quais são nossas diretrizes?", "Como é o processo de fechamento?"] },
];

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

interface Suggestion {
  id: string;
  text: string;
  primary?: { label: string; href: string };
  accept?: () => Promise<void>;
}

interface ChatTurn { role: "user" | "assistant"; content: string }

// Marca "A" do Atlas — gradiente de marca do DS.
function AtlasMark({ size = 44 }: { size?: number }) {
  const s = Math.round(size * 0.55);
  return (
    <div
      className="rounded-xl flex items-center justify-center shrink-0 shadow-sm"
      style={{ width: size, height: size, background: "linear-gradient(160deg,#0a4f95,#02162a)" }}
    >
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
        <path d="M5 19 L12 5 L19 19" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M8.5 14 H15.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </div>
  );
}

// Mapeamento visual (sem mudar dados): ícone + cor do tile por tipo de sugestão.
function suggestionVisual(id: string): { Icon: typeof Bell; tile: string } {
  if (id.startsWith("blocked")) return { Icon: AlertTriangle, tile: "bg-warning/15 text-warning" };
  if (id.startsWith("routine") || id === "next-routine") return { Icon: Clock, tile: "bg-info/15 text-info" };
  if (id.startsWith("dir")) return { Icon: Sparkles, tile: "bg-accent text-primary" };
  if (id === "channel") return { Icon: MessageSquare, tile: "bg-accent text-primary" };
  return { Icon: Bell, tile: "bg-accent text-primary" };
}

export default function HomePage() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [stats, setStats] = useState({ done: 0, doing: 0, blocked: 0 });
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [showWelcome, setShowWelcome] = useState(
    () => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("welcome") === "1",
  );
  const endRef = useRef<HTMLDivElement>(null);

  const dismissWelcome = () => {
    setShowWelcome(false);
    if (typeof window !== "undefined") window.history.replaceState({}, "", window.location.pathname);
  };

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, sending]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: company } = await sb().from("companies").select("id").maybeSingle();
      if (cancelled) return;
      if (!company) { setLoading(false); return; }
      setCompanyId(company.id);

      const [{ data: tasks }, { data: routines }, { data: directives }, { data: cmsgs }] = await Promise.all([
        sb().from("tasks").select("id, title, status, updated_at").eq("company_id", company.id),
        sb().from("routines").select("id, name, schedule_time, status, requested_by").eq("company_id", company.id).in("status", ["active", "pending_approval"]),
        sb().from("directives").select("id, content, status").eq("company_id", company.id).eq("status", "pending_approval"),
        sb().from("channel_messages").select("channel_name, sender, content, created_at").eq("company_id", company.id).order("created_at", { ascending: false }).limit(3),
      ]);
      if (cancelled) return;

      const today = new Date(); today.setHours(0, 0, 0, 0);
      const ts = (tasks ?? []) as any[];
      const blocked = ts.filter((t) => t.status === "blocked");
      setStats({
        done: ts.filter((t) => t.status === "done" && new Date(t.updated_at) >= today).length,
        doing: ts.filter((t) => t.status === "doing").length,
        blocked: blocked.length,
      });

      const rts = (routines ?? []) as any[];
      const dirs = (directives ?? []) as any[];
      const msgs = (cmsgs ?? []) as any[];
      const candidates: Suggestion[] = [];

      if (blocked.length > 0) {
        candidates.push({ id: "blocked", text: `${blocked.length} tarefa(s) bloqueada(s) esperando você.`, primary: { label: "Ver no Backlog", href: "/backlog" } });
      }
      const pendingRoutine = rts.find((r) => r.status === "pending_approval");
      if (pendingRoutine) {
        candidates.push({
          id: `routine-${pendingRoutine.id}`,
          text: `Rotina "${pendingRoutine.name}"${pendingRoutine.requested_by ? ` solicitada por ${pendingRoutine.requested_by}` : ""} aguardando aprovação.`,
          accept: async () => {
            const { error } = await sb().from("routines").update({ status: "active" }).eq("id", pendingRoutine.id);
            if (error) { toast.error("Falha ao aprovar"); return; }
            toast.success("Rotina aprovada");
          },
        });
      }
      if (dirs[0]) {
        candidates.push({
          id: `dir-${dirs[0].id}`,
          text: `Sugestão de diretriz: "${dirs[0].content}"`,
          accept: async () => {
            const { error } = await sb().from("directives").update({ status: "active" }).eq("id", dirs[0].id);
            if (error) { toast.error("Falha ao aceitar"); return; }
            toast.success("Diretriz aceita");
          },
        });
      }
      const nextRoutine = rts.filter((r) => r.status === "active" && r.schedule_time).sort((a, b) => (a.schedule_time < b.schedule_time ? -1 : 1))[0];
      if (nextRoutine) {
        candidates.push({ id: "next-routine", text: `Próxima rotina: "${nextRoutine.name}" às ${String(nextRoutine.schedule_time).slice(0, 5)}.`, primary: { label: "Ver rotinas", href: "/rotinas" } });
      }
      if (msgs[0]) {
        candidates.push({ id: "channel", text: `Atividade recente em ${msgs[0].channel_name} (${msgs[0].sender}).`, primary: { label: "Ver histórico", href: "/conversar" } });
      }

      setSuggestions(candidates);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const visibleSuggestions = useMemo(() => suggestions.filter((s) => !dismissed.has(s.id)).slice(0, 3), [suggestions, dismissed]);

  const dismiss = (id: string) => setDismissed((prev) => new Set(prev).add(id));

  const send = async (text: string) => {
    const msg = text.trim();
    if (!msg || sending || !companyId) return;
    const history = messages;
    setMessages((prev) => [...prev, { role: "user", content: msg }]);
    setInput("");
    setSending(true);
    const { data, error } = await supabase.functions.invoke("coo-chat", { body: { company_id: companyId, message: msg, history } });
    setSending(false);
    if (error || (data as any)?.error) { toast.error((data as any)?.error ?? "Falha ao falar com o Atlas"); return; }
    setMessages((prev) => [...prev, { role: "assistant", content: (data as any).reply }]);
  };

  const firstName = profile ? `, ${profile.full_name.split(" ")[0]}` : "";

  if (loading) {
    return <AppShell><div className="space-y-6 max-w-3xl"><Skeleton className="h-10 w-72" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div></AppShell>;
  }

  if (!companyId) {
    return (
      <AppShell>
        <div className="space-y-4 max-w-3xl">
          <h1 className="text-3xl font-semibold tracking-tight">{greeting()}{firstName}.</h1>
          <p className="text-muted-foreground">Seu Atlas ainda não está configurado. Conclua o onboarding para ele começar a operar.</p>
          <Button asChild><a href="/onboarding">Fazer onboarding</a></Button>
        </div>
      </AppShell>
    );
  }

  const metrics = [
    { label: "Concluídas hoje", value: stats.done },
    { label: "Em andamento", value: stats.doing },
    { label: "Bloqueadas", value: stats.blocked },
    { label: "Pra você", value: suggestions.length, note: "pendências" },
  ];

  return (
    <AppShell>
      <div className="flex gap-6 max-w-[1180px] mx-auto w-full items-start">
        {/* ---------- Coluna esquerda ---------- */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex flex-col gap-4">
            {/* Banner de boas-vindas pós-onboarding */}
            {showWelcome && (
              <div className="flex items-center gap-3 rounded-xl border border-success/30 bg-card px-4 py-3 shadow-sm"
                style={{ borderLeft: "3px solid hsl(var(--success))" }}>
                <span className="flex-1 text-sm text-foreground">🎉 <strong className="font-semibold">Atlas ativado!</strong> A operação já está rodando. Acompanhe tudo por aqui.</span>
                <Button size="sm" variant="ghost" onClick={dismissWelcome}><X className="h-3.5 w-3.5" /></Button>
              </div>
            )}

            {/* Saudação do Atlas */}
            <div className="flex items-start gap-3 animate-atlas-up">
              <AtlasMark size={44} />
              <div className="pt-px">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[12.5px] font-semibold text-foreground">Atlas</span>
                  <span className="font-mono text-[10.5px] text-muted-foreground">{nowHHMM()}</span>
                </div>
                <h1 className="text-[29px] font-semibold leading-[1.12] tracking-[-0.022em] text-foreground">{greeting()}{firstName}.</h1>
                <p className="mt-1.5 text-[15px] text-muted-foreground tracking-[-0.006em]">Aqui está o que importa agora — já cuidei do resto.</p>
              </div>
            </div>

            {/* Sugestões proativas */}
            {visibleSuggestions.map((s) => {
              const { Icon, tile } = suggestionVisual(s.id);
              return (
                <div key={s.id} className="flex gap-3 rounded-[14px] border bg-card p-4 shadow-sm animate-atlas-up">
                  <div className={`flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] ${tile}`}>
                    <Icon className="h-[19px] w-[19px]" strokeWidth={1.9} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14.5px] font-medium leading-[1.45] tracking-[-0.006em] text-foreground">{s.text}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {s.accept && (
                        <Button size="sm" className="h-8" onClick={async () => { await s.accept!(); dismiss(s.id); }}>
                          <Check className="h-3.5 w-3.5 mr-1" /> Aceitar
                        </Button>
                      )}
                      {s.primary && (
                        <Button size="sm" variant="outline" className="h-8" asChild>
                          <a href={s.primary.href}>{s.primary.label} <ArrowRight className="h-3.5 w-3.5 ml-1" /></a>
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="h-8" onClick={() => dismiss(s.id)}>Dispensar</Button>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Conversa */}
            {messages.map((m, i) => (
              <div key={i} className={`flex gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                {m.role === "assistant" && <AtlasMark size={32} />}
                <div className={`max-w-[75%] rounded-2xl px-3.5 py-2.5 text-sm ${m.role === "user" ? "bg-primary text-primary-foreground whitespace-pre-wrap" : "bg-muted text-foreground"}`}>
                  {m.role === "assistant" ? <MarkdownMessage content={m.content} /> : m.content}
                </div>
                {m.role === "user" && <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0"><User className="h-4 w-4" /></div>}
              </div>
            ))}
            {sending && <div className="flex items-center gap-2 text-xs text-muted-foreground pl-11"><Loader2 className="h-3 w-3 animate-spin" /> O Atlas está pensando…</div>}
            <div ref={endRef} />
          </div>

          {/* Input + chips (sticky no rodapé) */}
          <div className="sticky bottom-16 md:bottom-2 z-10 mt-4 space-y-3 bg-background pt-3">
            <div className="flex flex-col gap-2">
              {QUICK_CATEGORIES.map((c) => (
                <div key={c.cat} className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">{c.cat}</span>
                  {c.items.map((it) => (
                    <button key={it} onClick={() => send(it)} disabled={sending}
                      className="inline-flex items-center gap-1.5 h-8 rounded-full border border-border bg-card px-3 text-[12.5px] font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50">
                      <CornerDownRight className="h-3 w-3 text-muted-foreground" strokeWidth={1.75} />{it}
                    </button>
                  ))}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 rounded-xl border bg-card pl-4 pr-1.5 py-1.5 shadow-sm">
              <MessageSquare className="h-[17px] w-[17px] shrink-0 text-muted-foreground" strokeWidth={1.75} />
              <Input
                value={input} onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") send(input); }}
                placeholder="Fale com o Atlas…"
                className="flex-1 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 text-[14.5px]"
              />
              <Button onClick={() => send(input)} disabled={sending || !input.trim()} size="icon" className="h-9 w-9 rounded-lg shrink-0">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-[18px] w-[18px]" strokeWidth={2.1} />}
              </Button>
            </div>
          </div>
        </div>

        {/* ---------- Trilho direito: métricas 2×2 ---------- */}
        <aside className="hidden lg:grid w-[312px] flex-none grid-cols-2 gap-3 self-start">
          {metrics.map((m) => (
            <div key={m.label} className="rounded-xl border bg-card p-3.5 shadow-sm">
              <div className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.05em] text-muted-foreground leading-[1.3] min-h-[24px]">{m.label}</div>
              <div className="mt-1.5 flex items-baseline gap-1.5">
                <span className="font-mono text-[25px] font-semibold tracking-[-0.02em] text-foreground">{String(m.value).padStart(2, "0")}</span>
                {m.note && <span className="font-mono text-[11px] font-medium text-muted-foreground">{m.note}</span>}
              </div>
            </div>
          ))}
        </aside>
      </div>
    </AppShell>
  );
}
