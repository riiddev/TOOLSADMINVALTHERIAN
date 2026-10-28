const rateBuckets = new Map();

function send(res, status, body) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(body);
}

function normaliseAnswer(value) {
  if (Number.isInteger(value) && value >= 0 && value <= 3) return value;
  if (typeof value === "string") {
    const answer = value.trim().toUpperCase();
    if (/^[A-D]$/.test(answer)) return answer.charCodeAt(0) - 65;
  }
  return null;
}

function parseModelJSON(content) {
  if (Array.isArray(content)) {
    content = content.map(function (part) {
      return typeof part === "string" ? part : (part && part.text) || "";
    }).join("\n");
  }
  if (typeof content !== "string") throw new Error("Respons model tidak berisi teks.");
  var text = content.trim();
  try { return JSON.parse(text); } catch (_) {}
  var start = text.indexOf("{");
  var end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
  throw new Error("Respons model bukan JSON yang valid.");
}

function buildPrompt(questions) {
  var instructions = [
    "Kamu tutor UTBK yang teliti dan berbahasa Indonesia. Tugasmu menjawab setiap soal pilihan ganda dan menulis pembahasan yang benar-benar spesifik serta berguna untuk belajar.",
    "Selesaikan setiap soal secara mandiri berdasarkan prompt, stimulus, teks bacaan, data, tabel, rumus, dan empat opsinya. Jangan sekadar menyalin kunci yang diberikan. Jangan mengarang informasi yang tidak tersedia.",
    "Indeks jawaban harus zero-based: 0=A, 1=B, 2=C, 3=D. correctAnswer harus salah satu bilangan 0,1,2,3. Pakai null hanya jika soal benar-benar terpotong, stimulus penting hilang, format rusak, ambigu, atau tidak ada jawaban yang tepat.",
    "Pembahasan harus spesifik untuk soal itu. Matematika: tampilkan langkah, rumus dan perhitungan. Literasi: sebutkan bukti atau petunjuk dari teks yang diberikan. Penalaran: jelaskan hubungan logisnya. Pengetahuan konsep: jelaskan konsep yang mengarah ke pilihan tersebut. Jangan menulis pembahasan generik.",
    "Kunci lama dan pembahasan yang disertakan hanya bahan pembanding, bukan kebenaran mutlak. Jika berbeda dengan hasil pemecahanmu, pilih hasil yang menurutmu benar dan catat perbedaan itu di note.",
    "confidence harus high, medium, atau low. needsReview=true jika soal ambigu, stimulus hilang, pilihan bermasalah, atau confidence rendah. Jangan mengarang kepastian.",
    "Balas hanya JSON valid dengan struktur: {\"results\":[{\"id\":\"id-soal\",\"correctAnswer\":2,\"explanation\":\"pembahasan langkah demi langkah\",\"confidence\":\"high\",\"needsReview\":false,\"note\":\"catatan opsional\"}]}. Harus ada satu result untuk setiap id yang diberikan, urut sama. Tanpa markdown atau teks lain."
  ].join("\n");
  return instructions + "\n\nDATA SOAL:\n" + JSON.stringify({ questions: questions });
}

function requestIsAllowed(req, res) {
  var origin = req.headers.origin;
  var host = req.headers.host;
  if (!origin || !host) return true;
  try {
    var originURL = new URL(origin);
    if (originURL.host !== host) {
      send(res, 403, { ok: false, error: "Permintaan lintas situs tidak diizinkan." });
      return false;
    }
    return true;
  } catch (_) {
    send(res, 403, { ok: false, error: "Origin permintaan tidak valid." });
    return false;
  }
}

function checkRateLimit(req) {
  var forwarded = req.headers["x-forwarded-for"];
  var ip = typeof forwarded === "string" ? forwarded.split(",")[0].trim() : "unknown";
  var now = Date.now();
  var current = rateBuckets.get(ip);
  if (!current || now - current.start > 60000) {
    rateBuckets.set(ip, { start: now, count: 1 });
    return true;
  }
  current.count += 1;
  return current.count <= 20;
}

function normaliseQuestion(q, index) {
  return {
    id: String(q.id == null ? index : q.id).slice(0, 80),
    number: Number.isInteger(q.number) ? q.number : index + 1,
    prompt: q.prompt.trim(),
    options: q.options.map(function (option) { return String(option); }),
    existingAnswer: normaliseAnswer(q.existingAnswer),
    existingAnswerOrigin: String(q.existingAnswerOrigin || "").slice(0, 40),
    providedExplanation: String(q.providedExplanation || "").slice(0, 4500)
  };
}

module.exports = async function handler(req, res) {
  if (req.method === "GET") {
    return send(res, 200, {
      ok: true,
      service: "Bank JSON Studio AI",
      provider: "Pollinations anonymous inference",
      requiresApiKey: false,
      batchSize: 5,
      privacy: "Teks soal dikirim ke layanan AI pihak ketiga untuk dianalisis."
    });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return send(res, 405, { ok: false, error: "Metode tidak diizinkan." });
  }

  if (!requestIsAllowed(req, res)) return;
  if (!checkRateLimit(req)) {
    return send(res, 429, {
      ok: false,
      code: "RATE_LIMIT",
      error: "Batas permintaan gratis per menit tercapai. Tunggu sebentar lalu coba lagi."
    });
  }

  var body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (_) {
      return send(res, 400, { ok: false, error: "Isi permintaan harus berupa JSON." });
    }
  }
  var inputQuestions = body && body.questions;
  if (!Array.isArray(inputQuestions) || inputQuestions.length < 1 || inputQuestions.length > 5) {
    return send(res, 400, { ok: false, error: "Kirim 1 sampai 5 soal per permintaan." });
  }

  var questions = [];
  for (var i = 0; i < inputQuestions.length; i++) {
    var item = inputQuestions[i];
    if (!item || typeof item !== "object" || typeof item.prompt !== "string" ||
        !Array.isArray(item.options) || item.options.length !== 4) {
      return send(res, 400, {
        ok: false,
        error: "Setiap soal harus memiliki prompt dan tepat empat opsi.",
        question: i + 1
      });
    }
    if (item.prompt.length > 9000 || item.options.some(function (option) {
      return String(option).length > 2000;
    })) {
      return send(res, 413, {
        ok: false,
        error: "Teks soal atau opsi terlalu panjang. Pecah stimulus panjang menjadi beberapa bagian."
      });
    }
    questions.push(normaliseQuestion(item, i));
  }

  var userPrompt = buildPrompt(questions);
  var controller = new AbortController();
  var timeout = setTimeout(function () { controller.abort(); }, 50000);
  try {
    var response = await fetch("https://text.pollinations.ai/openai", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "X-Title": "Bank JSON Studio"
      },
      body: JSON.stringify({
        model: "openai",
        temperature: 0.1,
        max_tokens: Math.min(5000, 900 + questions.length * 850),
        stream: false,
        private: true,
        jsonMode: true,
        messages: [
          { role: "system", content: "Jawab sebagai tutor UTBK yang teliti. Hasilkan hanya JSON valid." },
          { role: "user", content: userPrompt }
        ]
      }),
      signal: controller.signal
    });

    var raw = await response.text();
    if (!response.ok) {
      var status = response.status === 429 ? 429 : 502;
      return send(res, status, {
        ok: false,
        code: response.status === 429 ? "PROVIDER_RATE_LIMIT" : "PROVIDER_ERROR",
        error: response.status === 429
          ? "Layanan AI gratis sedang membatasi permintaan. Tunggu sebentar lalu coba lagi."
          : "Layanan AI sedang tidak tersedia (HTTP " + response.status + "). Analisis lokal tetap tersedia."
      });
    }

    var envelope;
    try { envelope = JSON.parse(raw); } catch (_) {
      return send(res, 502, { ok: false, code: "INVALID_PROVIDER_RESPONSE", error: "Respons layanan AI tidak valid." });
    }
    var content = envelope && envelope.choices && envelope.choices[0] &&
      envelope.choices[0].message && envelope.choices[0].message.content;
    var parsed = parseModelJSON(content);
    var candidates = Array.isArray(parsed) ? parsed : parsed && Array.isArray(parsed.results) ? parsed.results : null;
    if (!candidates) {
      return send(res, 502, { ok: false, code: "INVALID_MODEL_OUTPUT", error: "Model tidak mengembalikan daftar hasil yang valid." });
    }

    var byId = new Map(candidates.map(function (candidate) { return [String(candidate.id), candidate]; }));
    var results = questions.map(function (question, index) {
      var candidate = byId.get(question.id) || candidates[index] || {};
      var answer = normaliseAnswer(candidate.correctAnswer);
      var explanation = typeof candidate.explanation === "string" ? candidate.explanation.trim().slice(0, 5000) : "";
      var confidence = ["high", "medium", "low"].indexOf(candidate.confidence) >= 0 ? candidate.confidence : "medium";
      return {
        id: question.id,
        correctAnswer: answer,
        explanation: explanation,
        confidence: confidence,
        needsReview: Boolean(candidate.needsReview) || answer === null || !explanation || confidence === "low",
        note: typeof candidate.note === "string" ? candidate.note.trim().slice(0, 600) : "",
        model: envelope.model || "openai"
      };
    });

    return send(res, 200, { ok: true, provider: "pollinations-anonymous", results: results });
  } catch (error) {
    var timedOut = error && error.name === "AbortError";
    return send(res, timedOut ? 504 : 502, {
      ok: false,
      code: timedOut ? "AI_TIMEOUT" : "AI_UNAVAILABLE",
      error: timedOut
        ? "Analisis AI terlalu lama. Coba lagi dengan lebih sedikit soal."
        : "Layanan AI gratis gagal dihubungi. Coba lagi beberapa saat."
    });
  } finally {
    clearTimeout(timeout);
  }
};

module.exports.config = { maxDuration: 60 };
