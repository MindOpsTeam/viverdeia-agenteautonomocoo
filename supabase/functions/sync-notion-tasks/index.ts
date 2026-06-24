// Pulls the company's Notion database, filters Assignee=Atlas (também aceita "COO" por compat),
// and upserts into public.tasks.
// Reads the Notion token from Supabase Vault via read_credential RPC.
// Returns the list of pending tasks (todo/doing/blocked) for the company.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type NotionPage = {
  id: string;
  properties: Record<string, any>;
};

function readText(prop: any): string {
  if (!prop) return "";
  // title or rich_text
  const arr = prop.title ?? prop.rich_text;
  if (Array.isArray(arr)) return arr.map((t: any) => t?.plain_text ?? "").join("");
  if (typeof prop.plain_text === "string") return prop.plain_text;
  return "";
}

function readSelect(prop: any): string | null {
  if (!prop) return null;
  if (prop.select?.name) return prop.select.name;
  if (prop.status?.name) return prop.status.name;
  return null;
}

function readPeople(prop: any): string[] {
  if (!prop?.people) return [];
  return prop.people.map((p: any) => p?.name ?? p?.id ?? "").filter(Boolean);
}

function mapStatus(raw: string | null): "todo" | "doing" | "done" | "blocked" {
  if (!raw) return "todo";
  const v = raw.toLowerCase();
  if (v.includes("done") || v.includes("conclu")) return "done";
  if (v.includes("doing") || v.includes("andamento") || v.includes("progress")) return "doing";
  if (v.includes("block") || v.includes("bloque")) return "blocked";
  return "todo";
}

function mapPriority(raw: string | null): "high" | "medium" | "low" {
  if (!raw) return "medium";
  const v = raw.toLowerCase();
  if (v.includes("high") || v.includes("alta")) return "high";
  if (v.includes("low") || v.includes("baixa")) return "low";
  return "medium";
}

// Aliases do agente no Notion: "atlas" (marca atual) e "coo" (compat com setups antigos).
const AGENT_ALIASES = ["atlas", "coo"];
function matchesAgent(value: string): boolean {
  const v = value.toLowerCase();
  return AGENT_ALIASES.some((a) => v.includes(a));
}

function isAssignedToAgent(props: Record<string, any>): boolean {
  const candidates = ["Assignee", "Assigned", "Responsável", "Responsavel", "Owner"];
  for (const key of candidates) {
    const p = props[key];
    if (!p) continue;
    const names = readPeople(p);
    if (names.some((n) => matchesAgent(n))) return true;
    const txt = readText(p) || readSelect(p);
    if (txt && matchesAgent(txt)) return true;
  }
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: userData, error: userErr } = await admin.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Token inválido" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    // ------------- Resolve company -------------
    const body = await req.json().catch(() => ({}));
    let companyId: string | undefined = body?.company_id;
    if (!companyId) {
      const { data: company } = await userClient
        .from("companies")
        .select("id")
        .eq("owner_id", userId)
        .maybeSingle();
      companyId = company?.id;
    }
    if (!companyId) {
      return new Response(JSON.stringify({ error: "Empresa não encontrada" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ------------- Read database_id from agent_config -------------
    const { data: config, error: cfgErr } = await userClient
      .from("agent_config")
      .select("notion_database_id")
      .eq("company_id", companyId)
      .maybeSingle();
    if (cfgErr || !config?.notion_database_id) {
      return new Response(JSON.stringify({ error: "agent_config.notion_database_id ausente" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ------------- Read Notion token from Vault -------------
    const { data: notionToken, error: tokErr } = await userClient.rpc(
      "read_credential" as any,
      { p_company_id: companyId, p_service: "notion" },
    );
    if (tokErr || !notionToken) {
      return new Response(JSON.stringify({ error: "Token Notion não encontrado no Vault" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ------------- Query Notion -------------
    const pages: NotionPage[] = [];
    let cursor: string | undefined = undefined;
    do {
      const res = await fetch(
        `https://api.notion.com/v1/databases/${config.notion_database_id}/query`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${notionToken}`,
            "Notion-Version": "2022-06-28",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ start_cursor: cursor, page_size: 100 }),
        },
      );
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        return new Response(JSON.stringify({ error: `Notion ${res.status}: ${txt.slice(0, 300)}` }), {
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const data = await res.json();
      pages.push(...(data.results ?? []));
      cursor = data.has_more ? data.next_cursor : undefined;
    } while (cursor);

    // ------------- Filter Assignee=Atlas (ou COO, compat) and upsert -------------
    const agentPages = pages.filter((p) => isAssignedToAgent(p.properties ?? {}));

    let upserted = 0;
    for (const page of agentPages) {
      const props = page.properties ?? {};
      const title =
        readText(props.Name) ||
        readText(props.Title) ||
        readText(props.Tarefa) ||
        "(sem título)";
      const description = readText(props.Description) || readText(props.Descrição) || null;
      const statusRaw = readSelect(props.Status);
      const priorityRaw = readSelect(props.Priority) || readSelect(props.Prioridade);

      const { error: upErr } = await userClient
        .from("tasks")
        .upsert({
          company_id: companyId,
          notion_task_id: page.id,
          title,
          description,
          status: mapStatus(statusRaw),
          priority: mapPriority(priorityRaw),
          source: "notion",
        }, { onConflict: "company_id,notion_task_id" });

      if (!upErr) upserted++;
    }

    // ------------- Log the sync action -------------
    await userClient.from("execution_logs").insert({
      company_id: companyId,
      type: "action",
      content: `Sync Notion: ${upserted} tarefa(s) atribuídas ao Atlas sincronizadas (de ${pages.length} total).`,
    });

    // ------------- Return current pending tasks -------------
    const { data: pending } = await userClient
      .from("tasks")
      .select("*")
      .eq("company_id", companyId)
      .in("status", ["todo", "doing", "blocked"])
      .order("priority", { ascending: true })
      .order("created_at", { ascending: false });

    return new Response(JSON.stringify({
      success: true,
      total_in_notion: pages.length,
      coo_tasks_synced: upserted,
      pending: pending ?? [],
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? "Erro" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
