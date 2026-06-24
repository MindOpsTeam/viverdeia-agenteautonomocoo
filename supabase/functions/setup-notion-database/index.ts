// setup-notion-database (Sprint 19)
// Stateless helper para o onboarding. O token do Notion vem no body — nada é persistido.
//   action: "list"   → lista TODOS os databases que a integração enxerga no workspace
//   action: "create" → cria um database de backlog com estrutura mínima sob uma página acessível
// O cliente persiste o resultado (database_id) em agent_config.notion_database_ids.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const NOTION_VERSION = "2022-06-28";

function notionHeaders(token: string) {
  return {
    "Authorization": `Bearer ${token}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  };
}

function titleOf(obj: any): string {
  const t = obj?.title ?? obj?.properties?.title?.title ?? [];
  if (Array.isArray(t) && t.length) return t.map((x: any) => x?.plain_text ?? "").join("").trim() || "Sem título";
  return "Sem título";
}

async function listDatabases(token: string) {
  const res = await fetch("https://api.notion.com/v1/search", {
    method: "POST",
    headers: notionHeaders(token),
    body: JSON.stringify({ filter: { value: "database", property: "object" }, page_size: 100 }),
  });
  if (res.status === 401) return { status: 401, body: { ok: false, error: "Token do Notion inválido" } };
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { status: 502, body: { ok: false, error: `Notion respondeu ${res.status}: ${text.slice(0, 200)}` } };
  }
  const data = await res.json();
  const databases = (data?.results ?? [])
    .filter((r: any) => r?.object === "database")
    .map((r: any) => ({ database_id: r.id, name: titleOf(r), url: r.url ?? null }));
  return { status: 200, body: { ok: true, databases } };
}

async function findParentPageId(token: string): Promise<string | null> {
  const res = await fetch("https://api.notion.com/v1/search", {
    method: "POST",
    headers: notionHeaders(token),
    body: JSON.stringify({ filter: { value: "page", property: "object" }, page_size: 10 }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  // Preferir páginas cujo parent seja workspace/page (criar database exige page_id como parent).
  const page = (data?.results ?? []).find((r: any) => r?.object === "page");
  return page?.id ?? null;
}

async function createDatabase(token: string, parentPageIdInput: string | undefined, titleInput: string | undefined) {
  const parentPageId = parentPageIdInput || (await findParentPageId(token));
  if (!parentPageId) {
    return {
      status: 422,
      body: {
        ok: false,
        error: "Nenhuma página acessível encontrada. Compartilhe uma página do Notion com a integração para o Atlas criar o database dentro dela.",
      },
    };
  }

  const res = await fetch("https://api.notion.com/v1/databases", {
    method: "POST",
    headers: notionHeaders(token),
    body: JSON.stringify({
      parent: { type: "page_id", page_id: parentPageId },
      title: [{ type: "text", text: { content: titleInput || "Backlog do Atlas" } }],
      properties: {
        "Name": { title: {} },
        "Status": {
          select: {
            options: [
              { name: "Todo", color: "default" },
              { name: "Doing", color: "blue" },
              { name: "Blocked", color: "yellow" },
              { name: "Done", color: "green" },
            ],
          },
        },
        "Responsável": { rich_text: {} },
        "Prioridade": {
          select: {
            options: [
              { name: "Alta", color: "red" },
              { name: "Média", color: "yellow" },
              { name: "Baixa", color: "gray" },
            ],
          },
        },
      },
    }),
  });

  if (res.status === 401) return { status: 401, body: { ok: false, error: "Token do Notion inválido" } };
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { status: 502, body: { ok: false, error: `Notion respondeu ${res.status} ao criar o database: ${text.slice(0, 300)}` } };
  }
  const data = await res.json();
  return { status: 200, body: { ok: true, database_id: data.id, name: titleOf(data), url: data.url ?? null } };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const action = body?.action as "list" | "create" | undefined;
    const token = (body?.notion_token ?? "") as string;

    if (!token) {
      return json(400, { ok: false, error: "Token do Notion ausente" });
    }

    let result: { status: number; body: unknown };
    if (action === "list") {
      result = await listDatabases(token);
    } else if (action === "create") {
      result = await createDatabase(token, body?.parent_page_id, body?.title);
    } else {
      result = { status: 400, body: { ok: false, error: "action inválida (use 'list' ou 'create')" } };
    }

    // Sempre 200 em desfechos de negócio: o cliente lê body.ok/body.error.
    // (supabase-js só expõe o corpo em respostas 2xx; non-2xx vira erro opaco.)
    return json(200, result.body);
  } catch (e: any) {
    return json(500, { ok: false, error: e?.message ?? "Erro no setup-notion-database" });
  }
});

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
