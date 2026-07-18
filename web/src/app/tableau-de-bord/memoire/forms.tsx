"use client";

// Interactions par ligne : éditer une note sur place, la supprimer, ou annuler
// un rappel. Toute confirmation passe par un état local à deux clics — jamais un
// window.confirm() (dialogue bloquant du navigateur, proscrit ici). Les actions
// serveur portent la vérité (garde d'accès, scope user.id) ; ces composants ne
// font qu'appeler et afficher l'attente. Composants client : la langue arrive
// en prop depuis la page (serveur).

import { useState, useTransition } from "react";
import { Language } from "@/lib/language";
import { DASHBOARD } from "../copy";
import { cancelReminder, deleteMemory, updateMemory } from "./actions";
import { primaryBtn, secondaryBtn, textareaCls } from "../ui";

// Boutons compacts pour les actions de ligne : plus calmes que les gros boutons
// du kit. L'anneau de focus clay global (globals.css) s'applique tout seul.
const rowBtn =
  "rounded-md px-2 py-1 text-sm font-medium text-muted transition-colors hover:bg-cream-deep hover:text-ink";
const rowDangerBtn =
  "rounded-md px-2 py-1 text-sm font-medium text-danger transition-colors hover:bg-danger/5";

export function NoteRow({ noteKey, value, lang }: { noteKey: string; value: string; lang: Language }) {
  const tr = DASHBOARD[lang].memoire.row;
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [draft, setDraft] = useState(value);
  const [pending, startTransition] = useTransition();

  function startEdit() {
    setDraft(value); // repartir de la valeur affichée, même si elle a changé ailleurs
    setEditing(true);
  }

  function save() {
    const next = draft.trim();
    if (!next) return;
    startTransition(async () => {
      await updateMemory(noteKey, next);
      setEditing(false);
    });
  }

  function cancelEdit() {
    setDraft(value);
    setEditing(false);
  }

  function remove() {
    startTransition(async () => {
      await deleteMemory(noteKey);
    });
  }

  if (editing) {
    return (
      <div className="p-4">
        <p className="mb-1.5 text-sm font-medium text-ink">{noteKey}</p>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          maxLength={500}
          aria-label={tr.editAria.replace("%s", noteKey)}
          className={textareaCls}
        />
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={save} disabled={pending || !draft.trim()} className={primaryBtn}>
            {pending ? tr.saving : tr.save}
          </button>
          <button type="button" onClick={cancelEdit} disabled={pending} className={secondaryBtn}>
            {tr.cancel}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start justify-between gap-4 p-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">{noteKey}</p>
        <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-slate">{value}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {confirmDelete ? (
          <>
            <span className="text-xs text-muted">{tr.deleteQ}</span>
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              className={rowDangerBtn}
              aria-label={tr.confirmDeleteAria.replace("%s", noteKey)}
            >
              {tr.yes}
            </button>
            <button type="button" onClick={() => setConfirmDelete(false)} disabled={pending} className={rowBtn}>
              {tr.no}
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={startEdit} className={rowBtn} aria-label={tr.editAria.replace("%s", noteKey)}>
              {tr.edit}
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className={rowDangerBtn}
              aria-label={tr.deleteAria.replace("%s", noteKey)}
            >
              {tr.delete}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function CancelReminderButton({ id, label, lang }: { id: string; label?: string; lang: Language }) {
  const tr = DASHBOARD[lang].memoire.row;
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  function cancel() {
    startTransition(async () => {
      await cancelReminder(id);
    });
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className={rowBtn}
        aria-label={label ? tr.cancelReminderAria.replace("%s", label) : tr.cancelReminderFallback}
      >
        {tr.cancel}
      </button>
    );
  }

  return (
    <span className="flex shrink-0 items-center gap-1">
      <span className="text-xs text-muted">{tr.cancelQ}</span>
      <button type="button" onClick={cancel} disabled={pending} className={rowDangerBtn}>
        {tr.yes}
      </button>
      <button type="button" onClick={() => setConfirming(false)} disabled={pending} className={rowBtn}>
        {tr.no}
      </button>
    </span>
  );
}
