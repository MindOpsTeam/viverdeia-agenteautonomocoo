import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Bot, Loader2, Send, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { MarkdownMessage } from "@/components/chat/MarkdownMessage";

const sb = () => supabase as any;

const QUICK_SUGGESTIONS = [
  "Resumo de hoje",
  "O que está bloqueado?",
  "Extrair relatório de leads",
  "Postar resumo no Discord",
];

const TYPE_LABEL: Record<string, string> = {
  command: "Comando", response: "Resposta", report: "Relatório", alert: "Alerta",
};

interface ChatTurn { role: "user" | "assistant"; content: string }
interface ChannelMessage {
  id: string;
  channel_name: string;
  platform: "discord" | "slack";
  sender: string;
  message_type: "command" | "response" | "report" | "alert" | null;
  content: string;
  created_at: string;
}

export default function ConversarPage() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: company } = await sb().from("companies").select("id").maybeSingle();
      setCompanyId(company?.id ?? null);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return <AppShell><div className="space-y-4 max-w-4xl"><Skeleton className="h-9 w-48" /><Skeleton className="h-96" /></div></AppShell>;
  }

  if (!companyId) {
    return (
      <AppShell>
        <div className="space-y-4 max-w-4xl">
          <h1 className="text-3xl font-bold">Conversar</h1>
          <p className="text-muted-foreground">Conclua o onboarding para conversar com o agente.</p>
          <Button asChild><a href="/onboarding">Fazer onboarding</a></Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6 max-w-4xl">
        <header>
          <h1 className="text-3xl font-bold">Conversar</h1>
          <p className="text-sm text-muted-foreground mt-1">Atlas · responde aqui, no Discord e no Slack.</p>
        </header>

        <Tabs defaultValue="chat">
          <TabsList>
            <TabsTrigger value="chat">Chat direto</TabsTrigger>
            <TabsTrigger value="historico">Histórico de canais</TabsTrigger>
          </TabsList>
          <TabsContent value="chat" className="mt-6"><ChatDireto companyId={companyId} /></TabsContent>
          <TabsContent value="historico" className="mt-6"><HistoricoCanais companyId={companyId} /></TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}

function ChatDireto({ companyId }: { companyId: string }) {
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, sending]);

  const send = async (text: string) => {
    const msg = text.trim();
    if (!msg || sending) return;
    const history = messages;
    setMessages((prev) => [...prev, { role: "user", content: msg }]);
    setInput("");
    setSending(true);
    const { data, error } = await supabase.functions.invoke("coo-chat", {
      body: { company_id: companyId, message: msg, history },
    });
    setSending(false);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error ?? "Falha ao falar com o agente");
      return;
    }
    setMessages((prev) => [...prev, { role: "assistant", content: (data as any).reply }]);
  };

  return (
    <div className="rounded-xl border bg-card flex flex-col h-[60vh]">
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            Dê uma ordem ou pergunte algo. O agente responde com base na identidade e diretrizes do Cérebro.
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            {m.role === "assistant" && <div className="h-7 w-7 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0"><Bot className="h-4 w-4" /></div>}
            <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${m.role === "user" ? "bg-primary text-primary-foreground whitespace-pre-wrap" : "bg-muted"}`}>
              {m.role === "assistant" ? <MarkdownMessage content={m.content} /> : m.content}
            </div>
            {m.role === "user" && <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0"><User className="h-4 w-4" /></div>}
          </div>
        ))}
        {sending && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> O agente está pensando…</div>}
        <div ref={endRef} />
      </div>

      <div className="border-t p-3 space-y-2">
        <div className="flex flex-wrap gap-2">
          {QUICK_SUGGESTIONS.map((s) => (
            <button key={s} onClick={() => send(s)} disabled={sending}
              className="text-xs rounded-full border px-3 py-1 hover:bg-muted transition-colors disabled:opacity-50">
              {s}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") send(input); }}
            placeholder="Dê uma ordem em linguagem natural..."
          />
          <Button onClick={() => send(input)} disabled={sending || !input.trim()}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

function HistoricoCanais({ companyId }: { companyId: string }) {
  const [messages, setMessages] = useState<ChannelMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [channel, setChannel] = useState("all");
  const [type, setType] = useState("all");
  const [date, setDate] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await sb().from("channel_messages").select("*")
        .eq("company_id", companyId).order("created_at", { ascending: false }).limit(500);
      setMessages((data ?? []) as ChannelMessage[]);
      setLoading(false);
    })();
  }, [companyId]);

  const channels = useMemo(() => Array.from(new Set(messages.map((m) => m.channel_name))), [messages]);

  const filtered = useMemo(() => messages.filter((m) => {
    if (channel !== "all" && m.channel_name !== channel) return false;
    if (type !== "all" && m.message_type !== type) return false;
    if (date && !m.created_at.startsWith(date)) return false;
    return true;
  }), [messages, channel, type, date]);

  if (loading) return <Skeleton className="h-64" />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Select value={channel} onValueChange={setChannel}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Canal" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os canais</SelectItem>
            {channels.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            <SelectItem value="command">Comando</SelectItem>
            <SelectItem value="response">Resposta</SelectItem>
            <SelectItem value="report">Relatório</SelectItem>
            <SelectItem value="alert">Alerta</SelectItem>
          </SelectContent>
        </Select>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" />
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Nenhuma mensagem nos canais ainda.</p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {filtered.map((m) => (
            <li key={m.id} className="px-4 py-3 flex gap-3">
              <Badge variant="outline" className="text-[10px] h-fit capitalize">{m.platform}</Badge>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium">{m.channel_name}</span>
                  <span className="text-xs text-muted-foreground">· {m.sender}</span>
                  {m.message_type && <Badge variant="secondary" className="text-[10px]">{TYPE_LABEL[m.message_type]}</Badge>}
                </div>
                <p className="text-sm mt-1 break-words line-clamp-3">{m.content}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{new Date(m.created_at).toLocaleString("pt-BR")}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
