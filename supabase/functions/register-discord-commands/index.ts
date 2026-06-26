// register-discord-commands — registra os slash commands do Atlas no app Discord do cliente.
// Chamado no onboarding ao conectar o Discord. Body: { applicationId, botToken, guildId? }.
// Usa bulk-overwrite (PUT) — idempotente. Se guildId vier, registra como guild commands
// (disponíveis na hora); senão, global (propaga em ~1h).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const STRING = 3;
// Conjunto completo que o discord-webhook entende (não só os 4 novos), para o bot ficar funcional.
const COMMANDS = [
  { name: "status", description: "Status do Atlas e contagem de tarefas" },
  { name: "backlog", description: "Lista as tarefas pendentes" },
  { name: "executa", description: "Executa a próxima tarefa pendente" },
  { name: "pausa", description: "Pausa o Atlas" },
  { name: "retoma", description: "Retoma o Atlas" },
  { name: "report", description: "Gera o relatório agora" },
  { name: "processo", description: "Consulta um processo publicado", options: [{ type: STRING, name: "nome", description: "Nome do processo", required: true }] },
  { name: "nova-tarefa", description: "Cria uma nova tarefa no backlog", options: [{ type: STRING, name: "titulo", description: "Título da tarefa", required: true }] },
  { name: "aprovar-rotina", description: "Aprova e executa uma rotina", options: [{ type: STRING, name: "rotina", description: "Nome ou ID da rotina", required: true }] },
  { name: "listar-rotinas", description: "Lista as rotinas pendentes de aprovação" },
  { name: "status-atlas", description: "Saúde da instância (online/offline, runs em execução)" },
];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { ok: false, error: "Method not allowed" });

  try {
    // Exige um usuário autenticado (chamado do painel durante o onboarding).
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(401, { ok: false, error: "Não autorizado" });
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: u } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!u.user) return json(401, { ok: false, error: "Token inválido" });

    const { applicationId, botToken, guildId } = await req.json().catch(() => ({}));
    if (!applicationId || !botToken) return json(400, { ok: false, error: "applicationId e botToken obrigatórios" });

    const base = `https://discord.com/api/v10/applications/${applicationId}`;
    const url = guildId ? `${base}/guilds/${guildId}/commands` : `${base}/commands`;

    const res = await fetch(url, {
      method: "PUT", // bulk overwrite — idempotente
      headers: { "Authorization": `Bot ${botToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(COMMANDS),
    });

    if (res.status === 401) return json(401, { ok: false, error: "Bot token inválido" });
    if (res.status === 403) return json(403, { ok: false, error: "Bot sem permissão (escopo applications.commands ausente?)" });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return json(502, { ok: false, error: `Discord respondeu ${res.status}: ${text.slice(0, 300)}` });
    }
    const registered = await res.json().catch(() => []);
    return json(200, {
      ok: true,
      registered: Array.isArray(registered) ? registered.length : COMMANDS.length,
      commands: COMMANDS.map((c) => `/${c.name}`),
    });
  } catch (e: any) {
    return json(500, { ok: false, error: e?.message ?? "Erro ao registrar comandos" });
  }
});
