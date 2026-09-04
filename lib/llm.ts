import Anthropic from "@anthropic-ai/sdk";
import { CHAT_TOOLS, runChatTool } from "./chatTools";

export type LlmTurn = { role: "user" | "assistant"; content: string };

export type LlmProvider = "anthropic" | "deepseek";

/**
 * Which provider the deployment is configured for, or null when no key is set.
 * The chat surface is built and routed either way; without a key it says so
 * instead of failing at the point of asking.
 */
export function resolveProvider(): LlmProvider | null {
  if (process.env.ANTHROPIC_API_KEY?.trim()) return "anthropic";
  if (process.env.DEEPSEEK_API_KEY?.trim()) return "deepseek";
  return null;
}

export const PROVIDER_LABELS: Record<LlmProvider, string> = {
  anthropic: "Claude",
  deepseek: "DeepSeek",
};

const MAX_TOKENS = 4000;

/**
 * How many times the model may call tools before we make it answer. A question
 * like "how does Moderna compare to my worst position" is a search, a quote and
 * a fundamentals call, so the ceiling is generous; it exists to bound a loop,
 * not to ration lookups.
 */
const MAX_TOOL_ROUNDS = 8;

function toolResultText(value: string): string {
  // Keep a runaway upstream response from eating the context window.
  return value.length > 4000 ? `${value.slice(0, 4000)}\n…truncated` : value;
}

// --- Anthropic -------------------------------------------------------------

function anthropicTools(): Anthropic.Tool[] {
  return CHAT_TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters as unknown as Anthropic.Tool.InputSchema,
  }));
}

async function askAnthropic(system: string, turns: LlmTurn[]): Promise<string> {
  const client = new Anthropic();
  const messages: Anthropic.MessageParam[] = turns.map((t) => ({
    role: t.role,
    content: t.content,
  }));

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    // Streaming keeps a long answer from running into the request timeout; the
    // caller wants one string, so the SDK assembles the final message.
    const stream = client.messages.stream({
      model: "claude-opus-5",
      max_tokens: MAX_TOKENS,
      thinking: { type: "adaptive" },
      // The portfolio brief is the bulk of the request and is identical across
      // the questions asked in one sitting, so it is worth caching.
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      tools: anthropicTools(),
      messages,
    });

    const message = await stream.finalMessage();

    if (message.stop_reason === "refusal") {
      throw new Error("The model declined to answer that.");
    }

    const toolUses = message.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );

    if (message.stop_reason !== "tool_use" || toolUses.length === 0) {
      const text = message.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("")
        .trim();
      if (!text) throw new Error("The model returned an empty answer.");
      return text;
    }

    messages.push({ role: "assistant", content: message.content });

    // Parallel calls come back in one turn and their results must go back in
    // one user message, or the model learns to stop batching them.
    const results: Anthropic.ToolResultBlockParam[] = await Promise.all(
      toolUses.map(async (use) => ({
        type: "tool_result" as const,
        tool_use_id: use.id,
        content: toolResultText(
          await runChatTool(use.name, (use.input ?? {}) as Record<string, unknown>),
        ),
      })),
    );

    messages.push({ role: "user", content: results });
  }

  throw new Error("Gave up after too many lookups without an answer.");
}

// --- DeepSeek (OpenAI-shaped) ---------------------------------------------

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";

type OpenAiMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
};

async function deepseekTurn(messages: OpenAiMessage[]): Promise<OpenAiMessage> {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) throw new Error("No model configured.");

  const res = await fetch(DEEPSEEK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages,
      temperature: 0.2,
      max_tokens: MAX_TOKENS,
      tools: CHAT_TOOLS.map((t) => ({
        type: "function",
        function: { name: t.name, description: t.description, parameters: t.parameters },
      })),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`DeepSeek error ${res.status}: ${body.slice(0, 200)}`);
  }

  const json = (await res.json()) as { choices?: Array<{ message?: OpenAiMessage }> };
  const message = json.choices?.[0]?.message;
  if (!message) throw new Error("DeepSeek returned no message.");
  return message;
}

async function askDeepSeek(system: string, turns: LlmTurn[]): Promise<string> {
  const messages: OpenAiMessage[] = [
    { role: "system", content: system },
    ...turns.map((t) => ({ role: t.role, content: t.content })),
  ];

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const message = await deepseekTurn(messages);
    const calls = message.tool_calls ?? [];

    if (calls.length === 0) {
      const text = (message.content || "").trim();
      if (!text) throw new Error("DeepSeek returned an empty answer.");
      return text;
    }

    messages.push(message);
    for (const call of calls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>;
      } catch {
        // Malformed arguments are the model's problem to correct, not a crash.
        args = {};
      }
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: toolResultText(await runChatTool(call.function.name, args)),
      });
    }
  }

  throw new Error("Gave up after too many lookups without an answer.");
}

export async function askLlm(system: string, turns: LlmTurn[]): Promise<string> {
  const provider = resolveProvider();
  if (!provider) throw new Error("No model configured.");
  return provider === "anthropic" ? askAnthropic(system, turns) : askDeepSeek(system, turns);
}
