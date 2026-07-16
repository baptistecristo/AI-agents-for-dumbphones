"use client";

// Interactions par ligne : éditer une note sur place, la supprimer, ou annuler
// un rappel. Toute confirmation passe par un état local à deux clics — jamais un
// window.confirm() (dialogue bloquant du navigateur, proscrit ici). Les actions
// serveur portent la vérité (garde d'accès, scope user.id) ; ces composants ne
// font qu'appeler et afficher l'attente.

import { useState, useTransition } from "react";
import { cancelReminder, deleteMemory, updateMemory } from "./actions";
import { primaryBtn, secondaryBtn, textareaCls } from "../ui";

// Boutons compacts pour les actions de ligne : plus calmes que les gros boutons
// du kit, tout en gardant l'anneau de focus au clavier.
const rowBtn =
  "rounded-md px-2 py-1 text-sm font-medium text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bleu dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100";
const rowDangerBtn =
  "rounded-md px-2 py-1 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bleu dark:text-red-400 dark:hover:bg-red-950/40";

export function NoteRow({ noteKey, value }: { noteKey: string; value: string }) {
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
        <p className="mb-1.5 text-sm font-bold text-ink dark:text-neutral-100">{noteKey}</p>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          maxLength={500}
          aria-label={`Modifier la note « ${noteKey} »`}
          className={textareaCls}
        />
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={save} disabled={pending || !draft.trim()} className={primaryBtn}>
            {pending ? "Enregistrement…" : "Enregistrer"}
          </button>
          <button type="button" onClick={cancelEdit} disabled={pending} className={secondaryBtn}>
            Annuler
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start justify-between gap-4 p-4">
      <div className="min-w-0">
        <p className="text-sm font-bold text-ink dark:text-neutral-100">{noteKey}</p>
        <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-neutral-600 dark:text-neutral-300">{value}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {confirmDelete ? (
          <>
            <span className="text-xs text-neutral-500 dark:text-neutral-400">Supprimer&nbsp;?</span>
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              className={rowDangerBtn}
              aria-label={`Confirmer la suppression de la note « ${noteKey} »`}
            >
              Oui
            </button>
            <button type="button" onClick={() => setConfirmDelete(false)} disabled={pending} className={rowBtn}>
              Non
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={startEdit} className={rowBtn} aria-label={`Modifier la note « ${noteKey} »`}>
              Modifier
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className={rowDangerBtn}
              aria-label={`Supprimer la note « ${noteKey} »`}
            >
              Supprimer
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function CancelReminderButton({ id, label }: { id: string; label?: string }) {
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
        aria-label={label ? `Annuler le rappel : ${label}` : "Annuler ce rappel"}
      >
        Annuler
      </button>
    );
  }

  return (
    <span className="flex shrink-0 items-center gap-1">
      <span className="text-xs text-neutral-500 dark:text-neutral-400">Annuler&nbsp;?</span>
      <button type="button" onClick={cancel} disabled={pending} className={rowDangerBtn}>
        Oui
      </button>
      <button type="button" onClick={() => setConfirming(false)} disabled={pending} className={rowBtn}>
        Non
      </button>
    </span>
  );
}
