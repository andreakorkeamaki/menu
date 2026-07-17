"use server";

import { headers } from "next/headers";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { createAdminClient } from "@/lib/supabase/admin";
import { DemoRequestSubmissionResultSchema, parseDemoRequestFormData } from "@/lib/demo-request";
import {
  clientAddressFromHeaders,
  getPublicFormFingerprintSecret,
  requestFingerprint,
  retryMinutes,
} from "@/lib/request-security";
import { reportServerError } from "@/lib/server-telemetry";

export type DemoRequestFormState = {
  status: "idle" | "success" | "error";
  message?: string;
  issues?: Record<string, string[]>;
};

export async function submitDemoRequest(
  _previousState: DemoRequestFormState,
  formData: FormData,
): Promise<DemoRequestFormState> {
  const parsed = parseDemoRequestFormData(formData);
  if (!parsed.success) {
    return {
      status: "error",
      message: "Controlla i campi indicati e riprova.",
      issues: parsed.error.flatten().fieldErrors,
    };
  }

  if (!hasSupabaseEnv() || !process.env.SUPABASE_SECRET_KEY) {
    return {
      status: "error",
      message: "Il modulo è momentaneamente non disponibile. Scrivici a ciao@menuinterattivo.it.",
    };
  }

  try {
    const admin = createAdminClient();
    const secret = getPublicFormFingerprintSecret();
    const emailHash = requestFingerprint(secret, "email", parsed.data.email);
    const address = clientAddressFromHeaders(await headers());
    const ipHash = address ? requestFingerprint(secret, "ip", address) : null;

    // Honeypot submissions receive an indistinguishable success response. Only a
    // keyed fingerprint and outcome counter are retained for operator health.
    if (parsed.data.company) {
      await admin.rpc("record_demo_request_honeypot", { p_key_hash: ipHash ?? emailHash });
      return { status: "success" };
    }

    const { data, error } = await admin.rpc("submit_demo_request", {
      p_ip_hash: ipHash,
      p_email_hash: emailHash,
      p_restaurant_name: parsed.data.restaurant_name,
      p_city: parsed.data.city,
      p_contact_name: parsed.data.contact_name,
      p_email: parsed.data.email,
      p_phone: parsed.data.phone ?? "",
      p_contact_role: parsed.data.contact_role,
      p_current_menu_url: parsed.data.current_menu_url ?? "",
      p_desired_languages: parsed.data.desired_languages,
      p_notes: parsed.data.notes ?? "",
    });
    if (error) throw error;
    const result = DemoRequestSubmissionResultSchema.parse(data);
    if (!result.accepted) {
      const minutes = retryMinutes(result.retry_after_seconds);
      return {
        status: "error",
        message: `Abbiamo ricevuto diverse richieste ravvicinate. Riprova tra circa ${minutes} ${minutes === 1 ? "minuto" : "minuti"}, oppure scrivici a ciao@menuinterattivo.it.`,
      };
    }

    return { status: "success" };
  } catch (error) {
    const reference = reportServerError("demo_request.submit", error).slice(0, 8);
    return {
      status: "error",
      message: `Non siamo riusciti a salvare la richiesta. Riprova oppure scrivici a ciao@menuinterattivo.it indicando il riferimento ${reference}.`,
    };
  }
}
