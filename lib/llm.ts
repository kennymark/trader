import Anthropic from "@anthropic-ai/sdk";
import { deepseekChat } from "./deepseek";

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

async function askAnthropic(system: string, turns: LlmTurn[]): Promise<string> {
  const client = new Anthropic();

  // Streaming keeps a long answer from running into the request timeout; the
  // caller wants one string, so the SDK assembles the final message.
  const stream = client.messages.stream({
    model: "claude-opus-5",
    max_tokens: MAX_TOKENS,
    thinking: { type: "adaptive" },
    // The portfolio brief is the bulk of the request and is identical across
    // the questions asked in one sitting, so it is worth caching.
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: turns.map((t) => ({ role: t.role, content: t.content })),
  });

  const message = await stream.finalMessage();

  if (message.stop_reason === "refusal") {
    throw new Error("The model declined to answer that.");
  }

  const text = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();

  if (!text) throw new Error("The model returned an empty answer.");
  return text;
}

async function askDeepSeek(system: string, turns: LlmTurn[]): Promise<string> {
  const text = await deepseekChat(
    [{ role: "system", content: system }, ...turns],
    { maxTokens: MAX_TOKENS, temperature: 0.2 },
  );
  if (!text) throw new Error("DeepSeek returned no answer.");
  return text;
}

export async function askLlm(system: string, turns: LlmTurn[]): Promise<string> {
  const provider = resolveProvider();
  if (!provider) throw new Error("No model configured.");
  return provider === "anthropic" ? askAnthropic(system, turns) : askDeepSeek(system, turns);
}
