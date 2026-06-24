// process-import (Sprint 20) — orquestrador assíncrono.
// Recebe { import_id }, responde 202 na hora e processa em background (EdgeRuntime.waitUntil),
// atualizando process_imports.status a cada etapa. Pipeline por 'kind':
//   audio/video → transcribe-audio (Whisper) → analyze-process-content
//   url         → process-from-url (Loom/YouTube) → analyze-process-content
//   transcript  → analyze-process-content (texto já no job)
//   document    → analyze-process-content (pdf/docx base64 do Storage)
// O front assina o job via Realtime e mostra progresso + badge quando 'ready'.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function callFn(slug: string, auth: string, body: unknown): Promise<any> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${slug}`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${auth}`, "apikey": SERVICE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return await res.json().catch(() => ({ ok: false, error: `Falha ao chamar ${slug}` }));
}

function mimeOf(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "application/pdf";
  if (ext === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  return "application/octet-stream";
}

async function runPipeline(importId: string, userAuth: string): Promise<void> {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const setJob = (patch: Record<string, unknown>) => admin.from("process_imports").update(patch).eq("id", importId);

  try {
    const { data: job } = await admin.from("process_imports").select("*").eq("id", importId).maybeSingle();
    if (!job) return;

    let transcript: string = job.transcript ?? "";
    let documentPayload: { mime: string; data_base64: string } | null = null;
    let origin = job.source_name ?? "";

    // ---- 1) Obter o conteúdo (transcrição ou documento) ----
    if (job.kind === "audio" || job.kind === "video") {
      await setJob({ status: "transcribing", progress_message: "Transcrevendo…" });
      const r = await callFn("transcribe-audio", SERVICE_KEY, { storage_path: job.storage_path, source_name: job.source_name });
      if (!r?.ok) { await setJob({ status: "error", error: r?.error ?? "Falha na transcrição" }); return; }
      transcript = r.transcript;
      origin = `Extraído de ${job.source_name ?? "arquivo"}`;
    } else if (job.kind === "url") {
      await setJob({ status: "transcribing", progress_message: "Extraindo transcrição da URL…" });
      const r = await callFn("process-from-url", SERVICE_KEY, { url: job.url });
      if (!r?.ok) { await setJob({ status: "error", error: r?.error ?? "Falha ao extrair a URL" }); return; }
      transcript = r.transcript;
      origin = r.title ? `${/youtu/.test(job.url ?? "") ? "YouTube" : "Loom"}: ${r.title}` : (job.url ?? "");
    } else if (job.kind === "document") {
      await setJob({ status: "analyzing", progress_message: "Lendo o documento…" });
      const { data: file, error: dlErr } = await admin.storage.from("process-imports").download(job.storage_path);
      if (dlErr || !file) { await setJob({ status: "error", error: "Documento não encontrado no Storage." }); return; }
      const bytes = new Uint8Array(await file.arrayBuffer());
      documentPayload = { mime: mimeOf(job.source_name ?? job.storage_path), data_base64: encodeBase64(bytes) };
      origin = `Importado de ${job.source_name ?? "documento"}`;
    } else { // transcript
      origin = `Importado de ${job.source_name ?? "transcrição"}`;
    }

    // ---- 2) Analisar e estruturar ----
    await setJob({ status: "analyzing", progress_message: "Analisando…", transcript: transcript || null });
    const analysis = await callFn("analyze-process-content", userAuth, {
      company_id: job.company_id,
      ...(documentPayload ? { document: documentPayload } : { text: transcript }),
    });
    if (!analysis?.ok) { await setJob({ status: "error", error: analysis?.error ?? "Falha ao analisar o conteúdo" }); return; }

    await setJob({ status: "structuring", progress_message: "Estruturando processos…" });
    const processes = (analysis.processes ?? []).map((p: any) => ({ ...p, import_origin: origin }));

    // ---- 3) Pronto ----
    await setJob({ status: "ready", progress_message: "Pronto para revisar", result: processes, error: null });

    // Limpeza best-effort: remove o arquivo do Storage (áudio/vídeo/documento são temporários).
    if (job.storage_path) {
      try { await admin.storage.from("process-imports").remove([job.storage_path]); } catch (_) { /* ignore */ }
    }
  } catch (e: any) {
    await admin.from("process_imports").update({ status: "error", error: e?.message ?? "Erro no processamento" }).eq("id", importId);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(401, { ok: false, error: "Não autorizado" });
    const userAuth = authHeader.replace("Bearer ", "");

    const { import_id } = await req.json().catch(() => ({}));
    if (!import_id) return json(400, { ok: false, error: "import_id obrigatório" });

    // Processa em background — sobrevive à navegação do usuário.
    EdgeRuntime.waitUntil(runPipeline(import_id, userAuth));

    return json(202, { ok: true, accepted: true });
  } catch (e: any) {
    return json(500, { ok: false, error: e?.message ?? "Erro" });
  }
});
