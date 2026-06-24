import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import DashboardPage from "./DashboardPage";

vi.mock("@/components/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    profile: { full_name: "Ana" },
    role: "admin",
  }),
}));

vi.mock("@/hooks/useOnboarding", () => ({
  useOnboarding: () => {
    throw new Error("Dashboard must not depend on onboarding state");
  },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        maybeSingle: () => Promise.resolve({ data: null }),
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: null }),
          order: () => ({
            limit: () => ({
              maybeSingle: () => Promise.resolve({ data: null }),
            }),
          }),
        }),
      }),
    }),
    channel: () => ({
      on: function (this: any) { return this; },
      subscribe: () => ({}),
    }),
    removeChannel: () => undefined,
    functions: { invoke: () => Promise.resolve({ data: null, error: null }) },
  },
}));

describe("DashboardPage", () => {
  it("renderiza sem depender de useOnboarding e mostra heading + boas-vindas", async () => {
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    });
    expect(screen.getByText(/Bem-vindo, Ana!/)).toBeInTheDocument();
  });
});
