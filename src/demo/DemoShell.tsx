import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { Home, MessageSquare, CheckSquare, Workflow, RefreshCw, Users, BarChart2, Brain } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/demo", label: "Início", icon: Home, end: true },
  { to: "/demo/conversar", label: "Conversar", icon: MessageSquare },
  { to: "/demo/backlog", label: "Backlog", icon: CheckSquare },
  { to: "/demo/processos", label: "Processos", icon: Workflow },
  { to: "/demo/rotinas", label: "Rotinas", icon: RefreshCw },
  { to: "/demo/time", label: "Time & Canais", icon: Users },
  { to: "/demo/relatorios", label: "Relatórios", icon: BarChart2 },
  { to: "/demo/cerebro", label: "Cérebro", icon: Brain },
];

export function DemoShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-50 border-b border-amber-300 bg-amber-100 px-3 py-1.5 text-center text-xs text-amber-900">
        Modo demonstração — dados fictícios · Nenhuma alteração é salva · <a href="/auth" className="underline font-medium">Entrar na plataforma</a>
      </div>
      <div className="flex">
        <aside className="hidden md:flex w-56 shrink-0 flex-col gap-1 border-r p-3">
          <div className="px-2 py-3 font-bold text-lg flex items-center gap-2">
            <span className="h-7 w-7 rounded-lg bg-blue-600 text-white flex items-center justify-center text-sm">A</span> Atlas
          </div>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}
              className={({ isActive }) => cn("flex items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors",
                isActive ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/60")}>
              <n.icon className="h-4 w-4" /> {n.label}
            </NavLink>
          ))}
        </aside>
        <main className="flex-1 min-w-0 p-6 pb-20 md:pb-6">{children}</main>
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-50 flex border-t bg-card md:hidden">
        {NAV.slice(0, 5).map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end}
            className={({ isActive }) => cn("flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px]", isActive ? "text-primary" : "text-muted-foreground")}>
            <n.icon className="h-5 w-5" /> {n.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
