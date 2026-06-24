import { NavLink, useLocation } from "react-router-dom";
import {
  Home, LayoutDashboard, MessageSquare, CheckSquare, RefreshCw, Users,
  BarChart2, Brain, HelpCircle, Settings, LogOut, Workflow,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/useAuth";
import { useAgentStatus, type AgentStatus } from "@/hooks/useAgentStatus";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const DOT_COLOR: Record<AgentStatus, string> = {
  online: "bg-success/100",
  offline: "bg-destructive/100",
  pending: "bg-warning/100",
  loading: "bg-slate-400",
};

function AgentStatusIndicator({ collapsed }: { collapsed: boolean }) {
  const { status, label } = useAgentStatus();
  return (
    <div className="flex items-center gap-2 px-2 py-1.5" title={label}>
      <span className="relative flex h-2.5 w-2.5 shrink-0 items-center justify-center">
        {status === "online" && (
          <span className={cn("absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping", DOT_COLOR[status])} />
        )}
        <span className={cn("relative inline-flex h-2.5 w-2.5 rounded-full", DOT_COLOR[status])} />
      </span>
      {!collapsed && <span className="text-xs text-sidebar-foreground/80 truncate">{label}</span>}
    </div>
  );
}

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();
  const { signOut, profile, isAdmin } = useAuth();

  const items = [
    { title: "Início", url: "/", icon: Home, show: true },
    { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, show: true },
    { title: "Conversar", url: "/conversar", icon: MessageSquare, show: true },
    { title: "Backlog", url: "/backlog", icon: CheckSquare, show: true },
    { title: "Processos", url: "/processos", icon: Workflow, show: true },
    { title: "Rotinas", url: "/rotinas", icon: RefreshCw, show: true },
    { title: "Time & Canais", url: "/time", icon: Users, show: true },
    { title: "Relatórios", url: "/relatorios", icon: BarChart2, show: true },
    { title: "Cérebro", url: "/cerebro", icon: Brain, show: isAdmin },
    { title: "Ajuda", url: "/ajuda", icon: HelpCircle, show: true },
  ].filter((i) => i.show);

  const activeClass =
    "data-[active=true]:bg-[hsl(var(--accent-primary))] data-[active=true]:text-[hsl(var(--accent-foreground))] data-[active=true]:hover:bg-[hsl(var(--accent-primary-hover))] data-[active=true]:hover:text-[hsl(var(--accent-foreground))]";

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <AgentStatusIndicator collapsed={collapsed} />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton
                    asChild
                    isActive={item.url === "/" ? pathname === "/" : pathname.startsWith(item.url)}
                    className={activeClass}
                    tooltip={item.title}
                  >
                    <NavLink to={item.url} className="flex items-center gap-2">
                      <item.icon className="h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        {isAdmin && (
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={pathname.startsWith("/settings") || pathname.startsWith("/configuracoes")}
                className={activeClass}
                tooltip="Configurações"
              >
                <NavLink to="/settings" className="flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  {!collapsed && <span>Configurações</span>}
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        )}

        {!collapsed && profile && (
          <div className="px-2 py-2 text-xs text-sidebar-foreground/70 truncate">{profile.full_name}</div>
        )}
        <Button variant="ghost" size="sm" onClick={signOut} className="justify-start">
          <LogOut className="h-4 w-4" /> {!collapsed && <span className="ml-2">Sair</span>}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
