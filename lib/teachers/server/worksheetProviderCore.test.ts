import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAX_TOKENS,
  WORKSHEET_PROVIDER_NAME,
  WorksheetProviderError,
  buildChatCompletionsPayload,
  buildChatCompletionsUrl,
  buildWorksheetSystemPrompt,
  buildWorksheetUserPrompt,
  mapHttpError,
  parseChatCompletion,
  resolveProviderConfig,
} from "./worksheetProviderCore";

const validEnv = {
  OPENCODE_BASE_URL: "https://opencode.example.com/v1",
  OPENCODE_MODEL: "opencode-worksheet-v1",
  OPENCODE_API_KEY: "test-key-123",
};

describe("resolveProviderConfig", () => {
  it("resolves a fully configured env", () => {
    const config = resolveProviderConfig(validEnv);
    expect(config).toEqual({
      baseUrl: "https://opencode.example.com/v1",
      model: "opencode-worksheet-v1",
      apiKey: "test-key-123",
    });
  });

  it("trims whitespace around baseUrl and model", () => {
    const config = resolveProviderConfig({
      ...validEnv,
      OPENCODE_BASE_URL: "  https://opencode.example.com/v1  ",
      OPENCODE_MODEL: "  opencode-worksheet-v1  ",
    });
    expect(config.baseUrl).toBe("https://opencode.example.com/v1");
    expect(config.model).toBe("opencode-worksheet-v1");
  });

  it("fails with MISSING_CONFIGURATION when OPENCODE_BASE_URL is absent", () => {
    expect(() =>
      resolveProviderConfig({ OPENCODE_MODEL: "m", OPENCODE_API_KEY: "k" }),
    ).toThrowError(WorksheetProviderError);
    try {
      resolveProviderConfig({ OPENCODE_MODEL: "m", OPENCODE_API_KEY: "k" });
    } catch (error) {
      expect(error).toBeInstanceOf(WorksheetProviderError);
      const providerError = error as WorksheetProviderError;
      expect(providerError.code).toBe("MISSING_CONFIGURATION");
      expect(providerError.message).toContain("OPENCODE_BASE_URL");
      expect(providerError.message).not.toContain("deepseek-key");
    }
  });

  it("fails when OPENCODE_BASE_URL is blank or not an http(s) URL", () => {
    expect(() =>
      resolveProviderConfig({ ...validEnv, OPENCODE_BASE_URL: "   " }),
    ).toThrowError(WorksheetProviderError);
    expect(() =>
      resolveProviderConfig({
        ...validEnv,
        OPENCODE_BASE_URL: "opencode.example.com/v1",
      }),
    ).toThrowError(WorksheetProviderError);
    expect(() =>
      resolveProviderConfig({ ...validEnv, OPENCODE_BASE_URL: "ftp://x" }),
    ).toThrowError(WorksheetProviderError);
  });

  it("fails with MISSING_CONFIGURATION when OPENCODE_MODEL is absent", () => {
    try {
      resolveProviderConfig({
        OPENCODE_BASE_URL: "https://opencode.example.com/v1",
        OPENCODE_API_KEY: "k",
      });
    } catch (error) {
      const providerError = error as WorksheetProviderError;
      expect(providerError.code).toBe("MISSING_CONFIGURATION");
      expect(providerError.message).toContain("OPENCODE_MODEL");
    }
  });

  it("fails with MISSING_API_KEY when OPENCODE_API_KEY is absent or blank", () => {
    try {
      resolveProviderConfig({
        OPENCODE_BASE_URL: "https://opencode.example.com/v1",
        OPENCODE_MODEL: "m",
      });
    } catch (error) {
      const providerError = error as WorksheetProviderError;
      expect(providerError.code).toBe("MISSING_API_KEY");
      expect(providerError.message).toContain("OPENCODE_API_KEY");
    }
    expect(() =>
      resolveProviderConfig({ ...validEnv, OPENCODE_API_KEY: "   " }),
    ).toThrowError(WorksheetProviderError);
  });

  it("never falls back to DEEPSEEK_API_KEY or any other env name", () => {
    const env = {
      OPENCODE_BASE_URL: "https://opencode.example.com/v1",
      OPENCODE_MODEL: "m",
      DEEPSEEK_API_KEY: "deepseek-key",
      OPENAI_API_KEY: "openai-key",
    };
    expect(() => resolveProviderConfig(env)).toThrowError(
      /OPENCODE_API_KEY/,
    );
  });
});

describe("buildChatCompletionsUrl", () => {
  it("appends /chat/completions to a v1-style base", () => {
    expect(buildChatCompletionsUrl("https://opencode.example.com/v1")).toBe(
      "https://opencode.example.com/v1/chat/completions",
    );
  });

  it("normalizes a trailing slash", () => {
    expect(
      buildChatCompletionsUrl("https://opencode.example.com/v1/"),
    ).toBe("https://opencode.example.com/v1/chat/completions");
  });

  it("uses an already-full endpoint as-is", () => {
    expect(
      buildChatCompletionsUrl("https://opencode.example.com/v1/chat/completions"),
    ).toBe("https://opencode.example.com/v1/chat/completions");
  });
});

describe("buildChatCompletionsPayload", () => {
  it("builds the OpenAI-style request body with defaults", () => {
    const payload = buildChatCompletionsPayload({
      model: "opencode-worksheet-v1",
      systemPrompt: "system",
      userPrompt: "user",
    });
    expect(payload.model).toBe("opencode-worksheet-v1");
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
      model: "opencode-worksheet-v1",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: '{"title":"T"}' },
          finish_reason: "stop",
        },
      ],
    });
    expect(parsed.content).toBe('{"title":"T"}');
    expect(parsed.model).toBe("opencode-worksheet-v1");
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

describe("mapHttpError", () => {
  it("maps 401 and 402 to UPSTREAM_ERROR with the status", () => {
    const unauthorized = mapHttpError(401);
    expect(unauthorized.code).toBe("UPSTREAM_ERROR");
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.message).toContain("OPENCODE_API_KEY");

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
  });
});

describe("WORKSHEET_PROVIDER_NAME", () => {
  it("labels the provider for provenance", () => {
    expect(WORKSHEET_PROVIDER_NAME).toBe("opencode");
  });
});
