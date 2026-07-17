"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

function serializeForm(form: HTMLFormElement) {
  return JSON.stringify(Array.from(new FormData(form).entries()).map(([key, value]) => [
    key,
    value instanceof File ? { name: value.name, size: value.size, type: value.type } : value,
  ]));
}

export function unsavedFormLabel(count: number) {
  return count === 1 ? "1 riquadro da salvare" : `${count} riquadri da salvare`;
}

export function WorkspaceDraftGuard({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const baselinesRef = useRef(new WeakMap<HTMLFormElement, string>());
  const dirtyFormsRef = useRef(new Set<HTMLFormElement>());
  const [dirtyCount, setDirtyCount] = useState(0);

  const syncForm = useCallback((form: HTMLFormElement) => {
    const baseline = baselinesRef.current.get(form);
    if (baseline === undefined) {
      baselinesRef.current.set(form, serializeForm(form));
      return;
    }
    if (serializeForm(form) === baseline) dirtyFormsRef.current.delete(form);
    else dirtyFormsRef.current.add(form);
    setDirtyCount(dirtyFormsRef.current.size);
  }, []);

  const clearDirtyState = useCallback(() => {
    dirtyFormsRef.current.clear();
    setDirtyCount(0);
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    function initializeForms() {
      root!.querySelectorAll("form").forEach((form) => {
        if (!baselinesRef.current.has(form)) {
          baselinesRef.current.set(form, serializeForm(form));
        }
      });
      for (const form of dirtyFormsRef.current) {
        if (!root!.contains(form)) dirtyFormsRef.current.delete(form);
      }
      setDirtyCount(dirtyFormsRef.current.size);
    }

    initializeForms();
    const observer = new MutationObserver(initializeForms);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!dirtyCount) return;

    function confirmPageExit(event: MouseEvent) {
      if (!dirtyFormsRef.current.size) return;
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target.closest("a") : null;
      if (!(target instanceof HTMLAnchorElement) || target.target === "_blank" || target.hasAttribute("download")) return;
      const destination = new URL(target.href, window.location.href);
      if (destination.href === window.location.href || destination.hash && destination.pathname === window.location.pathname && destination.search === window.location.search) return;
      if (!window.confirm("Hai modifiche non salvate in questa pagina. Uscendo andranno perse.")) {
        event.preventDefault();
        event.stopPropagation();
      } else {
        clearDirtyState();
      }
    }

    function confirmWindowExit(event: BeforeUnloadEvent) {
      if (!dirtyFormsRef.current.size) return;
      event.preventDefault();
      event.returnValue = "";
    }

    document.addEventListener("click", confirmPageExit, true);
    window.addEventListener("beforeunload", confirmWindowExit);
    return () => {
      document.removeEventListener("click", confirmPageExit, true);
      window.removeEventListener("beforeunload", confirmWindowExit);
    };
  }, [clearDirtyState, dirtyCount]);

  return (
    <div
      ref={rootRef}
      className="workspace-draft-guard"
      onInput={(event) => {
        const form = event.target instanceof Element ? event.target.closest("form") : null;
        if (form instanceof HTMLFormElement) syncForm(form);
      }}
      onChange={(event) => {
        const form = event.target instanceof Element ? event.target.closest("form") : null;
        if (form instanceof HTMLFormElement) syncForm(form);
      }}
      onSubmitCapture={(event) => {
        const submittingForm = event.target;
        if (!(submittingForm instanceof HTMLFormElement)) return;
        const otherDirtyForms = Array.from(dirtyFormsRef.current).filter((form) => form !== submittingForm);
        if (otherDirtyForms.length && !window.confirm("Ci sono modifiche non salvate in un altro riquadro. Continuando andranno perse.")) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        clearDirtyState();
      }}
    >
      {dirtyCount ? (
        <aside className="unsaved-workspace-banner" role="status" aria-live="polite">
          <span aria-hidden="true">●</span>
          <div><strong>Modifiche non salvate</strong><small>{unsavedFormLabel(dirtyCount)}. Salva ogni riquadro prima di cambiare pagina.</small></div>
          <button type="button" onClick={() => { clearDirtyState(); window.location.reload(); }}>Scarta modifiche</button>
        </aside>
      ) : null}
      {children}
    </div>
  );
}
