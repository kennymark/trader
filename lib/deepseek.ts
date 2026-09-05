const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";

export function isDeepSeekEnabled() {
  return Boolean(process.env.DEEPSEEK_API_KEY?.trim());
}

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export async function deepseekChat(
  messages: ChatMessage[],
  opts?: { temperature?: number; maxTokens?: number; json?: boolean },
): Promise<string | null> {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) return null;

  const res = await fetch(DEEPSEEK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages,
      temperature: opts?.temperature ?? 0.35,
      max_tokens: opts?.maxTokens ?? 220,
      ...(opts?.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(`DeepSeek error ${res.status}: ${text.slice(0, 200)}`);
    return null;
  }

  const body = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return body.choices?.[0]?.message?.content?.trim() || null;
}
