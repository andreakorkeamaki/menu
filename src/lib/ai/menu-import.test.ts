import type OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMenuImportBackgroundJob } from "@/lib/ai/menu-import";

const originalModel = process.env.OPENAI_IMPORT_MODEL;

afterEach(() => {
  if (originalModel === undefined) delete process.env.OPENAI_IMPORT_MODEL;
  else process.env.OPENAI_IMPORT_MODEL = originalModel;
});

function adminUpdate(result: { data: { id: string } | null; error: { message: string } | null }) {
  const maybeSingle = vi.fn(async () => result);
  const select = vi.fn(() => ({ maybeSingle }));
  const eqKind = vi.fn(() => ({ select }));
  const eqOrganization = vi.fn(() => ({ eq: eqKind }));
  const eqId = vi.fn(() => ({ eq: eqOrganization }));
  const update = vi.fn(() => ({ eq: eqId }));
  const insert = vi.fn();
  const client = { from: vi.fn(() => ({ update, insert })) } as unknown as SupabaseClient;
  return { client, update, insert };
}

describe("OpenAI menu import background job", () => {
  it("starts an image response and updates the one pre-existing ai_job", async () => {
    process.env.OPENAI_IMPORT_MODEL = "import-model";
    const create = vi.fn(async () => ({
      id: "resp-1",
      status: "queued",
      usage: null,
      error: null,
    }));
    const cancel = vi.fn();
    const openai = { responses: { create, cancel } } as unknown as OpenAI;
    const admin = adminUpdate({ data: { id: "job-1" }, error: null });

    await expect(createMenuImportBackgroundJob({
      organizationId: "org-1",
      jobId: "job-1",
      onboardingCaseId: "case-1",
      fileId: "file-1",
      filename: "menu.jpg",
      sourceKind: "image",
      openai,
      admin: admin.client,
    })).resolves.toMatchObject({ jobId: "job-1", responseId: "resp-1" });

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      background: true,
      store: true,
      metadata: expect.objectContaining({ ai_job_id: "job-1" }),
      input: [expect.objectContaining({
        content: expect.arrayContaining([
          expect.objectContaining({ type: "input_image", file_id: "file-1", detail: "high" }),
        ]),
      })],
    }));
    expect(admin.update).toHaveBeenCalledOnce();
    expect(admin.insert).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
  });

  it("cancels the response when the existing job cannot be persisted", async () => {
    const create = vi.fn(async () => ({
      id: "resp-orphan",
      status: "in_progress",
      usage: null,
      error: null,
    }));
    const cancel = vi.fn(async () => undefined);
    const openai = { responses: { create, cancel } } as unknown as OpenAI;
    const admin = adminUpdate({ data: null, error: null });

    await expect(createMenuImportBackgroundJob({
      organizationId: "org-1",
      jobId: "missing-job",
      fileId: "file-1",
      openai,
      admin: admin.client,
    })).rejects.toThrow("job assente");
    expect(cancel).toHaveBeenCalledWith("resp-orphan");
  });
});
