import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Brain, RefreshCw, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCerebro } from "@/hooks/useCerebro";
import { ResumoTab } from "@/components/cerebro/ResumoTab";
import { IdentidadeTab } from "@/components/cerebro/IdentidadeTab";
import { DiretrizesTab } from "@/components/cerebro/DiretrizesTab";
import { ConhecimentoTab } from "@/components/cerebro/ConhecimentoTab";

export type CerebroTab = "resumo" | "identidade" | "diretrizes" | "conhecimento";

function relativeTime(iso: string | null): string {
  if (!iso) return "ainda não sincronizado";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  return new Date(iso).toLocaleDateString("pt-BR");
}

export default function CerebroPage() {
  const cerebro = useCerebro();
  const [tab, setTab] = useState<CerebroTab>("resumo");

  if (cerebro.loading) {
    return (
      <AppShell>
        <div className="space-y-6 max-w-5xl">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-14" />
          <Skeleton className="h-64" />
        </div>
      </AppShell>
    );
  }

  if (!cerebro.companyId) {
    return (
      <AppShell>
        <div className="space-y-4 max-w-5xl">
          <h1 className="text-3xl font-bold flex items-center gap-2"><Brain className="h-7 w-7" /> Cérebro</h1>
          <p className="text-muted-foreground">Conclua o onboarding do Atlas para configurar o cérebro.</p>
          <Button asChild><a href="/onboarding">Fazer onboarding</a></Button>
        </div>
      </AppShell>
    );
  }

  const synced = !!cerebro.brain.syncedAt;

  return (
    <AppShell>
      <div className="space-y-6 max-w-5xl">
        <h1 className="text-3xl font-bold flex items-center gap-2"><Brain className="h-7 w-7" /> Cérebro</h1>

        {/* Header de status vivo */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border bg-card px-4 py-3 text-sm">
          <span className="flex items-center gap-2 font-medium">
            <span className={cn("h-2.5 w-2.5 rounded-full", synced ? "bg-emerald-500" : "bg-amber-500")} />
            {synced ? "Cérebro online" : "Cérebro não sincronizado"}
          </span>
          <span className="text-muted-foreground">· Última sincronização: {relativeTime(cerebro.brain.syncedAt)}</span>
          {cerebro.brain.version && <span className="text-muted-foreground">· {cerebro.brain.version}</span>}
          {cerebro.brain.commitHash && <span className="text-muted-foreground">· commit {cerebro.brain.commitHash}</span>}
          <Button size="sm" variant="outline" className="ml-auto" onClick={cerebro.sync} disabled={cerebro.syncing}>
            {cerebro.syncing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
            Sincronizar tudo
          </Button>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as CerebroTab)}>
          <TabsList>
            <TabsTrigger value="resumo">Resumo</TabsTrigger>
            <TabsTrigger value="identidade">Identidade</TabsTrigger>
            <TabsTrigger value="diretrizes">Diretrizes</TabsTrigger>
            <TabsTrigger value="conhecimento">Conhecimento</TabsTrigger>
          </TabsList>

          <TabsContent value="resumo" className="mt-6">
            <ResumoTab cerebro={cerebro} onNavigate={setTab} />
          </TabsContent>
          <TabsContent value="identidade" className="mt-6">
            <IdentidadeTab cerebro={cerebro} />
          </TabsContent>
          <TabsContent value="diretrizes" className="mt-6">
            <DiretrizesTab cerebro={cerebro} />
          </TabsContent>
          <TabsContent value="conhecimento" className="mt-6">
            <ConhecimentoTab cerebro={cerebro} />
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
