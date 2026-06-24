import { AppShell } from "@/components/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";

interface PlaceholderPageProps {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  sprint: string;
}

/**
 * Placeholder padrão para telas cuja navegação/estrutura já existe (Sprint 6)
 * mas cuja implementação chega numa sprint posterior.
 */
export function PlaceholderPage({ title, subtitle, icon: Icon, sprint }: PlaceholderPageProps) {
  return (
    <AppShell>
      <div className="space-y-6 max-w-6xl">
        <header>
          <h1 className="text-3xl font-bold">{title}</h1>
          <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
        </header>
        <Card>
          <CardContent className="py-16 flex flex-col items-center text-center gap-3">
            <div className="rounded-full bg-muted p-4">
              <Icon className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-base font-medium">Em construção</p>
            <p className="text-sm text-muted-foreground max-w-md">
              Esta tela será implementada na {sprint}. A navegação e a estrutura do shell já estão prontas.
            </p>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
