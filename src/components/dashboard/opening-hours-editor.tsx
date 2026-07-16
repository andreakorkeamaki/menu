"use client";

import { useRef, useState } from "react";

type OpeningHoursRow = { days: string; hours: string };
type EditorRow = OpeningHoursRow & { id: string };

export function OpeningHoursEditor({ initialRows }: { initialRows: OpeningHoursRow[] }) {
  const nextId = useRef(initialRows.length);
  const [rows, setRows] = useState<EditorRow[]>(() =>
    (initialRows.length ? initialRows : [{ days: "", hours: "" }]).map((row, index) => ({
      ...row,
      id: `opening-hours-${index}`,
    })),
  );

  function updateRow(id: string, field: keyof OpeningHoursRow, value: string) {
    setRows((current) => current.map((row) => row.id === id ? { ...row, [field]: value } : row));
  }

  function removeRow(id: string) {
    setRows((current) => current.length === 1
      ? [{ id: current[0].id, days: "", hours: "" }]
      : current.filter((row) => row.id !== id));
  }

  function addRow() {
    const id = `opening-hours-new-${nextId.current}`;
    nextId.current += 1;
    setRows((current) => [...current, { id, days: "", hours: "" }]);
  }

  return (
    <fieldset className="opening-hours-editor">
      <legend>Orari di apertura</legend>
      <p>Raggruppa i giorni con gli stessi orari. Lascia vuoto l’orario soltanto rimuovendo l’intera riga.</p>
      <div className="opening-hours-list">
        {rows.map((row, index) => (
          <div className="opening-hours-row" key={row.id}>
            <label>
              Giorni <span className="sr-only">— fascia {index + 1}</span>
              <input
                name="opening_days"
                value={row.days}
                onChange={(event) => updateRow(row.id, "days", event.target.value)}
                placeholder="Es. Lun–Ven"
                required={Boolean(row.days || row.hours)}
              />
            </label>
            <label>
              Orari <span className="sr-only">— fascia {index + 1}</span>
              <input
                name="opening_times"
                value={row.hours}
                onChange={(event) => updateRow(row.id, "hours", event.target.value)}
                placeholder="Es. 12:00–14:30 · 19:00–22:30"
                required={Boolean(row.days || row.hours)}
              />
            </label>
            <button
              className="text-button opening-hours-remove"
              type="button"
              onClick={() => removeRow(row.id)}
              aria-label={`Rimuovi fascia oraria ${index + 1}`}
            >
              Rimuovi
            </button>
          </div>
        ))}
      </div>
      <button className="button button-light opening-hours-add" type="button" onClick={addRow} disabled={rows.length >= 14}>
        Aggiungi fascia oraria
      </button>
    </fieldset>
  );
}
