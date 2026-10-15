// Naiki AI — backend untuk chat dan roadmap.
// Berjalan sebagai Vercel Function di alamat /api/naiki.
// API key HANYA dibaca dari Environment Variables di server, tidak pernah dikirim ke browser.
//
// Environment Variables:
//   GEMINI_API_KEY      API key Google Gemini (disarankan, ada kuota gratis)
//   GEMINI_MODEL        opsional, default "gemini-3.6-flash"
//   ANTHROPIC_API_KEY   alternatif: API key Claude dari Anthropic
//   ANTHROPIC_MODEL     opsional, default "claude-haiku-5-5"
//   AI_PROVIDER         opsional: "gemini" atau "anthropic" (default: yang key-nya terisi)
//   ALLOWED_ORIGIN      opsional: contoh "https://naiki-ai.vercel.app" agar API hanya bisa dipakai dari situs itu
//   RATE_LIMIT          opsional: jumlah permintaan per pengunjung per 10 menit (default 30)

const MAX_TURNS = 12;
const MAX_CHARS = 1500;
const WINDOW_MS = 10 * 60 * 1000;
const hits = new Map(); // batas permintaan sederhana per IP (per instance server)

function provider() {
  const want = (process.env.AI_PROVIDER || "").toLowerCase();
  if (want === "anthropic" && process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (want === "gemini" && process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return null;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
function fail(code, message, status) {
  return json({ error: { code, message } }, status);
}

function clip(v, n) {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
}

function rateLimited(request) {
  const limit = Number(process.env.RATE_LIMIT) || 30;
  const ip = (request.headers.get("x-forwarded-for") || "anon").split(",")[0].trim();
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > limit;
}

// ---------- prompt ----------
function chatSystem(ctx) {
  const c = ctx && typeof ctx === "object" ? ctx : {};
  const scores = c.scores && typeof c.scores === "object"
    ? "RIASEC".split("").map((k) => `${k} ${Math.round(Number(c.scores[k]) || 0)}`).join(", ")
    : "belum ada";
  return `Kamu adalah Naiki, AI Career Companion untuk siswa SMA/SMK di Indonesia. Jawab dalam Bahasa Indonesia yang hangat dan santai tapi sopan (panggil "kamu"), ringkas (maksimal sekitar 150 kata), dan praktis.
Konteks siswa: nama ${clip(c.name, 40) || "siswa"}, kelas ${clip(c.kelas, 20) || "-"}. Kode minat RIASEC ${clip(c.code, 4) || "-"} dengan skor ${scores}. Target karier: ${clip(c.target, 60) || "belum dipilih"} (jurusan terkait: ${clip(c.majors, 160) || "-"}). Progres roadmap ${Math.round(Number(c.progress) || 0)}%.
Bahas jurusan kuliah, jalur masuk PTN (SNBP, SNBT, mandiri), skill, dan langkah konkret yang bisa dilakukan minggu ini. Jangan mengarang tanggal pendaftaran, biaya, atau kuota pasti; sarankan mengecek situs resmi. Jika siswa membahas masalah pribadi yang berat, kesehatan mental, atau keselamatan, tanggapi dengan empati dan sarankan bicara dengan Guru BK atau orang dewasa yang dipercaya.
Tetap pada topik pendidikan, minat, dan karier. Jika diminta hal di luar itu, arahkan kembali dengan sopan.
Format: paragraf pendek; boleh daftar dengan "- " dan **tebal** seperlunya. Jangan pakai judul.`;
}

function roadmapPrompt(b) {
  const career = clip(b.career, 60);
  const scores = b.scores && typeof b.scores === "object"
    ? "RIASEC".split("").map((k) => `${k} ${Math.round(Number(b.scores[k]) || 0)}`).join(", ")
    : "-";
  return `Susun roadmap karier untuk siswa SMA kelas XI di Indonesia yang menargetkan profesi "${career}". Kode minat RIASEC siswa: ${clip(b.code, 4)} (skor ${scores}). Jurusan terkait: ${clip(b.majors, 160)}.
Balas HANYA dengan JSON array berisi tepat 5 tahap, urut dari sekarang sampai karier awal: kelas XI, kelas XII, seleksi masuk PTN (SNBP, SNBT, atau mandiri), masa kuliah, dan karier awal.
Bentuk tiap tahap: {"title": string pendek, "period": string pendek, "tasks": [3 string]}. Setiap task adalah satu kalimat aksi konkret dalam Bahasa Indonesia, maksimal 14 kata, spesifik untuk ${career}. Jangan sebut tanggal atau biaya pasti. Jangan tulis teks lain di luar JSON.
Contoh satu tahap: {"title":"Kelas XI","period":"Semester 3–4","tasks":["...","...","..."]}`;
}

// Gabungkan giliran berurutan dengan peran sama, dan pastikan mulai & berakhir di "user".
function normalize(messages) {
  const out = [];
  for (const m of Array.isArray(messages) ? messages.slice(-MAX_TURNS) : []) {
    if (!m || (m.role !== "user" && m.role !== "assistant")) continue;
    const text = String(m.content ?? "").trim().slice(0, MAX_CHARS);
    if (!text) continue;
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.content += "\n\n" + text;
    else out.push({ role: m.role, content: text });
  }
  while (out.length && out[0].role !== "user") out.shift();
  while (out.length && out[out.length - 1].role !== "user") out.pop();
  return out;
}

// ---------- penyedia AI ----------
class UpstreamError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

async function callGemini(system, messages, { json: wantJson, maxTokens }) {
  const model = process.env.GEMINI_MODEL || "gemini-3.6-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
    generationConfig: { maxOutputTokens: maxTokens, ...(wantJson ? { responseMimeType: "application/json" } : {}) },
  };
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    console.error("Gemini error", r.status, JSON.stringify(data).slice(0, 500));
    if (r.status === 429) throw new UpstreamError("rate_limited", "Kuota AI sedang habis.");
    throw new UpstreamError("upstream", (data.error && data.error.message) || `Gemini HTTP ${r.status}`);
  }
  if (data.promptFeedback && data.promptFeedback.blockReason) throw new UpstreamError("refused", "Diblokir filter keamanan.");
  const cand = (data.candidates || [])[0] || {};
  const text = ((cand.content && cand.content.parts) || []).filter((p) => p.text && !p.thought).map((p) => p.text).join("").trim();
  if (!text) {
    if (cand.finishReason === "SAFETY" || cand.finishReason === "PROHIBITED_CONTENT") throw new UpstreamError("refused", "Diblokir filter keamanan.");
    throw new UpstreamError("empty", "AI tidak memberi jawaban.");
  }
  return { text, truncated: cand.finishReason === "MAX_TOKENS" };
}

async function callAnthropic(system, messages, { maxTokens }) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-haiku-5-5",
      max_tokens: maxTokens,
      system,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    console.error("Anthropic error", r.status, JSON.stringify(data).slice(0, 500));
    if (r.status === 429 || r.status === 529) throw new UpstreamError("rate_limited", "Kuota AI sedang habis.");
    throw new UpstreamError("upstream", (data.error && data.error.message) || `Anthropic HTTP ${r.status}`);
  }
  if (data.stop_reason === "refusal") throw new UpstreamError("refused", "Permintaan ditolak.");
  const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
  if (!text) throw new UpstreamError("empty", "AI tidak memberi jawaban.");
  return { text, truncated: data.stop_reason === "max_tokens" };
}

function ask(system, messages, opts) {
  return provider() === "anthropic" ? callAnthropic(system, messages, opts) : callGemini(system, messages, opts);
}

// Ambil JSON array dari jawaban AI, walau dibungkus ``` atau ada kalimat tambahan.
function parsePhases(text) {
  let s = text.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1];
  let v;
  try { v = JSON.parse(s); } catch {
    const a = s.indexOf("["), b = s.lastIndexOf("]");
    if (a < 0 || b <= a) return null;
    try { v = JSON.parse(s.slice(a, b + 1)); } catch { return null; }
  }
  if (v && !Array.isArray(v) && Array.isArray(v.phases)) v = v.phases;
  if (!Array.isArray(v)) return null;
  const phases = v
    .filter((p) => p && p.title && Array.isArray(p.tasks))
    .slice(0, 6)
    .map((p) => ({
      title: clip(p.title, 60),
      period: clip(p.period, 60),
      tasks: p.tasks.map((t) => clip(t, 160)).filter(Boolean).slice(0, 4),
    }))
    .filter((p) => p.tasks.length);
  return phases.length >= 3 ? phases : null;
}

// ---------- handler ----------
export default {
  async fetch(request) {
    const allowed = process.env.ALLOWED_ORIGIN;
    const origin = request.headers.get("origin");
    if (allowed && origin && origin !== allowed) return fail("forbidden", "Asal permintaan tidak diizinkan.", 403);

    if (request.method === "GET") return json({ ready: !!provider(), provider: provider() });
    if (request.method !== "POST") return fail("bad_request", "Gunakan GET atau POST.", 405);
    if (!provider()) return fail("no_key", "API key belum diatur di Environment Variables.", 503);
    if (rateLimited(request)) return fail("rate_limited", "Terlalu banyak permintaan. Coba lagi beberapa menit lagi.", 429);

    let body;
    try { body = await request.json(); } catch { return fail("bad_request", "Format permintaan tidak valid.", 400); }
    if (!body || typeof body !== "object") return fail("bad_request", "Format permintaan tidak valid.", 400);

    try {
      if (body.task === "chat") {
        const messages = normalize(body.messages);
        if (!messages.length) return fail("bad_request", "Pesan kosong.", 400);
        const r = await ask(chatSystem(body.context), messages, { maxTokens: 1500 });
        return json({ text: r.text, truncated: r.truncated });
      }
      if (body.task === "roadmap") {
        if (!clip(body.career, 60)) return fail("bad_request", "Profesi target kosong.", 400);
        const system = "Kamu menyusun roadmap karier untuk siswa SMA di Indonesia. Balas hanya dengan JSON yang valid.";
        const r = await ask(system, [{ role: "user", content: roadmapPrompt(body) }], { json: true, maxTokens: 3000 });
        const phases = parsePhases(r.text);
        if (!phases) return fail("invalid_json", "AI gagal menyusun format roadmap.", 502);
        return json({ phases });
      }
      return fail("bad_request", "Tugas tidak dikenal.", 400);
    } catch (e) {
      if (e instanceof UpstreamError) {
        const status = e.code === "rate_limited" ? 429 : e.code === "refused" ? 422 : 502;
        return fail(e.code, e.message, status);
      }
      console.error(e);
      return fail("upstream", "Gagal menghubungi layanan AI.", 502);
    }
  },
};
