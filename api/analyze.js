const MODELS = [
  "inclusionai/ling-3.0-flash-sante-free",
  "reflection/beam-free"
];

function send(res, status, body) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.status(status).json(body);
}

function normaliseAnswer(value) {
  if (Number.isInteger(value) && value >= 0 && value <= 3) return value;
  if (typeof value === "string") {
    const text = value.trim().toUpperCase();
    if (/^[A-D]$/.test(text)) return text.charCodeAt(0) - 65;
  }
  return null;
}

function parseModelJSON(content) {
  if (Array.isArray(content)) {
    content = content.map(part => typeof part === "string" ? part : (part && part.text) || "").join("\n");
  }
  if (typeof content !== "string") throw new Error("Model response has no text content.");
  const text = content.trim();
  try { return JSON.parse(text); } catch (_) {}
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
  throw new Error("Model response is not valid JSON.");
}

function buildMessages(questions) {
  const system = [
    "Kamu adalah tutor UTBK yang teliti dan berbahasa Indonesia. Tugasmu menentukan jawaban paling tepat dari soal pilihan ganda dan menulis pembahasan yang bisa dipelajari siswa.",
    "Untuk SETIAP soal, selesaikan soal secara mandiri dari prompt, stimulus, dan empat opsi. Jangan sekadar mengulang kunci yang dikirim. Jika ada teks bacaan, tabel, data, atau stimulus di prompt, jadikan itu sumber utama; jangan mengarang konteks yang tidak tersedia.",
    "correctAnswer harus berupa indeks ZERO-BASED: 0 untuk A, 1 untuk B, 2 untuk C, 3 untuk D. Jika benar-benar tidak dapat dipastikan karena soal terpotong, stimulus hilang, opsi rusak, atau lebih dari satu jawaban sama-sama benar, gunakan null dan set needsReview=true. Jika bisa diselesaikan, pilih jawaban terbaik dan jelaskan.",
    "Tuliskan explanation dalam Bahasa Indonesia, dengan alasan spesifik untuk soal tersebut. Matematika: tampilkan rumus/perhitungan dan simpulan yang cocok dengan opsi. Verbal/literasi: tunjukkan petunjuk kata atau bukti pada teks yang tersedia dan mengapa opsi benar, lalu jelaskan kekeliruan utama pengecoh bila relevan. Pengetahuan umum: jelaskan konsep dan kaitannya ke opsi. Jangan memberi pembahasan generik yang hanya meminta pengguna melengkapi sendiri.",
    "Jika existingAnswer atau providedExplanation disertakan, gunakan sebagai informasi pembanding, BUKAN sebagai kebenaran mutlak. Jika tidak setuju dengan kunci yang ada, pilih jawaban hasil pemecahan mandiri dan jelaskan konflik pada note; pengguna akan menerima peringatan untuk memeriksanya.",
    "Jangan menyatakan yakin bila tidak yakin. confidence wajib high, medium, atau low. needsReview=true jika stimulus/format bermasalah, ambigu, atau confidence low. Penjelasan harus ringkas namun benar-benar membantu, umumnya 2-6 kalimat.",
    "Balas HANYA JSON valid dengan struktur persis {\"results\":[{\"id\":\"...\",\"correctAnswer\":0,\"explanation\":\"...\",\"confidence\":\"high\",\"needsReview\":false,\"note\":\"\"}]}. Sertakan satu hasil per id input, urut sesuai input. Tidak boleh ada markdown atau teks di luar JSON."
  ].join("\n");
  return [
    { role: "system", content: system },
    { role: "user", content: JSON.stringify({ questions }) }
  ];
}

module.exports = async function handler(req, res) {
  if (req.method === "GET") {
    return send(res, 200, {
      ok: true,
      service: "Bank JSON Studio AI",
      models: MODELS,
      authConfigured: Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN)
    });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return send(res, 405, { error: "Method not allowed." });
  }

  const origin = req.headers.origin;
  const host = req.headers.host;
  if (origin && host) {
    try {
      if (new URL(origin).host !== host) return send(res, 403, { error: "Cross-origin requests are not allowed." });
    } catch (_) {
      return send(res, 403, { error: "Invalid request origin." });
    }
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (_) { return send(res, 400, { error: "Request body must be JSON." }); }
  }
  const questions = body && body.questions;
  if (!Array.isArray(questions) || questions.length < 1 || questions.length > 5) {
    return send(res, 400, { error: "Send between 1 and 5 questions per request." });
  }

  const cleanQuestions = [];
  for (let index = 0; index < questions.length; index++) {
    const q = questions[index];
    if (!q || typeof q !== "object" || typeof q.prompt !== "string" || !Array.isArray(q.options) || q.options.length !== 4) {
      return send(res, 400, { error: "Every question needs a prompt and exactly four options.", question: index + 1 });
    }
    if (q.prompt.length > 12000 || q.options.some(option => String(option).length > 3000)) {
      return send(res, 413, { error: "A prompt or option is too long. Split or shorten the source text." });
    }
    cleanQuestions.push({
      id: String(q.id == null ? index : q.id).slice(0, 80),
      number: Number.isInteger(q.number) ? q.number : index + 1,
      prompt: q.prompt.trim(),
      options: q.options.map(option => String(option)),
      existingAnswer: normaliseAnswer(q.existingAnswer),
      existingAnswerOrigin: String(q.existingAnswerOrigin || "").slice(0, 40),
      providedExplanation: String(q.providedExplanation || "").slice(0, 5000)
    });
  }

  const apiKey = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN;
  if (!apiKey) {
    return send(res, 503, {
      error: "AI Gateway authentication is unavailable in this deployment.",
      code: "AI_AUTH_UNAVAILABLE"
    });
  }

  const messages = buildMessages(cleanQuestions);
  const failures = [];
  for (const model of MODELS) {
    try {
      const response = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + apiKey,
          "Content-Type": "application/json",
          "X-Title": "Bank JSON Studio"
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.1,
          max_tokens: 4500,
          stream: false
        }),
        signal: AbortSignal.timeout(48000)
      });

      const raw = await response.text();
      if (!response.ok) {
        failures.push({ model, status: response.status });
        continue;
      }

      const envelope = JSON.parse(raw);
      const content = envelope && envelope.choices && envelope.choices[0] &&
        envelope.choices[0].message && envelope.choices[0].message.content;
      const parsed = parseModelJSON(content);
      if (!parsed || !Array.isArray(parsed.results)) throw new Error("Model response is missing results.");

      const byId = new Map(parsed.results.map(result => [String(result.id), result]));
      const results = cleanQuestions.map((question, index) => {
        const candidate = byId.get(question.id) || parsed.results[index] || {};
        const answer = normaliseAnswer(candidate.correctAnswer);
        const explanation = typeof candidate.explanation === "string" ? candidate.explanation.trim().slice(0, 5000) : "";
        const confidence = ["high", "medium", "low"].includes(candidate.confidence) ? candidate.confidence : "medium";
        return {
          id: question.id,
          correctAnswer: answer,
          explanation,
          confidence,
          needsReview: Boolean(candidate.needsReview) || answer === null || !explanation || confidence === "low",
          note: typeof candidate.note === "string" ? candidate.note.trim().slice(0, 600) : "",
          model
        };
      });

      return send(res, 200, { ok: true, model, results });
    } catch (error) {
      failures.push({ model, reason: String(error && error.name === "TimeoutError" ? "timeout" : "invalid-response") });
    }
  }

  const rateLimited = failures.some(item => item.status === 429);
  return send(res, rateLimited ? 429 : 502, {
    error: rateLimited
      ? "Model gratis sedang mencapai batas permintaan. Coba lagi beberapa saat."
      : "Model AI belum dapat menyelesaikan permintaan. Coba lagi; analisis hitungan lokal tetap tersedia.",
    code: rateLimited ? "AI_RATE_LIMIT" : "AI_PROVIDER_ERROR"
  });
};

module.exports.config = { maxDuration: 60 };
