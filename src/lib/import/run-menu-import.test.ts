import type OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { classifyMenuImportSource } from "@/lib/import/source";
import { runMenuImport } from "@/lib/import/run-menu-import";

function queryClient() {
  const query: Record<string, unknown> = {};
  const update = vi.fn(() => query);
  query.update = update;
  query.eq = vi.fn(() => query);
  query.select = vi.fn(() => query);
  query.maybeSingle = vi.fn(async () => ({ data: { id: "job-1" }, error: null }));
  const from = vi.fn(() => query);
  return { client: { from } as unknown as SupabaseClient, from, update };
}

describe("menu import runner", () => {
  it("reprocesses a stored CSV through deterministic staging", async () => {
    const rpc = vi.fn(async () => ({ error: null }));
    const admin = { rpc } as unknown as SupabaseClient;
    const source = classifyMenuImportSource("menu.csv");
    expect(source).not.toBeNull();

    await expect(runMenuImport({
      organizationId: "org-1",
      onboardingCaseId: "case-1",
      menuId: "menu-1",
      menuName: "Cena",
      jobId: "job-1",
      attempt: 2,
      bytes: new TextEncoder().encode("Categoria;Nome;Prezzo\nPrimi;Risotto;12"),
      source: source!,
      jobInput: {
        storage_bucket: "intake",
        storage_path: "org/case/menu.csv",
        filename: "menu.csv",
        mime_type: "text/csv",
        parser: "csv",
      },
      admin,
    })).resolves.toEqual({ status: "review" });

    expect(rpc).toHaveBeenCalledWith("record_menu_import_staging", expect.objectContaining({
      p_job_id: "job-1",
      p_parser: "csv",
    }));
  });

  it("replaces the previous provider file and preserves the claimed attempt number", async () => {
    const admin = queryClient();
    const createFile = vi.fn(async () => ({ id: "file-new" }));
    const deleteFile = vi.fn(async () => undefined);
    const createResponse = vi.fn(async () => ({ id: "response-new", status: "queued", usage: null, error: null }));
    const openai = {
      files: { create: createFile, delete: deleteFile },
      responses: { create: createResponse, cancel: vi.fn() },
    } as unknown as OpenAI;
    const source = classifyMenuImportSource("menu.pdf");
    expect(source).not.toBeNull();

    await expect(runMenuImport({
      organizationId: "org-1",
      onboardingCaseId: "case-1",
      menuId: "menu-1",
      menuName: "Cena",
      jobId: "job-1",
      attempt: 3,
      bytes: new Uint8Array([37, 80, 68, 70]),
      source: source!,
      jobInput: {
        storage_bucket: "intake",
        storage_path: "org/case/menu.pdf",
        filename: "menu.pdf",
        mime_type: "application/pdf",
        parser: "openai",
        openai_file_id: "file-old",
      },
      admin: admin.client,
      openai,
    })).resolves.toMatchObject({ responseId: "response-new", status: "queued" });

    expect(deleteFile).toHaveBeenCalledWith("file-old");
    expect(admin.update).toHaveBeenCalledWith(expect.objectContaining({ attempts: 3 }));
  });
});
