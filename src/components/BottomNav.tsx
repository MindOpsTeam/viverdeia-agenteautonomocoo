import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  Home, MessageSquare, CheckSquare, RefreshCw, MoreHorizontal,
  Users, Workflow, BarChart2, Brain, HelpCircle, Settings,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

const PRIMARY: { title: string; url: string; icon: LucideIcon }[] = [
  { title: "Início", url: "/", icon: Home },
  { title: "Conversar", url: "/conversar", icon: MessageSquare },
  { title: "Backlog", url: "/backlog", icon: CheckSquare },
  { title: "Rotinas", url: "/rotinas", icon: RefreshCw },
];

function isActive(pathname: string, url: string) {
  return url === "/" ? pathname === "/" : pathname.startsWith(url);
}

export function BottomNav() {
  const { pathname } = useLocation();
  const { isAdmin } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);

  const moreItems: { title: string; url: string; icon: LucideIcon; show: boolean }[] = [
    { title: "Time & Canais", url: "/time", icon: Users, show: true },
    { title: "Processos", url: "/processos", icon: Workflow, show: true },
    { title: "Relatórios", url: "/relatorios", icon: BarChart2, show: true },
    { title: "Cérebro", url: "/cerebro", icon: Brain, show: isAdmin },
    { title: "Ajuda", url: "/ajuda", icon: HelpCircle, show: true },
    { title: "Configurações", url: "/settings", icon: Settings, show: isAdmin },
  ];

  const itemCls = (active: boolean) =>
    cn("flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px]",
      active ? "text-primary" : "text-muted-foreground");

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t bg-card md:hidden">
      <div className="flex">
        {PRIMARY.map((item) => {
          const active = isActive(pathname, item.url);
          return (
            <NavLink key={item.url} to={item.url} className={itemCls(active)}>
              <item.icon className="h-5 w-5" />
              <span>{item.title}</span>
            </NavLink>
          );
        })}
        <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
          <SheetTrigger className={itemCls(false)}>
            <MoreHorizontal className="h-5 w-5" />
            <span>Mais</span>
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-2xl">
            <SheetHeader><SheetTitle className="text-left">Mais</SheetTitle></SheetHeader>
            <div className="grid grid-cols-3 gap-3 py-4">
              {moreItems.filter((i) => i.show).map((i) => (
                <NavLink key={i.url} to={i.url} onClick={() => setMoreOpen(false)}
                  className="flex flex-col items-center justify-center gap-1.5 rounded-xl border p-4 text-xs text-center hover:bg-muted transition-colors">
                  <i.icon className="h-5 w-5" />
                  <span>{i.title}</span>
                </NavLink>
              ))}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}
