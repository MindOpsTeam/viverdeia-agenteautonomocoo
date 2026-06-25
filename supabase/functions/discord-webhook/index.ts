// Discord Interactions endpoint.
// Expects slash commands registered against the customer's bot:
//   /status   — agente + contagens
//   /backlog  — tarefas pendentes
//   /executa  — dispara execute-task para a próxima tarefa todo
//   /pausa    — is_active = false
//   /retoma   — is_active = true
//   /report   — gera relatório agora
//
// Verifies Ed25519 signature using the customer's discord_public_key stored
// in agent_config. Each company is identified by channel_id from the interaction.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import nacl from "https://esm.sh/tweetnacl@1.0.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-signature-ed25519, x-signature-timestamp",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const InteractionType = { PING: 1, APPLICATION_COMMAND: 2 } as const;
const InteractionResponseType = {
  PONG: 1,
  CHANNEL_MESSAGE_WITH_SOURCE: 4,
  DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE: 5,
} as const;

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

function verifyDiscordSig(
  publicKeyHex: string,
  signatureHex: string,
  timestamp: string,
  rawBody: string,
): boolean {
  try {
    const message = new TextEncoder().encode(timestamp + rawBody);
    return nacl.sign.detached.verify(
      message,
      hexToBytes(signatureHex),
      hexToBytes(publicKeyHex),
    );
  } catch {
    return false;
  }
}

function reply(content: string, ephemeral = false) {
  return new Response(JSON.stringify({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content, flags: ephemeral ? 64 : 0 },
  }), { headers: { "Content-Type": "application/json" } });
}

// Registra a resposta do agente em channel_messages (histórico de canais) e responde no Discord.
async function respond(
  admin: ReturnType<typeof createClient>,
  companyId: string,
  channelName: string,
  content: string,
  type: "response" | "report" | "alert" = "response",
  ephemeral = false,
) {
  try {
    await admin.from("channel_messages").insert({
      company_id: companyId, channel_name: channelName, platform: "discord",
      sender: "agent", message_type: type, content,
    });
  } catch (_) { /* ignore log failures */ }
  return reply(content, ephemeral);
}

// Localiza o team_member que corresponde a quem acionou (por handle).
async function findTeamMember(
  admin: ReturnType<typeof createClient>,
  companyId: string,
  caller: { username?: string; global_name?: string } | null,
): Promise<any | null> {
  const { data: members } = await admin
    .from("team_members").select("handle, permissions").eq("company_id", companyId);
  if (!members) return null;
  const uname = (caller?.username ?? "").toLowerCase();
  const gname = (caller?.global_name ?? "").toLowerCase();
  return (members.find((m: any) => {
    const h = String(m.handle ?? "").replace(/^@/, "").toLowerCase();
    return h.length > 0 && (h === uname || h === gname);
  }) as any) ?? null;
}

// Regras de visibilidade de processo no Discord (Decisão 1):
// everyone → qualquer membro registrado; authorized_team → can_command|authorizes_approvals;
// admin → ninguém consulta via Discord (processo só visível no painel).
async function canConsultProcess(
  admin: ReturnType<typeof createClient>,
  companyId: string,
  caller: { username?: string; global_name?: string } | null,
  visibility: string,
): Promise<boolean> {
  if (visibility === "admin") return false;
  const member = await findTeamMember(admin, companyId, caller);
  if (!member) return false;
  if (visibility === "everyone") return true;
  if (visibility === "authorized_team") {
    const p: string[] = Array.isArray(member.permissions) ? member.permissions : [];
    return p.includes("can_command") || p.includes("authorizes_approvals");
  }
  return false;
}

// Comandos que fazem o agente agir (exigem permissão "can_command").
const ACTION_COMMANDS = new Set(["executa", "pausa", "retoma", "report"]);

// Verifica se quem acionou tem permissão para dar ordens.
// Regra 9.1: membro sem "can_command" recebe resposta educada + admin é avisado.
// Fallback: se a empresa ainda não cadastrou nenhum membro, não bloqueia
// (instância recém-configurada) — evita brickar deployments existentes.
async function checkCommandPermission(
  admin: ReturnType<typeof createClient>,
  companyId: string,
  caller: { username?: string; global_name?: string } | null,
): Promise<{ allowed: boolean }> {
  const { data: members } = await admin
    .from("team_members")
    .select("handle, permissions")
    .eq("company_id", companyId);
  if (!members || members.length === 0) return { allowed: true };

  const uname = (caller?.username ?? "").toLowerCase();
  const gname = (caller?.global_name ?? "").toLowerCase();
  const match = members.find((m: any) => {
    const h = String(m.handle ?? "").replace(/^@/, "").toLowerCase();
    return h.length > 0 && (h === uname || h === gname);
  }) as any;

  const allowed = !!match && Array.isArray(match.permissions) && match.permissions.includes("can_command");
  return { allowed };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Quem pode aprovar rotinas: "authorizes_approvals" ou "can_command".
function canApprove(member: any | null): boolean {
  if (!member) return false;
  const p: string[] = Array.isArray(member.permissions) ? member.permissions : [];
  return p.includes("authorizes_approvals") || p.includes("can_command");
}

async function dispatchOrchestrator(
  url: string, serviceKey: string, body: Record<string, unknown>,
): Promise<void> {
  try {
    await fetch(`${url}/functions/v1/coo-orchestrator`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
      body: JSON.stringify(body),
    });
  } catch { /* best-effort */ }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const signature = req.headers.get("x-signature-ed25519") ?? "";
  const timestamp = req.headers.get("x-signature-timestamp") ?? "";
  const rawBody = await req.text();

  let interaction: any;
  try { interaction = JSON.parse(rawBody); }
  catch {
    return new Response("bad request", { status: 400 });
  }

  // Identify the company by channel_id BEFORE signature verification,
  // so we can fetch the right public key.
  const channelId = interaction?.channel_id ?? interaction?.channel?.id;
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  // PING: Discord sends type=1 to verify the endpoint. Discord requires
  // signature verification even for PING. If a customer config exists matching
  // the channel, we can verify; otherwise we still respond to PONG only if signature
  // matches some configured key.
  // Standard pattern: each app has one public key. We accept the first configured
  // key whose signature matches for PING (since channel may not be in PING body).

  if (!channelId) {
    if (interaction?.type !== InteractionType.PING) {
      return new Response("missing channel", { status: 400 });
    }
    // Verify against ANY configured key
    const { data: configs } = await admin
      .from("agent_config")
      .select("discord_public_key")
      .not("discord_public_key", "is", null);
    const ok = (configs ?? []).some((c: any) =>
      verifyDiscordSig(c.discord_public_key, signature, timestamp, rawBody),
    );
    if (!ok) return new Response("invalid signature", { status: 401 });
    return new Response(JSON.stringify({ type: InteractionResponseType.PONG }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const { data: config } = await admin
    .from("agent_config")
    .select("company_id, discord_public_key, is_active, discord_channel_id")
    .eq("discord_channel_id", channelId)
    .maybeSingle();

  if (!config?.discord_public_key) {
    return new Response("discord_public_key não configurada para este canal", { status: 400 });
  }

  if (!verifyDiscordSig(config.discord_public_key, signature, timestamp, rawBody)) {
    return new Response("invalid signature", { status: 401 });
  }

  if (interaction.type === InteractionType.PING) {
    return new Response(JSON.stringify({ type: InteractionResponseType.PONG }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  if (interaction.type !== InteractionType.APPLICATION_COMMAND) {
    return new Response("unsupported interaction", { status: 400 });
  }

  const cmd = (interaction.data?.name ?? "").toLowerCase();
  const companyId = config.company_id;
  const channelName = interaction.channel?.name ?? `canal-${channelId}`;
  const callerHandle = interaction.member?.user?.username ?? interaction.user?.username ?? "desconhecido";

  // Registra a mensagem recebida (comando do membro) no histórico de canais.
  try {
    await admin.from("channel_messages").insert({
      company_id: companyId, channel_name: channelName, platform: "discord",
      sender: `@${callerHandle}`, message_type: "command", content: `/${cmd}`,
    });
  } catch (_) { /* ignore */ }

  // Gate de permissão para comandos de ação (nunca ignorar em silêncio).
  if (ACTION_COMMANDS.has(cmd)) {
    const caller = interaction.member?.user ?? interaction.user ?? null;
    const { allowed } = await checkCommandPermission(admin, companyId, caller);
    if (!allowed) {
      const who = caller?.username ? `@${caller.username}` : "membro não identificado";
      await admin.from("execution_logs").insert({
        company_id: companyId,
        type: "action",
        content: `Comando '${cmd}' negado a ${who} — sem permissão "Pode dar ordens".`,
      });
      return await respond(
        admin, companyId, channelName,
        `${caller?.global_name || caller?.username || "Olá"}, você não tem permissão para dar ordens ao Atlas. ` +
        `Avisei o admin no painel — se precisar desse acesso, fale com ele.`,
        "alert", true,
      );
    }
  }

  switch (cmd) {
    case "status": {
      const [{ count: doingCount }, { count: blockedCount }, { count: doneCount }] = await Promise.all([
        admin.from("tasks").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("status", "doing"),
        admin.from("tasks").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("status", "blocked"),
        admin.from("tasks").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("status", "done"),
      ]);
      const state = config.is_active ? "🟢 ativo" : "⏸️ pausado";
      return await respond(admin, companyId, channelName,
        `**Status do Atlas**\n` +
        `Estado: ${state}\n` +
        `Em curso: ${doingCount ?? 0}  •  Bloqueadas: ${blockedCount ?? 0}  •  Concluídas: ${doneCount ?? 0}`,
      );
    }

    case "backlog": {
      const { data: rows } = await admin
        .from("tasks")
        .select("title, status, priority")
        .eq("company_id", companyId)
        .in("status", ["todo", "doing", "blocked"])
        .order("priority", { ascending: true })
        .limit(20);
      if (!rows || rows.length === 0) return await respond(admin, companyId, channelName, "Backlog vazio. 🎉");
      const lines = rows.map((t: any) => {
        const icon = t.status === "blocked" ? "⛔" : t.status === "doing" ? "🟡" : "⚪";
        return `${icon} [${t.priority}] ${t.title}`;
      });
      return await respond(admin, companyId, channelName, `**Backlog**\n${lines.join("\n")}`);
    }

    case "pausa":
    case "retoma": {
      const nextActive = cmd === "retoma";
      await admin.from("agent_config").update({ is_active: nextActive }).eq("company_id", companyId);
      await admin.from("execution_logs").insert({
        company_id: companyId,
        type: "action",
        content: `Agente ${nextActive ? "retomado" : "pausado"} via comando Discord.`,
      });
      return await respond(admin, companyId, channelName, nextActive ? "▶️ Agente retomado." : "⏸️ Agente pausado.");
    }

    case "executa": {
      const { data: nextTask } = await admin
        .from("tasks")
        .select("id, title")
        .eq("company_id", companyId)
        .eq("status", "todo")
        .order("priority", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!nextTask) return await respond(admin, companyId, channelName, "Nenhuma tarefa pendente. ✅");

      fetch(`${supabaseUrl}/functions/v1/execute-task`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
        body: JSON.stringify({ task_id: (nextTask as any).id }),
      }).catch(() => { /* ignore */ });

      return await respond(admin, companyId, channelName, `▶️ Executando: **${(nextTask as any).title}**\nResultado será publicado em breve neste canal.`);
    }

    case "report": {
      fetch(`${supabaseUrl}/functions/v1/generate-report`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
        body: JSON.stringify({ type: "daily", company_id: companyId }),
      }).catch(() => { /* ignore */ });
      return await respond(admin, companyId, channelName, "📊 Relatório sendo gerado, publicarei aqui em segundos.", "report");
    }

    case "processo": {
      const q = String(interaction.data?.options?.[0]?.value ?? "").trim();
      if (!q) return await respond(admin, companyId, channelName, "Use: `/processo <nome>`.", "response", true);
      const { data: proc } = await admin
        .from("processes")
        .select("name, area, steps, visibility")
        .eq("company_id", companyId)
        .eq("status", "published")
        .ilike("name", `%${q}%`)
        .limit(1)
        .maybeSingle();
      if (!proc) return await respond(admin, companyId, channelName, `Não encontrei um processo publicado com "${q}".`, "response", true);

      const caller = interaction.member?.user ?? interaction.user ?? null;
      const allowed = await canConsultProcess(admin, companyId, caller, (proc as any).visibility);
      if (!allowed) {
        await admin.from("execution_logs").insert({
          company_id: companyId, type: "action",
          content: `Consulta ao processo '${(proc as any).name}' negada a @${callerHandle} (visibilidade ${(proc as any).visibility}).`,
        });
        return await respond(admin, companyId, channelName,
          "Não tenho autorização para compartilhar esse processo com você. Avisei o admin no painel.", "alert", true);
      }

      const steps: any[] = Array.isArray((proc as any).steps) ? (proc as any).steps : [];
      const lines = steps.map((s: any, i: number) => {
        const meta = [s.responsible && `resp.: ${s.responsible}`, s.sla && `SLA ${s.sla}`].filter(Boolean).join(", ");
        return `**${i + 1}.** ${s.description}${meta ? ` _(${meta})_` : ""}`;
      });
      const header = `**${(proc as any).name}**${(proc as any).area ? ` · ${(proc as any).area}` : ""}`;
      return await respond(admin, companyId, channelName, `${header}\n${lines.join("\n") || "(sem passos)"}`, "response");
    }

    case "listar-rotinas": {
      const { data: rows } = await admin
        .from("routines")
        .select("name, frequency, instruction")
        .eq("company_id", companyId)
        .eq("status", "pending_approval")
        .order("created_at", { ascending: true })
        .limit(20);
      if (!rows || rows.length === 0) return await respond(admin, companyId, channelName, "Nenhuma rotina aguardando aprovação. ✅");
      const lines = rows.map((r: any) => `• **${r.name}** _(${r.frequency})_ — ${String(r.instruction ?? "").slice(0, 100)}`);
      return await respond(admin, companyId, channelName,
        `**Rotinas pendentes de aprovação**\n${lines.join("\n")}\n\nUse \`/aprovar-rotina <nome>\` para aprovar e despachar.`);
    }

    case "aprovar-rotina": {
      const caller = interaction.member?.user ?? interaction.user ?? null;
      const member = await findTeamMember(admin, companyId, caller);
      if (!canApprove(member)) {
        await admin.from("execution_logs").insert({
          company_id: companyId, type: "action",
          content: `Aprovação de rotina negada a @${callerHandle} — sem permissão de aprovação.`,
        });
        return await respond(admin, companyId, channelName,
          "Você não tem permissão para aprovar rotinas (precisa de \"Autoriza aprovações\"). Avisei o admin no painel.", "alert", true);
      }
      const q = String(interaction.data?.options?.[0]?.value ?? "").trim();
      if (!q) return await respond(admin, companyId, channelName, "Use: `/aprovar-rotina <nome ou id>`.", "response", true);

      let routine: any = null;
      if (UUID_RE.test(q)) {
        routine = (await admin.from("routines").select("id, name, status").eq("company_id", companyId).eq("id", q).maybeSingle()).data;
      }
      if (!routine) {
        routine = (await admin.from("routines").select("id, name, status").eq("company_id", companyId).ilike("name", `%${q}%`).limit(1).maybeSingle()).data;
      }
      if (!routine) return await respond(admin, companyId, channelName, `Não encontrei uma rotina com "${q}".`, "response", true);

      await admin.from("routines").update({ status: "active", approved: true }).eq("id", routine.id);
      await admin.from("execution_logs").insert({
        company_id: companyId, type: "action",
        content: `Rotina '${routine.name}' aprovada por @${callerHandle} via Discord.`,
      });
      await dispatchOrchestrator(supabaseUrl, serviceKey, { type: "routine", routine_id: routine.id, company_id: companyId });
      return await respond(admin, companyId, channelName, `✅ Rotina **${routine.name}** aprovada e despachada para o Atlas.`);
    }

    case "status-atlas": {
      const { data: company } = await admin.from("companies").select("owner_id").eq("id", companyId).maybeSingle();
      let inst: any = null;
      if (company?.owner_id) {
        inst = (await admin.from("atlas_instances")
          .select("last_seen, ingress_url, openclaw_version")
          .eq("owner_user_id", company.owner_id).maybeSingle()).data;
      }
      const online = !!inst?.last_seen && (Date.now() - new Date(inst.last_seen).getTime()) < 10 * 60 * 1000;
      const { count: running } = await admin.from("agent_runs")
        .select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("status", "dispatched");
      const last = inst?.last_seen ? new Date(inst.last_seen).toLocaleString("pt-BR") : "nunca";
      return await respond(admin, companyId, channelName,
        `**Atlas (instância)**\n` +
        `${online ? "🟢 online" : "🔴 offline"}${inst?.openclaw_version ? ` · v${inst.openclaw_version}` : ""}\n` +
        `Última atividade: ${last}\n` +
        `Runs em execução: ${running ?? 0}`);
    }

    default:
      return await respond(admin, companyId, channelName, `Comando desconhecido: \`${cmd}\``, "response", true);
  }
});
