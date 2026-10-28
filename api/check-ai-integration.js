module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "GET only" });
  }
  try {
    const prompt = "Solve this multiple choice question in Indonesian. Return only JSON: {\"correctAnswer\":2,\"explanation\":\"...\"}. correctAnswer is zero-based. Question: What is 25 percent of 80? Options: A=10, B=15, C=20, D=25.";
    const response = await fetch("https://text.pollinations.ai/" + encodeURIComponent(prompt), {
      method: "GET",
      headers: { "Accept": "application/json, text/plain" },
      signal: AbortSignal.timeout(25000)
    });
    const body = await response.text();
    return res.status(200).json({
      ok: response.ok,
      status: response.status,
      contentType: response.headers.get("content-type"),
      sample: body.slice(0, 1000)
    });
  } catch (error) {
    return res.status(200).json({ ok: false, error: String(error && error.message || error).slice(0, 400) });
  }
};
module.exports.config = { maxDuration: 35 };
