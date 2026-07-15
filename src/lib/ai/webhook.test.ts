import type OpenAI from "openai";
import { describe, expect, it, vi } from "vitest";
import {
  processResponseWebhook,
  type ResponseWebhookEvent,
  type WebhookRepository,
} from "@/lib/ai/webhook";

const staging = {
  menu_name: "Menu test",
  source_locale: "it",
  currency: "EUR",
  categories: [],
  confidence: { score: 1, notes: null },
  issues: [],
};

function repository(claim: "claimed" | "retry" | "duplicate" = "claimed") {
  return {
    claim: vi.fn(async () => claim),
    updateJob: vi.fn(async () => undefined),
    complete: vi.fn(async () => undefined),
    fail: vi.fn(async () => undefined),
  } satisfies WebhookRepository;
}

const event: ResponseWebhookEvent = {
  id: "evt_1",
  type: "response.completed",
  data: { id: "resp_1" },
  created_at: 1,
};

describe("processResponseWebhook", () => {
  it("retrieves, validates and persists completed staging output", async () => {
    const repo = repository();
    const retrieve = vi.fn(async () => ({
      id: "resp_1",
      status: "completed",
      output_text: JSON.stringify(staging),
      error: null,
      incomplete_details: null,
      usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
    }));
    const openai = { responses: { retrieve } } as unknown as OpenAI;

    await expect(
      processResponseWebhook({
        webhookId: "wh_1",
        event,
        rawPayload: event,
        openai,
        repository: repo,
      }),
    ).resolves.toEqual({ duplicate: false, status: "review" });
    expect(repo.updateJob).toHaveBeenCalledWith(
      "resp_1",
      expect.objectContaining({ status: "review", output: staging }),
    );
    expect(repo.complete).toHaveBeenCalledWith("wh_1");
  });

  it("does not retrieve or update a duplicate delivery", async () => {
    const repo = repository("duplicate");
    const retrieve = vi.fn();
    const openai = { responses: { retrieve } } as unknown as OpenAI;

    await expect(
      processResponseWebhook({
        webhookId: "wh_1",
        event,
        rawPayload: event,
        openai,
        repository: repo,
      }),
    ).resolves.toEqual({ duplicate: true });
    expect(retrieve).not.toHaveBeenCalled();
    expect(repo.updateJob).not.toHaveBeenCalled();
  });

  it("marks invalid structured output as failed", async () => {
    const repo = repository();
    const openai = {
      responses: {
        retrieve: vi.fn(async () => ({
          id: "resp_1",
          status: "completed",
          output_text: "{}",
          error: null,
          incomplete_details: null,
          usage: null,
        })),
      },
    } as unknown as OpenAI;

    await processResponseWebhook({
      webhookId: "wh_2",
      event,
      rawPayload: event,
      openai,
      repository: repo,
    });
    expect(repo.updateJob).toHaveBeenCalledWith(
      "resp_1",
      expect.objectContaining({
        status: "failed",
        output: null,
        error: { message: expect.stringContaining("Output OpenAI non valido") },
      }),
    );
  });
});
