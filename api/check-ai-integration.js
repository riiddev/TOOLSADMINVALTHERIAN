module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "GET only" });
  }
  const models = ["inclusionai/ling-3.0-flash-sante-free", "reflection/beam-free"];
  const question = {
    id: "smoke-1",
    number: 1,
    prompt: "Berapakah 25 persen dari 80?",
    options: ["10", "15", "20", "25"],
    existingAnswer: null,
    existingAnswerOrigin: "",
    providedExplanation: ""
  };
  const failures = [];
  for (const model of models) {
    try {
      const { getVercelOidcToken } = await import("@vercel/oidc");
      const token = await getVercelOidcToken({ project: "toolsadminvaltherian", team: "thoodev" });
      const response = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json", "X-Title": "Bank JSON Studio smoke test" },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: "Jawab hanya JSON valid dengan shape {\"correctAnswer\":2,\"explanation\":\"...\"}. correctAnswer zero-based 0=A, 1=B, 2=C, 3=D. Hitung soal dengan teliti dan jelaskan dalam Bahasa Indonesia." },
            { role: "user", content: JSON.stringify(question) }
          ],
          temperature: 0,
          max_tokens: 300
        }),
        signal: AbortSignal.timeout(25000)
      });
      const text = await response.text();
      if (!response.ok) { failures.push({ model, status: response.status, body: text.slice(0, 500) }); continue; }
      const envelope = JSON.parse(text);
      const content = envelope.choices && envelope.choices[0] && envelope.choices[0].message && envelope.choices[0].message.content;
      if (typeof content !== "string") continue;
      let jsonText = content.trim();
      if (!jsonText.startsWith("{")) {
        const start = jsonText.indexOf("{");
        const end = jsonText.lastIndexOf("}");
        if (start < 0 || end <= start) continue;
        jsonText = jsonText.slice(start, end + 1);
      }
      const output = JSON.parse(jsonText);
      return res.status(200).json({
        ok: !!output && output.correctAnswer === 2 && typeof output.explanation === "string" && output.explanation.length > 10,
        model,
        answer: output && output.correctAnswer,
        explanationLength: output && output.explanation ? output.explanation.length : 0
      });
    } catch (error) { failures.push({ model, error: String(error && error.message || error).slice(0, 300) }); }
  }
  return res.status(502).json({ ok: false, error: "The free model smoke test failed.", failures });
};
module.exports.config = { maxDuration: 35 };
