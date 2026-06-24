import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useOnboarding } from "@/hooks/useOnboarding";

export default function OnboardingSettings() {
  const { resetOnboarding } = useOnboarding();
  const navigate = useNavigate();

  const handleReset = async () => {
    await resetOnboarding();
    toast.success("Onboarding reiniciado.");
    navigate("/onboarding");
  };

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-4 py-5">
        <div className="flex items-start gap-3 min-w-0">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <RotateCcw className="h-4 w-4" />
          </div>
          <p className="text-sm text-muted-foreground max-w-md">
            Recomece o processo de configuração do Atlas. Suas credenciais e dados não serão apagados.
          </p>
        </div>
        <Button variant="outline" onClick={handleReset}>Refazer onboarding</Button>
      </CardContent>
    </Card>
  );
}
