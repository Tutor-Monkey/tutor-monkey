import { describe, expect, it } from "vitest";
import {
  DEEPSEEK_BASE_URL,
  ANTHROPIC_BASE_URL,
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_MAX_TOKENS,
  DEFAULT_MODEL,
  WORKSHEET_PROVIDER_NAME,
  WorksheetProviderError,
  buildChatCompletionsPayload,
  buildChatCompletionsUrl,
  buildWorksheetSystemPrompt,
  buildWorksheetUserPrompt,
  mapHttpError,
  parseChatCompletion,
  parseWorksheetJsonContent,
  resolveAnthropicProviderConfig,
  resolveProviderConfig,
} from "./worksheetProviderCore";

const validEnv = {
  DEEPSEEK_API_KEY: "test-key-123",
};

describe("resolveProviderConfig", () => {
  it("resolves the fixed DeepSeek base URL and default model from just the key", () => {
    const config = resolveProviderConfig(validEnv);
    expect(config).toEqual({
      baseUrl: DEEPSEEK_BASE_URL,
      model: DEFAULT_MODEL,
      apiKey: "test-key-123",
    });
  });

  it("uses the official DeepSeek base URL, never a configured one", () => {
    const config = resolveProviderConfig({
      ...validEnv,
      // A stray base-url var must be ignored: the endpoint is fixed.
      SOME_BASE_URL: "https://evil.example.com",
    });
    expect(config.baseUrl).toBe(DEEPSEEK_BASE_URL);
  });

  it("honors an optional DEEPSEEK_MODEL override, trimmed", () => {
    const config = resolveProviderConfig({
      ...validEnv,
      DEEPSEEK_MODEL: "  deepseek-v4-pro  ",
    });
    expect(config.model).toBe("deepseek-v4-pro");
  });

  it("falls back to the default model when DEEPSEEK_MODEL is blank", () => {
    expect(resolveProviderConfig({ ...validEnv, DEEPSEEK_MODEL: "   " }).model).toBe(
      DEFAULT_MODEL,
    );
  });

  it("fails with MISSING_API_KEY when DEEPSEEK_API_KEY is absent", () => {
    try {
      resolveProviderConfig({});
    } catch (error) {
      expect(error).toBeInstanceOf(WorksheetProviderError);
      const providerError = error as WorksheetProviderError;
      expect(providerError.code).toBe("MISSING_API_KEY");
      expect(providerError.message).toContain("DEEPSEEK_API_KEY");
      expect(providerError.message).not.toContain("test-key");
    }
  });

  it("fails with MISSING_API_KEY when DEEPSEEK_API_KEY is blank", () => {
    expect(() =>
      resolveProviderConfig({ DEEPSEEK_API_KEY: "   " }),
    ).toThrowError(WorksheetProviderError);
  });

  it("never falls back to any other env key name", () => {
    const env = {
      OPENAI_API_KEY: "openai-key",
      ANTHROPIC_API_KEY: "anthropic-key",
      DEEPSEEK_MODEL: "deepseek-v4-flash",
    };
    expect(() => resolveProviderConfig(env)).toThrowError(/DEEPSEEK_API_KEY/);
  });
});

describe("resolveAnthropicProviderConfig", () => {
  it("uses the official Messages API base and temporary Sonnet default", () => {
    expect(resolveAnthropicProviderConfig({ ANTHROPIC_API_KEY: "test-anthropic-key" })).toEqual({
      baseUrl: ANTHROPIC_BASE_URL,
      model: DEFAULT_ANTHROPIC_MODEL,
      apiKey: "test-anthropic-key",
    });
  });

  it("honors the temporary model override and fails closed without its key", () => {
    expect(resolveAnthropicProviderConfig({ ANTHROPIC_API_KEY: "key", ANTHROPIC_MODEL: "  custom-model " }).model).toBe("custom-model");
    expect(() => resolveAnthropicProviderConfig({})).toThrowError(/ANTHROPIC_API_KEY/);
  });
});


describe("buildChatCompletionsUrl", () => {
  it("appends /chat/completions to the DeepSeek base URL", () => {
    expect(buildChatCompletionsUrl(DEEPSEEK_BASE_URL)).toBe(
      "https://api.deepseek.com/chat/completions",
    );
  });

  it("normalizes a trailing slash", () => {
    expect(buildChatCompletionsUrl("https://api.deepseek.com/")).toBe(
      "https://api.deepseek.com/chat/completions",
    );
  });

  it("uses an already-full endpoint as-is", () => {
    expect(
      buildChatCompletionsUrl("https://api.deepseek.com/chat/completions"),
    ).toBe("https://api.deepseek.com/chat/completions");
  });
});

describe("buildChatCompletionsPayload", () => {
  it("builds the OpenAI-style request body with the default model", () => {
    const payload = buildChatCompletionsPayload({
      model: DEFAULT_MODEL,
      systemPrompt: "system",
      userPrompt: "user",
    });
    expect(payload.model).toBe(DEFAULT_MODEL);
    expect(payload.messages).toEqual([
      { role: "system", content: "system" },
      { role: "user", content: "user" },
    ]);
    expect(payload.temperature).toBe(0.7);
    expect(payload.max_tokens).toBe(DEFAULT_MAX_TOKENS);
    expect(payload.response_format).toEqual({ type: "json_object" });
    expect(payload.stream).toBe(false);
  });

  it("honors explicit temperature and maxTokens", () => {
    const payload = buildChatCompletionsPayload({
      model: "m",
      systemPrompt: "s",
      userPrompt: "u",
      temperature: 0.2,
      maxTokens: 1000,
    });
    expect(payload.temperature).toBe(0.2);
    expect(payload.max_tokens).toBe(1000);
  });
});

describe("buildWorksheetSystemPrompt / buildWorksheetUserPrompt", () => {
  it("asks for strict JSON and names the schema keys", () => {
    const prompt = buildWorksheetSystemPrompt();
    expect(prompt).toContain("JSON");
    expect(prompt).toContain("multiple_choice");
    expect(prompt).toContain("answer_key");
  });

  it("embeds the source text and its character count without leaking", () => {
    const prompt = buildWorksheetUserPrompt("Hello world");
    expect(prompt).toContain("Hello world");
    expect(prompt).toContain("11 characters");
  });
});

describe("parseChatCompletion", () => {
  it("parses a valid OpenAI-style success body", () => {
    const parsed = parseChatCompletion({
      id: "cmpl-1",
      model: DEFAULT_MODEL,
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: '{"title":"T"}' },
          finish_reason: "stop",
        },
      ],
    });
    expect(parsed.content).toBe('{"title":"T"}');
    expect(parsed.model).toBe(DEFAULT_MODEL);
    expect(parsed.finishReason).toBe("stop");
  });

  it("tolerates a missing model and finish_reason", () => {
    const parsed = parseChatCompletion({
      choices: [{ message: { content: "ok" } }],
    });
    expect(parsed.content).toBe("ok");
    expect(parsed.model).toBeNull();
    expect(parsed.finishReason).toBeNull();
  });

  it("rejects null, missing choices, empty choices, and blank content", () => {
    const cases: unknown[] = [
      null,
      "nope",
      {},
      { choices: [] },
      { choices: "nope" },
      { choices: [{}] },
      { choices: [{ message: {} }] },
      { choices: [{ message: { content: "" } }] },
      { choices: [{ message: { content: "   " } }] },
    ];
    for (const body of cases) {
      expect(() => parseChatCompletion(body)).toThrowError(
        WorksheetProviderError,
      );
    }
  });

  it("only ever reports INVALID_RESPONSE for structural drift", () => {
    try {
      parseChatCompletion({ choices: [] });
    } catch (error) {
      const providerError = error as WorksheetProviderError;
      expect(providerError.code).toBe("INVALID_RESPONSE");
    }
  });
});

describe("parseWorksheetJsonContent", () => {
  it("accepts raw JSON and fenced JSON", () => {
    expect(parseWorksheetJsonContent('{"ok":true}')).toEqual({ ok: true });
    expect(parseWorksheetJsonContent("```json\n" + '{"ok":true}' + "\n```")).toEqual({ ok: true });
  });

  it("extracts a JSON object from brief surrounding model prose", () => {
    expect(parseWorksheetJsonContent('Here is the worksheet:\n{"ok":true}\n')).toEqual({ ok: true });
  });

  it("rejects content without a valid JSON object", () => {
    expect(() => parseWorksheetJsonContent("I cannot do that.")).toThrowError(WorksheetProviderError);
  });
});


describe("mapHttpError", () => {
  it("maps 401 and 402 to UPSTREAM_ERROR with the status", () => {
    const unauthorized = mapHttpError(401);
    expect(unauthorized.code).toBe("UPSTREAM_ERROR");
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.message).toContain("DEEPSEEK_API_KEY");

    expect(mapHttpError(402).code).toBe("UPSTREAM_ERROR");
  });

  it("maps 429 to RATE_LIMITED", () => {
    expect(mapHttpError(429).code).toBe("RATE_LIMITED");
    expect(mapHttpError(429).status).toBe(429);
  });

  it("maps 5xx and other statuses to UPSTREAM_ERROR", () => {
    expect(mapHttpError(500).code).toBe("UPSTREAM_ERROR");
    expect(mapHttpError(503).code).toBe("UPSTREAM_ERROR");
    expect(mapHttpError(400).code).toBe("UPSTREAM_ERROR");
    expect(mapHttpError(404).status).toBe(404);
  });

  it("never embeds the API key or source material in messages", () => {
    const message = mapHttpError(401).message;
    expect(message).not.toContain("sk-");
    expect(message).not.toContain("test-key");
    expect(message).not.toContain("deepseek-key");
  });
});

describe("WORKSHEET_PROVIDER_NAME", () => {
  it("labels the provider for provenance", () => {
    expect(WORKSHEET_PROVIDER_NAME).toBe("deepseek");
  });
});
