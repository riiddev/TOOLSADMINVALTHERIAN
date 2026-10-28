module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "GET only" });
  }
  try {
    const response = await fetch("https://text.pollinations.ai/openai", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({
        model: "openai",
        temperature: 0,
        max_tokens: 250,
        stream: false,
        messages: [
          { role: "system", content: "You are a careful Indonesian UTBK tutor. Reply only valid JSON with fields correctAnswer (zero based) and explanation. CorrectAnswer must be an integer from 0=A through 3=D." },
          { role: "user", content: "Berapakah 25 persen dari 80? A. 10 B. 15 C. 20 D. 25. Berikan jawaban benar dan pembahasan dalam Bahasa Indonesia." }
        ]
      }),
      signal: AbortSignal.timeout(25000)
    });
    const body = await response.text();
    return res.status(200).json({
      ok: response.ok,
      status: response.status,
      contentType: response.headers.get("content-type"),
      sample: body.slice(0, 1400)
    });
  } catch (error) {
    return res.status(200).json({ ok: false, error: String(error && error.message || error).slice(0, 400) });
  }
};
module.exports.config = { maxDuration: 35 };
