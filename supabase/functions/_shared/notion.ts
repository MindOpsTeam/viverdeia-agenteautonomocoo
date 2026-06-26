// Atlas COO - Notion integration v1
// notion.ts — cria/atualiza páginas no database de Backlog do Notion da empresa.
// Best-effort: nunca lança (retorna null/false) para não quebrar o fluxo que o chama.
// Lê o token via read_credential_service e o database de backlog em agent_config.
import { adminClient } from "./panel.ts";

const NOTION_VERSION = "2022-06-28";
const NOTION_API = "https://api.notion.com/v1";

function headers(token: string) {
  return { "Authorization": `Bearer ${token}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" };
}

type Admin = ReturnType<typeof adminClient>;

async function notionToken(admin: Admin, companyId: string): Promise<string | null> {
  const { data } = await admin.rpc("read_credential_service", { p_company_id: companyId, p_service: "notion" });
  return (data as string) || null;
}

// database_id do Backlog: agent_config.notion_database_id (singular) ou o de type='backlog' em notion_database_ids.
async function backlogDatabaseId(admin: Admin, companyId: string): Promise<string | null> {
  const { data: cfg } = await admin.from("agent_config")
    .select("notion_database_id, notion_database_ids").eq("company_id", companyId).maybeSingle();
  if (cfg?.notion_database_id) return cfg.notion_database_id as string;
  const list = Array.isArray(cfg?.notion_database_ids) ? cfg!.notion_database_ids : [];
  const backlog = list.find((d: any) => d?.type === "backlog") ?? list.find((d: any) => d?.type && d.type !== "ignore");
  return backlog?.database_id ?? null;
}

type PropEntry = { name: string; prop: any };
function findProp(props: Record<string, any>, type: string, nameRe?: RegExp): PropEntry | null {
  const entries = Object.entries(props ?? {});
  if (nameRe) {
    const named = entries.find(([n, p]) => (p as any).type === type && nameRe.test(n));
    if (named) return { name: named[0], prop: named[1] };
  }
  const byType = entries.find(([, p]) => (p as any).type === type);
  return byType ? { name: byType[0], prop: byType[1] } : null;
}

function optionsOf(prop: any): Array<{ name: string }> {
  return prop?.status?.options ?? prop?.select?.options ?? [];
}
function pickOption(prop: any, re: RegExp): string | null {
  return optionsOf(prop).find((o) => re.test(o.name))?.name ?? null;
}
function statusValue(prop: any, name: string): Record<string, unknown> {
  return prop.type === "status" ? { status: { name } } : { select: { name } };
}

const PRIORITY_RE: Record<string, RegExp> = { high: /alta|high/i, medium: /m[ée]dia|medium|normal/i, low: /baixa|low/i };
const TODO_RE = /to.?do|a\s*fazer|fazer|todo|backlog|pendente|aberto|novo/i;

export interface NewNotionTask {
  title: string;
  description?: string;
  priority?: "high" | "medium" | "low";
  assignee?: string;
}

// Cria uma página no database de backlog. Retorna { notion_page_id } ou null.
export async function createNotionTask(companyId: string, task: NewNotionTask): Promise<{ notion_page_id: string } | null> {
  try {
    const admin = adminClient();
    const [token, dbId] = await Promise.all([notionToken(admin, companyId), backlogDatabaseId(admin, companyId)]);
    if (!token || !dbId) return null;

    const dres = await fetch(`${NOTION_API}/databases/${dbId}`, { headers: headers(token) });
    if (!dres.ok) return null;
    const db = await dres.json();
    const props = db.properties ?? {};

    const titleProp = findProp(props, "title");
    if (!titleProp) return null;

    const properties: Record<string, unknown> = {
      [titleProp.name]: { title: [{ text: { content: task.title.slice(0, 1900) } }] },
    };

    // Status → opção "a fazer".
    const statusProp = findProp(props, "status") ?? findProp(props, "select", /status|situa|estado/i);
    if (statusProp) {
      const val = pickOption(statusProp.prop, TODO_RE) ?? optionsOf(statusProp.prop)[0]?.name;
      if (val) properties[statusProp.name] = statusValue(statusProp.prop, val);
    }

    // Prioridade.
    if (task.priority) {
      const prioProp = findProp(props, "select", /priorid|priority/i);
      const val = prioProp ? pickOption(prioProp.prop, PRIORITY_RE[task.priority]) : null;
      if (prioProp && val) properties[prioProp.name] = { select: { name: val } };
    }

    // Responsável.
    if (task.assignee) {
      const respProp = findProp(props, "rich_text", /respons|assignee|owner/i);
      if (respProp) properties[respProp.name] = { rich_text: [{ text: { content: String(task.assignee).slice(0, 200) } }] };
    }

    // Descrição: usa prop rich_text de descrição se existir; senão vai pro corpo da página.
    const children: any[] = [];
    if (task.description) {
      const descProp = findProp(props, "rich_text", /descri|description|detalhe/i);
      if (descProp) {
        properties[descProp.name] = { rich_text: [{ text: { content: task.description.slice(0, 1900) } }] };
      } else {
        children.push({ object: "block", type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: task.description.slice(0, 1900) } }] } });
      }
    }

    const res = await fetch(`${NOTION_API}/pages`, {
      method: "POST",
      headers: headers(token),
      body: JSON.stringify({ parent: { database_id: dbId }, properties, ...(children.length ? { children } : {}) }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.id ? { notion_page_id: data.id as string } : null;
  } catch {
    return null;
  }
}

// Atualiza o Status da página no Notion (done → concluído, blocked → bloqueado). Best-effort.
export async function updateNotionTaskStatus(companyId: string, pageId: string, kind: "done" | "blocked"): Promise<boolean> {
  try {
    const admin = adminClient();
    const token = await notionToken(admin, companyId);
    if (!token) return false;

    const pres = await fetch(`${NOTION_API}/pages/${pageId}`, { headers: headers(token) });
    if (!pres.ok) return false;
    const page = await pres.json();
    const props = page.properties ?? {};

    let entry = findProp(props, "status");
    if (!entry) entry = findProp(props, "select", /status|situa|estado/i);
    if (!entry) return false;

    // As opções não vêm na página — leem-se do database pai.
    const re = kind === "done" ? /done|conclu|feito|complete|finaliz/i : /block|bloque|trav/i;
    let optionName: string | null = null;
    const dbId = page.parent?.database_id;
    if (dbId) {
      const dres = await fetch(`${NOTION_API}/databases/${dbId}`, { headers: headers(token) });
      if (dres.ok) {
        const db = await dres.json();
        optionName = pickOption(db.properties?.[entry.name], re);
      }
    }
    if (!optionName) optionName = kind === "done" ? "Done" : "Blocked";

    const ures = await fetch(`${NOTION_API}/pages/${pageId}`, {
      method: "PATCH",
      headers: headers(token),
      body: JSON.stringify({ properties: { [entry.name]: statusValue(entry.prop, optionName) } }),
    });
    return ures.ok;
  } catch {
    return false;
  }
}

// true se o id parece um page id do Notion (32 hex, com ou sem hífens) — e não um id sintético.
export function isNotionPageId(id: string | null | undefined): boolean {
  return !!id && /^[0-9a-f]{32}$/i.test(id.replace(/-/g, ""));
}
