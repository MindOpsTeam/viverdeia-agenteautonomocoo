import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { supabase } from "@/integrations/supabase/client";
import AuthPage from "./pages/AuthPage";
import PendingApprovalPage from "./pages/PendingApprovalPage";
import DashboardPage from "./pages/DashboardPage";
import SettingsPage from "./pages/SettingsPage";
import OnboardingPage from "./pages/OnboardingPage";
import HomePage from "./pages/HomePage";
import ConversarPage from "./pages/ConversarPage";
import BacklogPage from "./pages/BacklogPage";
import ProcessosPage from "./pages/ProcessosPage";
import RotinasPage from "./pages/RotinasPage";
import TimeCanaisPage from "./pages/TimeCanaisPage";
import RelatoriosPage from "./pages/RelatoriosPage";
import CerebroPage from "./pages/CerebroPage";
import AjudaPage from "./pages/AjudaPage";
import {
  DemoHome, DemoBacklog, DemoRotinas, DemoProcessos, DemoTime, DemoConversar, DemoRelatorios, DemoCerebro,
} from "./pages/DemoPages";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  },
});

function TriggerHealthCheck() {
  useEffect(() => {
    const checked = sessionStorage.getItem("auth_trigger_checked");
    if (checked) return;
    supabase.functions
      .invoke("ensure-auth-trigger")
      .then(({ data, error }) => {
        sessionStorage.setItem("auth_trigger_checked", "1");
        if (error || !(data as { ok?: boolean })?.ok) {
          console.warn(
            "[Auth Setup] Trigger check failed:",
            error || (data as { message?: string })?.message,
          );
        }
      })
      .catch((err) => console.warn("[Auth Setup]", err));
  }, []);
  return null;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <TriggerHealthCheck />
          <Routes>
            <Route path="/" element={
              <ProtectedRoute><HomePage /></ProtectedRoute>
            } />
            <Route path="/auth" element={<AuthPage />} />

            {/* Modo demonstração — público, sem autenticação */}
            <Route path="/demo" element={<DemoHome />} />
            <Route path="/demo/backlog" element={<DemoBacklog />} />
            <Route path="/demo/rotinas" element={<DemoRotinas />} />
            <Route path="/demo/processos" element={<DemoProcessos />} />
            <Route path="/demo/time" element={<DemoTime />} />
            <Route path="/demo/conversar" element={<DemoConversar />} />
            <Route path="/demo/relatorios" element={<DemoRelatorios />} />
            <Route path="/demo/cerebro" element={<DemoCerebro />} />
            <Route path="/pending-approval" element={
              <ProtectedRoute allowUnapproved><PendingApprovalPage /></ProtectedRoute>
            } />
            <Route path="/onboarding" element={
              <ProtectedRoute><OnboardingPage /></ProtectedRoute>
            } />
            <Route path="/dashboard" element={
              <ProtectedRoute><DashboardPage /></ProtectedRoute>
            } />
            <Route path="/conversar" element={
              <ProtectedRoute><ConversarPage /></ProtectedRoute>
            } />
            <Route path="/backlog" element={
              <ProtectedRoute><BacklogPage /></ProtectedRoute>
            } />
            <Route path="/processos" element={
              <ProtectedRoute><ProcessosPage /></ProtectedRoute>
            } />
            <Route path="/rotinas" element={
              <ProtectedRoute><RotinasPage /></ProtectedRoute>
            } />
            <Route path="/time" element={
              <ProtectedRoute><TimeCanaisPage /></ProtectedRoute>
            } />
            <Route path="/relatorios" element={
              <ProtectedRoute><RelatoriosPage /></ProtectedRoute>
            } />
            <Route path="/cerebro" element={
              <ProtectedRoute allowedRoles={["admin"]}><CerebroPage /></ProtectedRoute>
            } />
            <Route path="/ajuda" element={
              <ProtectedRoute><AjudaPage /></ProtectedRoute>
            } />
            <Route path="/settings/*" element={
              <ProtectedRoute allowedRoles={["admin"]}><SettingsPage /></ProtectedRoute>
            } />
            <Route path="/configuracoes" element={<Navigate to="/settings" replace />} />
            <Route path="/configuracoes/*" element={<Navigate to="/settings" replace />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
