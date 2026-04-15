/**
 * Optional call to Google Gemini generateContent (fail-soft; never log API key).
 */

export interface GeminiGenerateResult {
  ok: boolean;
  text: string;
  errorCode?: string;
}

const DEFAULT_MODEL = "gemini-2.0-flash";

export function getGeminiModel(): string {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
}

/**
 * Sends `prompt` to Gemini REST API. Returns markdown-safe text for `gemini_response.md`.
 */
export async function fetchGeminiResearchReply(
  apiKey: string,
  prompt: string
): Promise<GeminiGenerateResult> {
  const model = getGeminiModel();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    });

    const raw = await res.text();
    if (!res.ok) {
      return {
        ok: false,
        text: [
          `# Gemini API error`,
          ``,
          `HTTP ${res.status}`,
          ``,
          "```",
          raw.slice(0, 4000),
          "```",
          ``,
          `Check API key, quota, and GEMINI_MODEL (${model}). Trial outputs are otherwise complete.`,
        ].join("\n"),
        errorCode: String(res.status),
      };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return {
        ok: false,
        text: `Could not parse Gemini JSON response.\n\n\`\`\`\n${raw.slice(0, 2000)}\n\`\`\``,
        errorCode: "parse",
      };
    }

    const obj = parsed as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      error?: { message?: string };
    };
    if (obj.error?.message) {
      return {
        ok: false,
        text: `Gemini error: ${obj.error.message}`,
        errorCode: "api_error",
      };
    }
    const text =
      obj.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ??
      "";
    if (!text.trim()) {
      return {
        ok: false,
        text: `Empty reply from Gemini.\n\n\`\`\`json\n${raw.slice(0, 2000)}\n\`\`\``,
        errorCode: "empty",
      };
    }
    return { ok: true, text };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      text: [
        `# Gemini request failed`,
        ``,
        msg,
        ``,
        `Network or TLS issue, or fetch not available. Trial outputs are otherwise complete.`,
      ].join("\n"),
      errorCode: "network",
    };
  }
}

export function formatGeminiResponseMarkdown(
  result: GeminiGenerateResult,
  model: string
): string {
  const header = [
    `# Gemini response`,
    ``,
    `_Model: ${model} · generated at ${new Date().toISOString()}_`,
    ``,
    result.ok ? "" : `_Status: error (${result.errorCode ?? "unknown"})_`,
    ``,
    "---",
    ``,
  ]
    .filter(Boolean)
    .join("\n");

  return header + result.text;
}
