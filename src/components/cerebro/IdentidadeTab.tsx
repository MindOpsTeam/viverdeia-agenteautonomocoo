import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ArrowLeft, ArrowRight, Loader2, Plus, Save, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { CaseItem, CerebroState, IdentityProposal, Tone } from "@/hooks/useCerebro";

export function IdentidadeTab({ cerebro }: { cerebro: CerebroState }) {
  const [wizard, setWizard] = useState(false);
  return wizard
    ? <IdentityWizard onExit={() => setWizard(false)} generate={cerebro.generateIdentity} apply={cerebro.applyIdentity} />
    : <IdentityForm cerebro={cerebro} onStartWizard={() => setWizard(true)} />;
}

function IdentityForm({ cerebro, onStartWizard }: { cerebro: CerebroState; onStartWizard: () => void }) {
  const { context, saveContext } = cerebro;
  const [name, setName] = useState(context?.agent_name ?? "Atlas");
  const [tone, setTone] = useState<Tone>(context?.communication_tone ?? "direct");
  const [presentation, setPresentation] = useState(context?.presentation ?? "");
  const [mission, setMission] = useState(context?.mission ?? "");
  const [audience, setAudience] = useState(context?.target_audience ?? "");
  const [cases, setCases] = useState<CaseItem[]>(context?.cases ?? []);
  const [saving, setSaving] = useState(false);

  const setCase = (i: number, patch: Partial<CaseItem>) => setCases((p) => p.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));

  const save = async () => {
    setSaving(true);
    const ok = await saveContext({
      agent_name: name, communication_tone: tone, presentation, mission, target_audience: audience,
      cases: cases.filter((c) => c.title.trim()),
    });
    setSaving(false);
    if (ok) toast.success("Identidade salva");
  };

  return (
    <div className="space-y-4">
      <Card className="border-dashed">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div className="flex items-center gap-2 text-sm"><Sparkles className="h-4 w-4 text-blue-600" /><span>Prefere montar a identidade conversando com a IA?</span></div>
          <Button variant="outline" size="sm" onClick={onStartWizard}><Sparkles className="h-4 w-4 mr-1" /> Preencher com IA</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Identidade do agente</CardTitle>
            {context?.generated_by_ai && (
              <Badge className="bg-blue-600 hover:bg-blue-600">Gerado por IA · Revisado{context.reviewed_at ? ` em ${new Date(context.reviewed_at).toLocaleDateString("pt-BR")}` : ""}</Badge>
            )}
          </div>
          <CardDescription>Quem é o Atlas, o que faz por esta empresa e como fala com o time.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label>Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} /></div>
            <div className="space-y-2">
              <Label>Tom</Label>
              <ToggleGroup type="single" value={tone} onValueChange={(v) => v && setTone(v as Tone)} className="justify-start">
                <ToggleGroupItem value="direct">Direto</ToggleGroupItem>
                <ToggleGroupItem value="formal">Formal</ToggleGroupItem>
                <ToggleGroupItem value="informal">Informal</ToggleGroupItem>
              </ToggleGroup>
            </div>
          </div>
          <div className="space-y-2"><Label>Missão — o que o Atlas faz por esta empresa</Label>
            <Textarea value={mission} onChange={(e) => setMission(e.target.value)} rows={2} placeholder="Ex.: Garantir que o backlog operacional ande sozinho e o time saiba o status sem perguntar." /></div>
          <div className="space-y-2"><Label>Público-alvo — com quem a empresa trabalha</Label>
            <Textarea value={audience} onChange={(e) => setAudience(e.target.value)} rows={2} placeholder="Ex.: Construtoras e revendas de materiais de construção no Sudeste." /></div>
          <div className="space-y-2"><Label>Como se apresenta</Label>
            <Textarea value={presentation} onChange={(e) => setPresentation(e.target.value)} rows={3} placeholder="Ex.: Sou o Atlas da ACME. Cuido da execução operacional e aviso sobre bloqueios." /></div>

          {/* Cases */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Cases — resultados já entregues</Label>
              <Button size="sm" variant="outline" onClick={() => setCases((p) => [...p, { title: "", result: "" }])}><Plus className="h-4 w-4 mr-1" /> Adicionar case</Button>
            </div>
            {cases.length === 0 ? <p className="text-xs text-muted-foreground">Nenhum case ainda.</p> : cases.map((c, i) => (
              <div key={i} className="flex gap-2 items-start">
                <Input value={c.title} onChange={(e) => setCase(i, { title: e.target.value })} placeholder="Título" className="w-1/3" />
                <Input value={c.result} onChange={(e) => setCase(i, { result: e.target.value })} placeholder="Resultado concreto" className="flex-1" />
                <Button size="icon" variant="ghost" className="text-destructive h-9 w-9" onClick={() => setCases((p) => p.filter((_, idx) => idx !== i))}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
          </div>

          <div className="flex justify-end">
            <Button onClick={save} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}Salvar identidade</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

const STEPS = ["Sobre a empresa", "Sobre o agente", "Revisão"] as const;

function IdentityWizard({ onExit, generate, apply }: {
  onExit: () => void;
  generate: CerebroState["generateIdentity"];
  apply: CerebroState["applyIdentity"];
}) {
  const [step, setStep] = useState(0);
  const [aboutCompany, setAboutCompany] = useState("");
  const [aboutAgent, setAboutAgent] = useState("");
  const [proposal, setProposal] = useState<IdentityProposal | null>(null);
  const [busy, setBusy] = useState(false);

  const goGenerate = async () => {
    setBusy(true);
    const result = await generate(aboutCompany, aboutAgent);
    setBusy(false);
    if (result) { setProposal(result); setStep(2); }
  };
  const goApply = async () => {
    if (!proposal) return;
    setBusy(true);
    const ok = await apply(proposal);
    setBusy(false);
    if (ok) onExit();
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base flex items-center gap-2"><Sparkles className="h-4 w-4 text-blue-600" /> Montar identidade com IA</CardTitle>
          <Badge className="bg-blue-600 hover:bg-blue-600">Gerado por IA</Badge>
        </div>
        <div className="flex items-center gap-2 pt-3 text-xs">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <span className={`h-5 w-5 rounded-full flex items-center justify-center ${i <= step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{i + 1}</span>
              <span className={i === step ? "font-medium" : "text-muted-foreground"}>{s}</span>
              {i < STEPS.length - 1 && <span className="text-muted-foreground">›</span>}
            </div>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {step === 0 && (
          <div className="space-y-2">
            <Label>Conte sobre a empresa: o que faz, missão, público-alvo e cases/resultados já entregues.</Label>
            <Textarea value={aboutCompany} onChange={(e) => setAboutCompany(e.target.value)} rows={5}
              placeholder="Ex.: ACME é um e-commerce B2B de materiais de construção. Missão: abastecer obras sem ruptura. Atende construtoras no Sudeste. Já reduziu ruptura de estoque em 30%." />
          </div>
        )}
        {step === 1 && (
          <div className="space-y-2">
            <Label>Como o agente deve agir? Tom, limites, o que nunca pode fazer sem aprovação.</Label>
            <Textarea value={aboutAgent} onChange={(e) => setAboutAgent(e.target.value)} rows={5}
              placeholder="Ex.: Tom direto. Nunca aprova pagamento sem o Rafael. Sempre confirma destinatário antes de e-mail a cliente." />
          </div>
        )}
        {step === 2 && proposal && (
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">Revise antes de aplicar — nada é salvo automaticamente.</p>
            <div className="rounded-lg border p-3 space-y-1">
              <div><strong>Nome:</strong> {proposal.agent_name}</div>
              <div><strong>Tom:</strong> {proposal.communication_tone}</div>
              {proposal.mission && <div><strong>Missão:</strong> {proposal.mission}</div>}
              {proposal.target_audience && <div><strong>Público:</strong> {proposal.target_audience}</div>}
              <div><strong>Apresentação:</strong> {proposal.presentation}</div>
            </div>
            {proposal.cases?.length > 0 && (
              <div className="rounded-lg border p-3"><strong>Cases:</strong>
                <ul className="list-disc pl-5 mt-1 space-y-1">{proposal.cases.map((c, i) => <li key={i}><strong>{c.title}</strong>: {c.result}</li>)}</ul>
              </div>
            )}
            <div className="rounded-lg border p-3"><strong>Guardrails iniciais sugeridos:</strong>
              <ul className="list-disc pl-5 mt-1 space-y-1">{proposal.directives.map((d, i) => <li key={i}>{d}</li>)}</ul>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          <Button variant="ghost" size="sm" onClick={onExit}>Pular wizard — preencher manualmente</Button>
          <div className="flex gap-2">
            {step > 0 && step < 2 && <Button variant="outline" size="sm" onClick={() => setStep((s) => s - 1)}><ArrowLeft className="h-4 w-4 mr-1" /> Voltar</Button>}
            {step === 0 && <Button size="sm" disabled={!aboutCompany.trim()} onClick={() => setStep(1)}>Continuar <ArrowRight className="h-4 w-4 ml-1" /></Button>}
            {step === 1 && <Button size="sm" disabled={!aboutAgent.trim() || busy} onClick={goGenerate}>{busy ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />}Gerar identidade</Button>}
            {step === 2 && <Button size="sm" disabled={busy} onClick={goApply}>{busy ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}Aplicar identidade</Button>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
