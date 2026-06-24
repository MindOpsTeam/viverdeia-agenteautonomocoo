// transcribe-audio (Sprint 20)
// Baixa um arquivo de áudio/vídeo do bucket privado 'process-imports' (service role) e
// transcreve via Whisper (OPENAI_API_KEY global). Retorna o texto.
// MP4/MP3/M4A/WAV/WEBM são aceitos direto pelo Whisper. MOV NÃO é suportado.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_BYTES = 25 * 1024 * 1024; // 25MB — limite do Whisper
const WHISPER_OK = ["mp3", "m4a", "wav", "mp4", "mpeg", "mpga", "webm", "oga", "ogg", "flac"];

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(401, { ok: false, error: "Não autorizado" });

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) return json(400, { ok: false, error: "OPENAI_API_KEY não configurada no projeto." });

    const { storage_path, source_name } = await req.json().catch(() => ({}));
    if (!storage_path) return json(400, { ok: false, error: "storage_path obrigatório" });

    const ext = String(source_name ?? storage_path).split(".").pop()?.toLowerCase() ?? "";
    if (ext === "mov") {
      return json(422, { ok: false, error: "Formato MOV não é suportado pela transcrição. Converta para MP4 e tente novamente." });
    }
    if (ext && !WHISPER_OK.includes(ext)) {
      return json(422, { ok: false, error: `Formato .${ext} não suportado para transcrição.` });
    }

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: file, error: dlErr } = await admin.storage.from("process-imports").download(storage_path);
    if (dlErr || !file) return json(404, { ok: false, error: `Arquivo não encontrado no Storage: ${dlErr?.message ?? ""}` });
    if (file.size > MAX_BYTES) return json(413, { ok: false, error: "Arquivo acima de 25MB. Envie um trecho menor ou com menor qualidade." });

    const fd = new FormData();
    fd.append("file", file, (source_name ?? storage_path.split("/").pop() ?? "audio.mp4"));
    fd.append("model", "whisper-1");

    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${openaiKey}` },
      body: fd,
    });
    if (!res.ok) {
      const b = await res.text().catch(() => "");
      if (res.status === 400) return json(422, { ok: false, error: "Não consegui transcrever com clareza. Tente um arquivo com melhor qualidade de áudio." });
      return json(502, { ok: false, error: `Whisper respondeu ${res.status}: ${b.slice(0, 200)}` });
    }
    const data = await res.json();
    const transcript = String(data?.text ?? "").trim();
    if (transcript.length < 10) {
      return json(422, { ok: false, error: "Não consegui transcrever com clareza. Tente um arquivo com melhor qualidade de áudio." });
    }
    return json(200, { ok: true, transcript });
  } catch (e: any) {
    return json(502, { ok: false, error: e?.message ?? "Erro ao transcrever" });
  }
});
