// ─────────────────────────────────────────────────────────────────────────────
//  /api/chat  —  Serverless backend (runs on Vercel)
//
//  Why this exists:
//   1. It keeps your GEMINI_API_KEY SECRET. The key lives here on the server,
//      never in the browser, so visitors can't steal it.
//   2. It saves every question + answer to your Supabase database.
//
//  The browser sends:  { messages: [...], mode: "chat" | "analysis", sessionId }
//  We return:          { text: "..." }
// ─────────────────────────────────────────────────────────────────────────────

const ADVISOR_SYSTEM = `أنت مستشار أعمال استراتيجي خبير اسمك "فكرة". تتحدث بالعربية دائماً.
شخصيتك: ذكي، مباشر، يطرح أسئلة حادة، يكتشف نقاط الضعف، يقترح تحسينات غير متوقعة.
أسلوبك: جمل قصيرة، أسئلة محددة، لا حشو. مثل مستشار McKinsey لكن بالعربي.
بعد كل رد، اطرح سؤالاً واحداً فقط يعمّق الفكرة أو يكشف ثغرة.
لا تكتب قوائم طويلة — حوار طبيعي وذكي.`;

const ANALYSIS_SYSTEM = `You are a strategic analyst. Analyze the idea using web search.
RETURN ONLY valid JSON, no markdown, no extra text.
JSON structure:
{"title":"X","summary":{"description":"X","type":"X","potential":"high","potentialLabel":"عالي"},"market":{"size":"X","trend":"X","saudiContext":"X","targetAudience":"X","insights":["X","X","X"]},"competitors":[{"name":"X","strength":"X","weakness":"X","type":"مباشر"}],"opportunities":[{"title":"X","description":"X","revenue":"X","priority":"high"},{"title":"X","description":"X","revenue":"X","priority":"medium"}],"risks":[{"title":"X","description":"X","mitigation":"X","level":"high"},{"title":"X","description":"X","mitigation":"X","level":"medium"}],"plan":{"phase1":{"title":"المرحلة الأولى (0-3 أشهر)","steps":["X","X","X"]},"phase2":{"title":"المرحلة الثانية (3-6 أشهر)","steps":["X","X","X"]},"phase3":{"title":"المرحلة الثالثة (6-12 شهر)","steps":["X","X","X"]},"kpis":["X","X","X"]},"mindmap":{"center":"X","branches":[{"label":"السوق","children":["X","X"]},{"label":"المنافسة","children":["X","X"]},{"label":"الفرص","children":["X","X"]},{"label":"التحديات","children":["X","X"]},{"label":"التقنية","children":["X","X"]}]},"script":{"hook":"X","problem":"X","solution":"X","proof":"X","cta":"X","storyboard":[{"scene":1,"visual":"X","text":"X","duration":3},{"scene":2,"visual":"X","text":"X","duration":4},{"scene":3,"visual":"X","text":"X","duration":3},{"scene":4,"visual":"X","text":"X","duration":4},{"scene":5,"visual":"X","text":"X","duration":3}]}}
All values in Arabic. Keep each string under 120 chars.`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

  if (!GEMINI_KEY) {
    return res
      .status(500)
      .json({ error: "الخادم لم يُضبط: GEMINI_API_KEY مفقود" });
  }

  try {
    const { messages = [], mode = "chat", sessionId = null } = req.body || {};
    const system = mode === "analysis" ? ANALYSIS_SYSTEM : ADVISOR_SYSTEM;

    // Convert our {role, content} messages into Gemini's format.
    // Gemini uses "user" and "model" (instead of "assistant").
    const contents = messages
      .filter((m) => m && m.content)
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: String(m.content) }],
      }));

    const body = {
      system_instruction: { parts: [{ text: system }] },
      contents,
      generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
    };

    // Only the deep "analysis" mode uses live web search (Google grounding).
    if (mode === "analysis") {
      body.tools = [{ google_search: {} }];
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_KEY}`;
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await r.json();
    if (!r.ok) {
      return res
        .status(500)
        .json({ error: data?.error?.message || "خطأ في خدمة الذكاء الاصطناعي" });
    }

    const text = (data?.candidates?.[0]?.content?.parts || [])
      .map((p) => p.text || "")
      .join("\n")
      .trim();

    // ── Save the Q&A to Supabase (does not block the user's reply) ──
    if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
      const lastUser = [...messages].reverse().find((m) => m.role === "user");
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/conversations`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
            Prefer: "return=minimal",
          },
          body: JSON.stringify({
            mode,
            question: lastUser?.content || "",
            answer: text,
            session_id: sessionId,
          }),
        });
      } catch (e) {
        // If logging fails we still return the answer to the user.
        console.error("Supabase save failed:", e);
      }
    }

    return res.status(200).json({ text });
  } catch (err) {
    return res.status(500).json({ error: err.message || "خطأ غير متوقع" });
  }
}
