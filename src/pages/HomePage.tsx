import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, Bot, Check, Loader2, Send, User, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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

interface Suggestion {
  id: string;
  text: string;
  primary?: { label: string; href: string };
  accept?: () => Promise<void>;
}

interface ChatTurn { role: "user" | "assistant"; content: string }

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
  const endRef = useRef<HTMLDivElement>(null);

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

  if (loading) {
    return <AppShell><div className="space-y-6 max-w-3xl"><Skeleton className="h-10 w-72" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div></AppShell>;
  }

  if (!companyId) {
    return (
      <AppShell>
        <div className="space-y-4 max-w-3xl">
          <h1 className="text-3xl font-bold">{greeting()}{profile ? `, ${profile.full_name.split(" ")[0]}` : ""}.</h1>
          <p className="text-muted-foreground">Seu Atlas ainda não está configurado. Conclua o onboarding para ele começar a operar.</p>
          <Button asChild><a href="/onboarding">Fazer onboarding</a></Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto">
        <div className="space-y-5">
          {/* Saudação do Atlas */}
          <div className="flex gap-3 pt-2">
            <div className="h-9 w-9 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0"><Bot className="h-5 w-5" /></div>
            <div>
              <h1 className="text-xl font-semibold">{greeting()}{profile ? `, ${profile.full_name.split(" ")[0]}` : ""}. Aqui está o que importa agora:</h1>
              <p className="text-sm text-muted-foreground mt-1">
                {stats.done} concluída(s) hoje · {stats.doing} em andamento · {stats.blocked} bloqueada(s).
              </p>
            </div>
          </div>

          {/* Sugestões proativas */}
          {visibleSuggestions.length > 0 && (
            <div className="space-y-2 pl-12">
              {visibleSuggestions.map((s) => (
                <div key={s.id} className="rounded-xl border bg-card p-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm flex-1 min-w-[200px]">{s.text}</span>
                  <div className="flex items-center gap-2">
                    {s.primary && (
                      <Button size="sm" variant="outline" asChild>
                        <a href={s.primary.href}>{s.primary.label} <ArrowRight className="h-3.5 w-3.5 ml-1" /></a>
                      </Button>
                    )}
                    {s.accept && (
                      <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={async () => { await s.accept!(); dismiss(s.id); }}>
                        <Check className="h-3.5 w-3.5 mr-1" /> Aceitar
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => dismiss(s.id)}><X className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Conversa */}
          {messages.map((m, i) => (
            <div key={i} className={`flex gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              {m.role === "assistant" && <div className="h-8 w-8 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0"><Bot className="h-4 w-4" /></div>}
              <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{m.content}</div>
              {m.role === "user" && <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0"><User className="h-4 w-4" /></div>}
            </div>
          ))}
          {sending && <div className="flex items-center gap-2 text-xs text-muted-foreground pl-12"><Loader2 className="h-3 w-3 animate-spin" /> O Atlas está pensando…</div>}
          <div ref={endRef} />
        </div>

        {/* Input fixo no rodapé (acima da bottom-nav no mobile) */}
        <div className="border-t bg-background pt-3 space-y-2 sticky bottom-16 md:bottom-2 z-10">
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {QUICK_CATEGORIES.map((c) => (
              <div key={c.cat} className="flex items-center gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{c.cat}</span>
                {c.items.map((it) => (
                  <button key={it} onClick={() => send(it)} disabled={sending}
                    className="text-xs rounded-full border px-2.5 py-1 hover:bg-muted transition-colors disabled:opacity-50">{it}</button>
                ))}
              </div>
            ))}
          </div>
          <div className="flex gap-2 pb-3">
            <Input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") send(input); }} placeholder="Fale com o Atlas..." />
            <Button onClick={() => send(input)} disabled={sending || !input.trim()}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
