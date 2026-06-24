// brain-sync (Sprint 18): compila o Cérebro em arquivos de skill e:
//  1) commita no repositório GitHub privado do cliente (PAT do Vault) — canal real de skills;
//  2) mantém a compilação paralela em agent_config.soul_md/agents_md/user_md (coo-chat/execute-task).
// A VPS Hostinger puxa o repo via brain_sync (~2min).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TONE_LABEL: Record<string, string> = { direct: "Direto e objetivo", formal: "Formal", informal: "Informal" };

/* ---------- compiladores ---------- */

function buildIdentity(ctx: any): string {
  const name = ctx?.agent_name || "Atlas";
  const cases = Array.isArray(ctx?.cases) ? ctx.cases : [];
  const lines = [
    `# Identidade do ${name}`,
    `Nome: ${name}`,
    `Tom: ${TONE_LABEL[ctx?.communication_tone] ?? "Direto e objetivo"}`,
    ctx?.mission ? `\n## Missão\n${ctx.mission}` : "",
    ctx?.target_audience ? `\n## Público-alvo\n${ctx.target_audience}` : "",
    ctx?.presentation ? `\n## Como se apresenta\n${ctx.presentation}` : "",
  ];
  if (cases.length) {
    lines.push("\n## Cases");
    for (const c of cases) lines.push(`- **${c.title}**: ${c.result}`);
  }
  return lines.filter(Boolean).join("\n");
}

function buildGuardrails(directives: any[]): string {
  const lines = ["# Guardrails", "Regras que o agente NUNCA quebra:", ""];
  if (!directives.length) lines.push("(Nenhum guardrail definido ainda.)");
  else for (const d of directives) lines.push(`- ${d.content}`);
  return lines.join("\n");
}

function buildProducts(ctx: any): string {
  const products = Array.isArray(ctx?.products) ? ctx.products : [];
  const lines = ["# Produtos e serviços", ""];
  if (!products.length) lines.push("(Nenhum produto cadastrado.)");
  else for (const p of products) lines.push(`- **${p.name}**: ${p.description ?? ""}`);
  return lines.join("\n");
}

function buildContext(ctx: any, files: any[], sources: any[]): string {
  const lines = ["# Contexto operacional"];
  if (ctx?.operational_context) lines.push(ctx.operational_context);
  lines.push("", "## Base de conhecimento ativa");
  const af = files.filter((f) => f.active); const as_ = sources.filter((s) => s.active);
  if (!af.length && !as_.length) lines.push("(Nenhuma fonte ativada.)");
  else { for (const f of af) lines.push(`- Arquivo: ${f.filename}`); for (const s of as_) lines.push(`- Fonte: ${s.filename} (${s.source_type})`); }
  return lines.join("\n");
}

function buildSkills(ctx: any): string {
  const skills = Array.isArray(ctx?.skills_enabled) ? ctx.skills_enabled : [];
  const lines = ["# Habilidades ativas", ""];
  if (!skills.length) lines.push("(Nenhuma habilidade ativada.)");
  else for (const s of skills) lines.push(`- ${s}`);
  return lines.join("\n");
}

// compatibilidade com o painel (coo-chat/execute-task leem agent_config)
function buildSoul(ctx: any): string {
  const name = ctx?.agent_name || "Atlas";
  // System prompt base (Atlas COO) na frente — assim coo-chat/execute-task usam o prompt
  // mesmo sem GitHub configurado. A identidade personalizada vem logo abaixo.
  const base = ctx?.system_prompt ? `${ctx.system_prompt}\n\n---\n\n` : "";
  return base + [
    `# Identidade do ${name}`, `Nome: ${name}`, `Tom: ${TONE_LABEL[ctx?.communication_tone] ?? "Direto e objetivo"}`,
    ctx?.mission ? `Missão: ${ctx.mission}` : "Papel: Braço operacional autônomo da empresa.",
    ctx?.presentation ? `\n## Como se apresenta\n${ctx.presentation}` : "",
  ].filter(Boolean).join("\n");
}
function buildAgents(directives: any[]): string {
  const lines = ["# Como o agente opera", "Toda ação destrutiva ou comunicação externa exige aprovação humana.", "Nunca deixe tarefa presa em 'doing' — escale como 'blocked'.", "", "## Guardrails"];
  if (!directives.length) lines.push("(Nenhum guardrail ativo.)"); else for (const d of directives) lines.push(`- ${d.content}`);
  return lines.join("\n");
}

/* ---------- GitHub ---------- */

function ghHeaders(pat: string) {
  return { "Authorization": `Bearer ${pat}`, "Accept": "application/vnd.github+json", "User-Agent": "atlas-brain-sync", "Content-Type": "application/json" };
}

async function commitToGithub(pat: string, repoUrl: string, files: { path: string; content: string }[], message: string): Promise<string> {
  const m = repoUrl.match(/github\.com[/:]([^/]+)\/([^/.\s]+)(?:\.git)?/i);
  if (!m) throw new Error("URL do repositório GitHub inválida");
  const owner = m[1], repo = m[2];
  const base = `https://api.github.com/repos/${owner}/${repo}`;
  const H = ghHeaders(pat);

  const repoRes = await fetch(base, { headers: H });
  if (repoRes.status === 404) throw new Error("Repositório não encontrado ou PAT sem acesso");
  if (!repoRes.ok) throw new Error(`GitHub ${repoRes.status} ao acessar o repositório`);
  const branch = (await repoRes.json()).default_branch || "main";

  const refRes = await fetch(`${base}/git/ref/heads/${branch}`, { headers: H });
  if (refRes.status === 404) throw new Error(`Branch '${branch}' vazia — inicialize o repo com um commit (ex.: README) e tente de novo`);
  if (!refRes.ok) throw new Error(`GitHub ${refRes.status} ao ler a branch`);
  const baseCommitSha = (await refRes.json()).object.sha;

  const baseCommit = await (await fetch(`${base}/git/commits/${baseCommitSha}`, { headers: H })).json();
  const baseTreeSha = baseCommit.tree.sha;

  const treeRes = await fetch(`${base}/git/trees`, {
    method: "POST", headers: H,
    body: JSON.stringify({ base_tree: baseTreeSha, tree: files.map((f) => ({ path: f.path, mode: "100644", type: "blob", content: f.content })) }),
  });
  if (!treeRes.ok) throw new Error(`GitHub ${treeRes.status} ao criar a árvore de arquivos`);
  const newTreeSha = (await treeRes.json()).sha;

  const commitRes = await fetch(`${base}/git/commits`, {
    method: "POST", headers: H,
    body: JSON.stringify({ message, tree: newTreeSha, parents: [baseCommitSha] }),
  });
  if (!commitRes.ok) throw new Error(`GitHub ${commitRes.status} ao criar o commit`);
  const newCommitSha = (await commitRes.json()).sha;

  const updRes = await fetch(`${base}/git/refs/heads/${branch}`, { method: "PATCH", headers: H, body: JSON.stringify({ sha: newCommitSha }) });
  if (!updRes.ok) throw new Error(`GitHub ${updRes.status} ao atualizar a branch`);
  return newCommitSha;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const token = authHeader.replace("Bearer ", "");
    const calledByService = token === serviceKey;

    let userClient: ReturnType<typeof createClient>;
    if (calledByService) {
      userClient = createClient(supabaseUrl, serviceKey);
    } else {
      const admin = createClient(supabaseUrl, serviceKey);
      const { data: userData, error: userErr } = await admin.auth.getUser(token);
      if (userErr || !userData.user) return new Response(JSON.stringify({ error: "Token inválido" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    }

    const { company_id } = await req.json();
    if (!company_id) return new Response(JSON.stringify({ error: "company_id obrigatório" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const [{ data: ctx }, { data: directives }, { data: knowledge }, { data: cfg }] = await Promise.all([
      userClient.from("company_context").select("*").eq("company_id", company_id).maybeSingle(),
      userClient.from("directives").select("content, status").eq("company_id", company_id).eq("status", "active"),
      userClient.from("knowledge_files").select("filename, source_type, kind, active").eq("company_id", company_id),
      userClient.from("agent_config").select("github_repo_url").eq("company_id", company_id).maybeSingle(),
    ]);

    const dirs = (directives ?? []) as any[];
    const knFiles = (knowledge ?? []).filter((k: any) => k.kind === "file");
    const sources = (knowledge ?? []).filter((k: any) => k.kind === "source");

    const now = new Date();
    const stamp = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}.${String(now.getDate()).padStart(2, "0")}`;
    const brain_version = `v.${stamp}-${String(company_id).slice(0, 6)}`;

    // 1) compila para agent_config (painel)
    await userClient.from("agent_config").update({
      soul_md: buildSoul(ctx), agents_md: buildAgents(dirs), user_md: buildContext(ctx, knFiles, sources),
      brain_version, brain_synced_at: now.toISOString(),
    }).eq("company_id", company_id);

    // 2) commit no GitHub do cliente (se configurado)
    let commitHash: string | null = null;
    const repoUrl: string | undefined = (cfg as any)?.github_repo_url;
    if (repoUrl) {
      const { data: pat } = await userClient.rpc("read_credential" as any, { p_company_id: company_id, p_service: "github" });
      if (!pat) {
        return new Response(JSON.stringify({ error: "Repo GitHub configurado mas o PAT não está no Vault. Salve o PAT em Credenciais." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const files = [
        { path: "identity.md", content: buildIdentity(ctx) },
        { path: "guardrails.md", content: buildGuardrails(dirs) },
        { path: "system_prompt.md", content: (ctx as any)?.system_prompt || "(sem system prompt)" },
        { path: "knowledge/products.md", content: buildProducts(ctx) },
        { path: "knowledge/context.md", content: buildContext(ctx, knFiles, sources) },
        { path: "skills/enabled.md", content: buildSkills(ctx) },
      ];
      try {
        const sha = await commitToGithub(pat, repoUrl, files, `Atlas brain-sync ${brain_version}`);
        commitHash = sha.slice(0, 7);
        await userClient.from("agent_config").update({ github_commit_hash: commitHash }).eq("company_id", company_id);
      } catch (e: any) {
        return new Response(JSON.stringify({ error: `Compilado, mas falhou ao commitar no GitHub: ${e?.message ?? e}` }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    await userClient.from("execution_logs").insert({
      company_id, type: "action",
      content: `Cérebro sincronizado (${brain_version})${commitHash ? ` · commit ${commitHash}` : " · sem GitHub"}: ${dirs.length} guardrail(s), ${knFiles.length} arquivo(s).`,
    });

    return new Response(JSON.stringify({ success: true, brain_version, brain_synced_at: now.toISOString(), commit_hash: commitHash, directives: dirs.length, files: knFiles.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? "Erro" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
