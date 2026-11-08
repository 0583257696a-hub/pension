import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type * as z from "zod/v4";
import { getConfig } from "../config";

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export class LlmRefusalError extends Error {
  constructor(readonly category: string | null) {
    super("הבקשה נדחתה על ידי מנגנוני הבטיחות של המודל");
  }
}

export class LlmNotConfiguredError extends Error {
  constructor() {
    super("Claude API לא הוגדר. יש להגדיר ANTHROPIC_API_KEY בסביבת השרת.");
  }
}

export type ChatMessage = Anthropic.Beta.BetaMessageParam;
export type ToolDefinition = Anthropic.Beta.BetaTool;

export interface StructuredRequest<T> {
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  effort?: Effort;
  maxTokens?: number;
}

export interface StreamTurnRequest {
  system: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  effort?: Effort;
  maxTokens?: number;
}

export interface StreamTurnResult {
  content: Anthropic.Beta.BetaContentBlock[];
  stopReason: string | null;
  model: string;
}

/** Narrow interface so tests can swap in a deterministic fake. */
export interface LlmClient {
  readonly model: string;
  structured<T>(request: StructuredRequest<T>): Promise<{ data: T; model: string; usage: unknown }>;
  streamTurn(request: StreamTurnRequest, onText: (delta: string) => void): Promise<StreamTurnResult>;
}

/**
 * Claude client for the academy. Defaults to Claude Opus 5.5 with adaptive
 * thinking (always on for this model) and server-side refusal fallbacks
 * ("default" routing), so a safety decline is retried on a fallback model
 * inside the same call instead of failing outright.
 */
export class AnthropicLlm implements LlmClient {
  private readonly client: Anthropic;
  readonly model: string;

  constructor(options: { apiKey?: string; model?: string } = {}) {
    this.client = options.apiKey ? new Anthropic({ apiKey: options.apiKey }) : new Anthropic();
    this.model = options.model ?? "claude-opus-5-5";
  }

  async structured<T>(request: StructuredRequest<T>) {
    const message = await this.client.beta.messages.parse({
      model: this.model,
      max_tokens: request.maxTokens ?? 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: request.system,
      output_config: { effort: request.effort ?? "high", format: betaZodOutputFormat(request.schema) },
      messages: [{ role: "user", content: request.prompt }],
    });
    if (message.stop_reason === "refusal") throw new LlmRefusalError(message.stop_details?.category ?? null);
    if (message.stop_reason === "max_tokens") throw new Error("תשובת המודל נקטעה (max_tokens). יש לצמצם את הבקשה.");
    if (!message.parsed_output) throw new Error("המודל לא החזיר פלט במבנה הנדרש");
    return { data: message.parsed_output as T, model: message.model, usage: message.usage };
  }

  async streamTurn(request: StreamTurnRequest, onText: (delta: string) => void): Promise<StreamTurnResult> {
    const stream = this.client.beta.messages.stream({
      model: this.model,
      max_tokens: request.maxTokens ?? 8000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: request.system,
      output_config: { effort: request.effort ?? "medium" },
      messages: request.messages,
      ...(request.tools?.length ? { tools: request.tools } : {}),
    });
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") onText(event.delta.text);
    }
    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal") throw new LlmRefusalError(final.stop_details?.category ?? null);
    return { content: final.content, stopReason: final.stop_reason, model: final.model };
  }
}

let override: LlmClient | null = null;

/** Test hook: route all AI calls through a fake client. */
export function setLlmForTests(client: LlmClient | null) {
  override = client;
}

export function getLlm(): LlmClient {
  if (override) return override;
  const config = getConfig().anthropic;
  if (!config.apiKey && !process.env.ANTHROPIC_AUTH_TOKEN) throw new LlmNotConfiguredError();
  return new AnthropicLlm({ apiKey: config.apiKey || undefined, model: config.model });
}

export function isLlmConfigured(): boolean {
  return !!override || !!getConfig().anthropic.apiKey || !!process.env.ANTHROPIC_AUTH_TOKEN;
}
