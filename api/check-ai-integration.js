module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "GET only" });
  }
  try {
    const host = req.headers.host;
    const response = await fetch("https://" + host + "/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json", "X-Title": "Bank JSON Studio integration smoke test" },
      body: JSON.stringify({
        questions: [{
          id: "smoke-1",
          number: 1,
          prompt: "Berapakah 25 persen dari 80?",
          options: ["10", "15", "20", "25"],
          existingAnswer: null,
          existingAnswerOrigin: "",
          providedExplanation: ""
        }]
      }),
      signal: AbortSignal.timeout(55000)
    });
    const body = await response.json();
    const result = body && body.results && body.results[0];
    return res.status(200).json({
      ok: response.ok && !!body.ok && !!result && result.correctAnswer === 2 && typeof result.explanation === "string" && result.explanation.length > 10,
      status: response.status,
      provider: body.provider || null,
      error: body.error || null,
      result: result ? {
        answer: result.correctAnswer,
        explanation: result.explanation,
        confidence: result.confidence,
        needsReview: result.needsReview,
        model: result.model
      } : null
    });
  } catch (error) {
    return res.status(200).json({ ok: false, error: String(error && error.message || error).slice(0, 500) });
  }
};
module.exports.config = { maxDuration: 60 };
