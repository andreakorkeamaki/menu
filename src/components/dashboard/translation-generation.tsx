"use client";

import {
  createContext,
  type FormEvent,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { maximumTranslationRequests } from "@/lib/ai/translation-limits";

interface GenerationState {
  pending: boolean;
  requested: number;
  completed: number;
  saved: number;
  batches: number;
  label: string;
  error: string | null;
  elapsedSeconds: number;
}

interface GenerationRequest {
  count: number;
  label: string;
  locale?: string;
  translationId?: string;
}

interface GenerationContextValue extends GenerationState {
  generate: (request: GenerationRequest) => Promise<void>;
}

const initialState: GenerationState = {
  pending: false,
  requested: 0,
  completed: 0,
  saved: 0,
  batches: 0,
  label: "",
  error: null,
  elapsedSeconds: 0,
};

const GenerationContext = createContext<GenerationContextValue | null>(null);

function useTranslationGeneration() {
  const value = useContext(GenerationContext);
  if (!value) {
    throw new Error("TranslationGenerationProvider mancante.");
  }
  return value;
}

export function TranslationGenerationProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(initialState);
  const pendingRef = useRef(false);

  useEffect(() => {
    if (!state.pending) return;
    const timer = window.setInterval(() => {
      setState((current) => ({
        ...current,
        elapsedSeconds: current.elapsedSeconds + 1,
      }));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [state.pending]);

  async function generate(request: GenerationRequest) {
    if (pendingRef.current || request.count === 0) return;
    pendingRef.current = true;
    setState({
      ...initialState,
      pending: true,
      requested: request.count,
      label: request.label,
    });

    let completed = 0;
    let saved = 0;
    let batches = 0;
    let partial = false;

    try {
      // The API intentionally handles at most 200 eligible rows per request.
      // Repeating the request makes "generate all" truthful for larger menus and
      // gives the UI a real progress update after each completed block.
      const maximumBatches = maximumTranslationRequests(
        request.count,
        Boolean(request.translationId),
      );

      while (batches < maximumBatches && completed < request.count) {
        const response = await fetch("/api/openai/translations/start", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            translation_ids: request.translationId ? [request.translationId] : [],
            locales: request.locale ? [request.locale] : [],
          }),
        });
        const result = (await response.json()) as {
          error?: string;
          requested?: number;
          saved?: number;
          status?: number;
        };

        if (result.error) throw new Error(result.error);

        const blockRequested = result.requested ?? 0;
        const blockSaved = result.saved ?? 0;
        completed = Math.min(request.count, completed + blockRequested);
        saved += blockSaved;
        batches += 1;
        partial ||= !response.ok;
        setState((current) => ({
          ...current,
          completed,
          saved,
          batches,
        }));

        if (!response.ok || blockRequested === 0 || blockSaved === 0) break;
      }

      const destination = new URL("/dashboard/translations", window.location.origin);
      destination.searchParams.set("generated", String(saved));
      destination.searchParams.set("requested", String(completed));
      if (partial) destination.searchParams.set("translation_error", "partial");
      window.location.assign(destination.toString());
    } catch (error) {
      pendingRef.current = false;
      setState((current) => ({
        ...current,
        pending: false,
        error:
          error instanceof Error
            ? error.message
            : "Generazione traduzioni non riuscita.",
      }));
    }
  }

  return (
    <GenerationContext.Provider value={{ ...state, generate }}>
      {children}
    </GenerationContext.Provider>
  );
}

interface TranslationGenerationFormProps {
  children: ReactNode;
  count: number;
  label: string;
  locale?: string;
  translationId?: string;
  className?: string;
  buttonClassName: string;
}

export function TranslationGenerationForm({
  children,
  count,
  label,
  locale,
  translationId,
  className,
  buttonClassName,
}: TranslationGenerationFormProps) {
  const generation = useTranslationGeneration();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void generation.generate({ count, label, locale, translationId });
  }

  return (
    <form
      action="/api/openai/translations/start"
      method="post"
      className={className}
      onSubmit={submit}
    >
      {locale && <input type="hidden" name="locale" value={locale} />}
      {translationId && (
        <input type="hidden" name="translation_id" value={translationId} />
      )}
      <button
        className={buttonClassName}
        disabled={count === 0 || generation.pending}
        aria-disabled={count === 0 || generation.pending}
        data-pending={generation.pending || undefined}
      >
        {generation.pending && generation.label === label && (
          <span className="loading-spinner" aria-hidden="true" />
        )}
        {children}
      </button>
    </form>
  );
}

function elapsedLabel(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}

export function TranslationGenerationProgress() {
  const generation = useTranslationGeneration();
  if (!generation.pending && !generation.error) return null;

  if (generation.error) {
    return (
      <p className="form-error" role="alert">
        Generazione interrotta: {generation.error}
      </p>
    );
  }

  const hasMeasuredProgress = generation.batches > 0 && generation.requested > 0;
  const percent = hasMeasuredProgress
    ? Math.min(100, Math.round((generation.completed / generation.requested) * 100))
    : null;

  const progressMessage = hasMeasuredProgress
    ? `${generation.completed} di ${generation.requested} righe elaborate; ${generation.saved} bozze salvate.`
    : "Preparazione delle righe e invio del primo blocco all’AI.";

  return (
    <section className="ai-progress" aria-busy="true">
      <span className="sr-only" role="status" aria-live="polite">{progressMessage}</span>
      <span className="ai-progress-icon" aria-hidden="true">
        <span className="loading-spinner" />
      </span>
      <div>
        <strong>{generation.label}</strong>
        <p>
          {hasMeasuredProgress
            ? `${generation.completed} di ${generation.requested} righe elaborate · ${generation.saved} bozze salvate`
            : "Sto preparando le righe e inviando il primo blocco all’AI."}
        </p>
        <div
          className={percent === null ? "progress-track indeterminate" : "progress-track"}
          aria-hidden="true"
        >
          <span style={percent === null ? undefined : { width: `${percent}%` }} />
        </div>
        <small>
          Tempo trascorso {elapsedLabel(generation.elapsedSeconds)}. Puoi lasciare aperta questa pagina: il menu pubblicato non cambia.
        </small>
      </div>
    </section>
  );
}
