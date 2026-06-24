import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import type { AppRole } from "@/types/auth";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";

export function ProtectedRoute({
  children, allowedRoles, allowUnapproved = false,
}: {
  children: React.ReactNode;
  allowedRoles?: AppRole[];
  allowUnapproved?: boolean;
}) {
  const { user, profile, isLoading, isApproved, isActive, role, signOut } = useAuth();

  // Treat "session exists but profile still loading" as loading,
  // otherwise we'd briefly see isApproved=false and bounce to /pending-approval.
  const profileLoading = !!user && !profile;

  useEffect(() => {
    if (!isLoading && user && !isActive) signOut();
  }, [isLoading, user, isActive, signOut]);

  if (isLoading || profileLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" /> Verificando autenticação...
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (!isActive) return <Navigate to="/auth" replace />;
  if (!isApproved && !allowUnapproved) return <Navigate to="/pending-approval" replace />;
  if (allowedRoles && (!role || !allowedRoles.includes(role))) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="text-center max-w-md space-y-2">
          <h1 className="text-2xl font-semibold">Acesso Negado</h1>
          <p className="text-muted-foreground">
            Você não tem permissão para acessar esta página.
          </p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
