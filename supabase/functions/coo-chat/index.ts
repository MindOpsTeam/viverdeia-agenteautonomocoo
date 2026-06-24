// coo-chat: chat direto do gestor com o Atlas no painel.
// Lê a chave Anthropic do cliente no Vault + o contexto (soul/agents/user md) e
// responde conversacionalmente. Não persiste (conversa de painel, não canal externo).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MODEL = "claude-sonnet-4-20250514";

type ChatTurn = { role: "user" | "assistant"; content: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const token = authHeader.replace("Bearer ", "");

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Token inválido" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { company_id, message, history } = await req.json();
    if (!company_id || !message?.trim()) {
      return new Response(JSON.stringify({ error: "company_id e message obrigatórios" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: config } = await userClient
      .from("agent_config")
      .select("soul_md, agents_md, user_md")
      .eq("company_id", company_id)
      .maybeSingle();

    const { data: anthropicKey } = await userClient.rpc("read_credential" as any, {
      p_company_id: company_id, p_service: "anthropic",
    });
    if (!anthropicKey) {
      return new Response(JSON.stringify({ error: "Credencial Anthropic ausente. Configure em Credenciais." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const system = [
      "Você é o Atlas, agente autônomo de operações, conversando diretamente com o gestor no painel.",
      "Responda de forma direta, objetiva e útil. Quando o pedido for uma ação operacional",
      "(executar tarefa, postar no Discord, extrair relatório), explique o que faria e o status atual —",
      "você não executa ações externas a partir deste chat, apenas orienta e responde.",
      "## SOUL.md", config?.soul_md ?? "(não definido)",
      "## AGENTS.md", config?.agents_md ?? "(não definido)",
      "## USER.md", config?.user_md ?? "(não definido)",
    ].join("\n\n");

    const priorTurns: ChatTurn[] = Array.isArray(history)
      ? history.slice(-10).map((h: any) => ({
          role: h.role === "assistant" ? "assistant" : "user",
          content: String(h.content ?? ""),
        }))
      : [];

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": anthropicKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        system,
        messages: [...priorTurns, { role: "user", content: message }],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return new Response(JSON.stringify({ error: `Claude ${res.status}: ${body.slice(0, 300)}` }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const data = await res.json();
    const replyText = (data.content?.[0]?.text ?? "").trim() || "(sem resposta)";

    return new Response(JSON.stringify({ success: true, reply: replyText }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? "Erro" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
