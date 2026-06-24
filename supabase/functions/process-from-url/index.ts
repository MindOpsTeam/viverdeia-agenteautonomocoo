// process-from-url (Sprint 20)
// Extrai a transcrição de uma URL de YouTube ou Loom (best-effort, sem auth).
// YouTube: lê as faixas de legenda do watch page (timedtext). Loom: tenta achar a VTT no embed.
// Ambos são frágeis por natureza — em caso de falha, retorna erro claro orientando upload do arquivo.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ").trim();
}

/* ---------------- YouTube ---------------- */

function youtubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

async function youtubeTranscript(id: string): Promise<{ ok: boolean; transcript?: string; title?: string; error?: string }> {
  const page = await fetch(`https://www.youtube.com/watch?v=${id}&hl=pt`, { headers: { "User-Agent": UA, "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8" } });
  if (!page.ok) return { ok: false, error: `YouTube respondeu ${page.status}` };
  const html = await page.text();

  const titleMatch = html.match(/"title":"((?:[^"\\]|\\.)*)","lengthSeconds"/) ?? html.match(/<title>([^<]*)<\/title>/);
  const title = titleMatch ? decodeEntities(titleMatch[1].replace(/\\u0026/g, "&")).replace(" - YouTube", "") : "YouTube";

  const tracksMatch = html.match(/"captionTracks":(\[.*?\])/);
  if (!tracksMatch) {
    return { ok: false, error: "Esse vídeo não tem legendas disponíveis para extrair. Baixe o arquivo e faça upload." };
  }
  let tracks: any[];
  try { tracks = JSON.parse(tracksMatch[1].replace(/\\u0026/g, "&")); } catch { return { ok: false, error: "Não consegui ler as legendas do vídeo." }; }
  if (!tracks.length) return { ok: false, error: "Esse vídeo não tem legendas. Baixe o arquivo e faça upload." };

  const pick = tracks.find((t) => /^pt/.test(t.languageCode)) ?? tracks.find((t) => /^en/.test(t.languageCode)) ?? tracks[0];
  const xmlRes = await fetch(pick.baseUrl, { headers: { "User-Agent": UA } });
  if (!xmlRes.ok) return { ok: false, error: "Falha ao baixar a legenda do vídeo." };
  const xml = await xmlRes.text();
  const parts = [...xml.matchAll(/<text[^>]*>(.*?)<\/text>/g)].map((m) => decodeEntities(m[1]));
  const transcript = parts.join(" ").trim();
  if (transcript.length < 20) return { ok: false, error: "Legenda vazia. Baixe o arquivo e faça upload." };
  return { ok: true, transcript, title };
}

/* ---------------- Loom ---------------- */

function loomId(url: string): string | null {
  const m = url.match(/loom\.com\/(?:share|embed)\/([A-Za-z0-9]+)/);
  return m ? m[1] : null;
}

async function loomTranscript(id: string): Promise<{ ok: boolean; transcript?: string; title?: string; error?: string }> {
  const page = await fetch(`https://www.loom.com/share/${id}`, { headers: { "User-Agent": UA } });
  if (!page.ok) return { ok: false, error: `Loom respondeu ${page.status}` };
  const html = await page.text();

  const titleMatch = html.match(/<meta property="og:title" content="([^"]*)"/);
  const title = titleMatch ? decodeEntities(titleMatch[1]) : "Loom";

  // Tenta localizar uma URL de legenda (.vtt) embutida no HTML.
  const vttMatch = html.match(/https?:\/\/[^"'\\]+\.vtt[^"'\\]*/);
  if (!vttMatch) {
    return { ok: false, error: "Não consegui extrair a transcrição deste Loom. Baixe o vídeo e faça upload do arquivo." };
  }
  const vttRes = await fetch(vttMatch[0].replace(/\\u002F/g, "/"), { headers: { "User-Agent": UA } });
  if (!vttRes.ok) return { ok: false, error: "Falha ao baixar a transcrição do Loom." };
  const vtt = await vttRes.text();
  // Remove cabeçalho WEBVTT, timestamps e numeração de cues.
  const transcript = vtt
    .replace(/^WEBVTT.*$/m, "")
    .split(/\r?\n/)
    .filter((l) => l.trim() && !/-->/.test(l) && !/^\d+$/.test(l.trim()))
    .join(" ").replace(/\s+/g, " ").trim();
  if (transcript.length < 20) return { ok: false, error: "Transcrição do Loom vazia. Baixe o vídeo e faça upload." };
  return { ok: true, transcript, title };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { url } = await req.json().catch(() => ({}));
    if (!url || typeof url !== "string") return json(400, { ok: false, error: "url obrigatória" });

    const yt = youtubeId(url);
    const lm = loomId(url);

    let result: { ok: boolean; transcript?: string; title?: string; error?: string };
    if (yt) result = await youtubeTranscript(yt);
    else if (lm) result = await loomTranscript(lm);
    else result = { ok: false, error: "Esta URL não é suportada ainda. Suportamos YouTube e Loom. Baixe o arquivo e faça upload." };

    return json(200, result);
  } catch (e: any) {
    return json(200, { ok: false, error: e?.message ?? "Erro ao processar a URL" });
  }
});
