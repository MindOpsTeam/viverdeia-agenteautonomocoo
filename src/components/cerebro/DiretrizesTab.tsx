import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, Check, Loader2, Pencil, Sparkles, Trash2, X, Zap } from "lucide-react";
import { toast } from "sonner";
import type { CerebroState, Directive } from "@/hooks/useCerebro";

export function DiretrizesTab({ cerebro }: { cerebro: CerebroState }) {
  const { activeDirectives, suggestions } = cerebro;

  return (
    <div className="space-y-6">
      {/* Seção 1 — guardrails */}
      <section>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-1">Guardrails</h3>
        <p className="text-xs text-muted-foreground mb-3">Regras que o Atlas NUNCA quebra.</p>
        {activeDirectives.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum guardrail ativo. Adicione abaixo ou aceite uma sugestão.</p>
        ) : (
          <div className="space-y-2">
            {activeDirectives.map((d) => <ActiveDirective key={d.id} directive={d} cerebro={cerebro} />)}
          </div>
        )}
      </section>

      {/* Seção 2 — sugestões */}
      {suggestions.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">Sugestões automáticas</h3>
          <div className="space-y-3">
            {suggestions.map((d) => <SuggestionCard key={d.id} directive={d} cerebro={cerebro} />)}
          </div>
        </section>
      )}

      {/* Seção 3 — System Prompt */}
      <SystemPromptSection cerebro={cerebro} />

      {/* Seção 4 — treinar */}
      <TrainSection cerebro={cerebro} />
    </div>
  );
}

function SystemPromptSection({ cerebro }: { cerebro: CerebroState }) {
  const [text, setText] = useState(cerebro.context?.system_prompt ?? "");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    const ok = await cerebro.saveContext({ system_prompt: text });
    setSaving(false);
    if (ok) toast.success("System prompt salvo");
  };
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">System Prompt</CardTitle>
        <p className="text-xs text-amber-700 flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" /> Para usuários avançados — instrui o Atlas diretamente.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} className="font-mono text-xs"
          placeholder="Instruções avançadas que vão direto para o Atlas..." />
        <div className="flex justify-end">
          <Button size="sm" onClick={save} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Salvar system prompt</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ActiveDirective({ directive, cerebro }: { directive: Directive; cerebro: CerebroState }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(directive.content);

  return (
    <div className="flex items-start gap-2 rounded-lg border p-3">
      <div className="flex-1 min-w-0">
        {editing ? (
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} className="text-sm" />
        ) : (
          <p className="text-sm">{directive.content}</p>
        )}
        <p className="text-xs text-muted-foreground mt-1">
          {new Date(directive.created_at).toLocaleDateString("pt-BR")}
          {directive.source !== "manual" && ` · ${directive.source === "wizard" ? "via wizard IA" : "via IA"}`}
        </p>
      </div>
      {editing ? (
        <Button size="sm" variant="ghost" onClick={async () => { await cerebro.updateDirective(directive.id, { content: text }); setEditing(false); }}>
          <Check className="h-4 w-4" />
        </Button>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /></Button>
      )}
      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => cerebro.deleteDirective(directive.id)}>
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

function SuggestionCard({ directive, cerebro }: { directive: Directive; cerebro: CerebroState }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(directive.content);

  return (
    <Card className="border-blue-200 bg-blue-50/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Badge className="bg-blue-600 hover:bg-blue-600">AUTOMÁTICA</Badge>
          <span className="text-xs font-normal text-muted-foreground inline-flex items-center gap-1">
            <Zap className="h-3 w-3" /> {directive.origin_event ?? "Sugerida pela IA"}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {editing ? (
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} className="text-sm" />
        ) : (
          <p className="text-sm font-medium">{directive.content}</p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700"
            onClick={() => cerebro.updateDirective(directive.id, editing ? { content: text, status: "active" } : { status: "active" })}>
            <Check className="h-4 w-4 mr-1" /> Aceitar
          </Button>
          <Button size="sm" variant="outline" onClick={() => setEditing((v) => !v)}>
            <Pencil className="h-4 w-4 mr-1" /> Editar
          </Button>
          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => cerebro.updateDirective(directive.id, { status: "rejected" })}>
            <X className="h-4 w-4 mr-1" /> Descartar
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Nenhuma diretriz é aplicada sem sua confirmação.</p>
      </CardContent>
    </Card>
  );
}

function TrainSection({ cerebro }: { cerebro: CerebroState }) {
  const [manualText, setManualText] = useState("");
  const [aiText, setAiText] = useState("");
  const [generating, setGenerating] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);

  const addManual = async () => {
    await cerebro.addDirective(manualText, { source: "manual", status: "active" });
    setManualText("");
  };

  const generate = async () => {
    setGenerating(true);
    const content = await cerebro.suggestDirective(aiText);
    setGenerating(false);
    if (content) setDraft(content);
  };

  const acceptDraft = async () => {
    if (!draft) return;
    await cerebro.addDirective(draft, { source: "ai_suggestion", status: "pending_approval", origin_event: aiText });
    setDraft(null);
    setAiText("");
  };

  return (
    <Card className="border-dashed">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Treinar o agente</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="escrever">
          <TabsList>
            <TabsTrigger value="escrever">Escrever</TabsTrigger>
            <TabsTrigger value="ia">Com IA</TabsTrigger>
          </TabsList>

          <TabsContent value="escrever" className="space-y-3 mt-4">
            <Textarea value={manualText} onChange={(e) => setManualText(e.target.value)} rows={3}
              placeholder="Escreva uma diretriz clara. Ex.: Sempre confirmar o destinatário antes de enviar e-mails a clientes." />
            <div className="flex justify-end">
              <Button size="sm" disabled={!manualText.trim()} onClick={addManual}>Adicionar diretriz</Button>
            </div>
          </TabsContent>

          <TabsContent value="ia" className="space-y-3 mt-4">
            <Input value={aiText} onChange={(e) => setAiText(e.target.value)}
              placeholder="Descreva o que aconteceu. Ex.: ele mandou e-mail pro cliente errado ontem" />
            <div className="flex justify-end">
              <Button size="sm" variant="outline" disabled={!aiText.trim() || generating} onClick={generate}>
                {generating ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />}
                Gerar sugestão
              </Button>
            </div>
            {draft && (
              <div className="rounded-lg border bg-blue-50/60 p-3 space-y-2">
                <p className="text-xs text-muted-foreground">Diretriz proposta pela IA:</p>
                <p className="text-sm font-medium">{draft}</p>
                <div className="flex gap-2">
                  <Button size="sm" onClick={acceptDraft}>Adicionar como sugestão</Button>
                  <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>Descartar</Button>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
