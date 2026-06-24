import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { BottomNav } from "@/components/BottomNav";
import type { ReactNode } from "react";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-12 flex items-center border-b bg-card">
            <SidebarTrigger className="ml-2 hidden md:flex" />
            <span className="ml-3 font-semibold md:hidden">Atlas</span>
          </header>
          <main className="flex-1 p-6 pb-20 md:pb-6">{children}</main>
        </div>
        <BottomNav />
      </div>
    </SidebarProvider>
  );
}
