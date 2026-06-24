import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ArrowRight, CheckCircle2, Circle, ExternalLink, GitBranch } from "lucide-react";
import type { CerebroState } from "@/hooks/useCerebro";
import type { CerebroTab } from "@/pages/CerebroPage";

const TONE_LABEL: Record<string, string> = { direct: "Tom Direto", formal: "Tom Formal", informal: "Tom Informal" };

export function ResumoTab({ cerebro, onNavigate }: { cerebro: CerebroState; onNavigate: (t: CerebroTab) => void }) {
  const { context, activeDirectives, suggestions, files, sources, brain, github } = cerebro;
  const indexing = files.filter((f) => f.status === "indexing");
  const activeKnowledge = [...files, ...sources].filter((k) => k.active).length;
  const identityConfigured = !!context && (!!context.presentation || context.generated_by_ai);

  const hasAttention = suggestions.length > 0 || indexing.length > 0;

  return (
    <div className="space-y-6">
      {hasAttention && (
        <Card className="border-warning/30 bg-warning/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-warning">
              <AlertTriangle className="h-4 w-4" /> Precisa da sua atenção
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-foreground">
            {suggestions.length > 0 && (
              <button className="flex items-center gap-1 hover:underline" onClick={() => onNavigate("diretrizes")}>
                {suggestions.length} sugestão(ões) de diretriz aguardando aprovação <ArrowRight className="h-3 w-3" />
              </button>
            )}
            {indexing.length > 0 && (
              <button className="flex items-center gap-1 hover:underline" onClick={() => onNavigate("conhecimento")}>
                {indexing.length} arquivo(s) ainda indexando <ArrowRight className="h-3 w-3" />
              </button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Card principal */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <CardTitle className="text-xl">{context?.agent_name ?? "Atlas"}</CardTitle>
            <Badge variant="secondary">{TONE_LABEL[context?.communication_tone ?? "direct"]}</Badge>
            {context?.generated_by_ai && <Badge className="bg-info hover:bg-info text-white">Gerado por IA</Badge>}
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            {context?.presentation || "Braço operacional autônomo da empresa — lê o backlog, executa rotinas e reporta resultados."}
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Metric label="Diretrizes ativas" value={activeDirectives.length} />
            <Metric label="Fontes de conhecimento" value={activeKnowledge} />
            <Metric label="Identidade" value={identityConfigured ? "Configurada" : "Pendente"} />
            <Metric label="Cérebro" value={brain.syncedAt ? "Sincronizado" : "A sincronizar"} />
          </div>
        </CardContent>
      </Card>

      {/* Skills no GitHub / compilação atual */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><GitBranch className="h-4 w-4" /> Skills no GitHub</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {github.repoUrl ? (
            <a href={github.repoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline text-xs">
              <ExternalLink className="h-3 w-3" /> {github.repoUrl.replace(/^https?:\/\//, "")}
            </a>
          ) : (
            <p className="text-xs text-muted-foreground">Nenhum repositório vinculado — configure em Configurações → Credenciais e clique em "Sincronizar tudo".</p>
          )}
          <div className="grid grid-cols-3 gap-3">
            <Metric label="Commit ativo" value={brain.commitHash ?? "—"} />
            <Metric label="Versão" value={brain.version ?? "—"} />
            <Metric label="Última sync" value={brain.syncedAt ? new Date(brain.syncedAt).toLocaleDateString("pt-BR") : "nunca"} />
          </div>
        </CardContent>
      </Card>

      {/* O que o agente sabe hoje — apenas navegação */}
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">O que o agente sabe hoje</h3>
        <div className="grid gap-3 md:grid-cols-3">
          <NavCard
            title="Identidade"
            line={identityConfigured ? `${TONE_LABEL[context?.communication_tone ?? "direct"]} · ✓ Configurado` : "Ainda não configurada"}
            icon={identityConfigured ? <CheckCircle2 className="h-4 w-4 text-success" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
            onClick={() => onNavigate("identidade")}
          />
          <NavCard
            title="Diretrizes"
            line={`${activeDirectives.length} regra(s) ativa(s)${suggestions.length ? ` · ⚠️ ${suggestions.length} sugestão pendente` : ""}`}
            icon={<CheckCircle2 className="h-4 w-4 text-success" />}
            onClick={() => onNavigate("diretrizes")}
          />
          <NavCard
            title="Conhecimento"
            line={`${files.length} arquivo(s) · ${sources.length} fonte(s)`}
            icon={<CheckCircle2 className="h-4 w-4 text-success" />}
            onClick={() => onNavigate("conhecimento")}
          />
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="font-mono text-lg font-semibold tracking-tight">{value}</div>
      <div className="font-mono text-[9.5px] uppercase tracking-[0.04em] text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

function NavCard({ title, line, icon, onClick }: { title: string; line: string; icon: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="text-left rounded-xl border bg-card p-4 hover:border-foreground/30 transition-colors">
      <div className="flex items-center justify-between">
        <span className="font-medium">{title}</span>
        {icon}
      </div>
      <p className="text-xs text-muted-foreground mt-1">{line}</p>
      <span className="text-xs text-primary mt-2 inline-flex items-center gap-1">Ver <ArrowRight className="h-3 w-3" /></span>
    </button>
  );
}
