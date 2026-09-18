'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { discardFailedCapture, editAndRetryFailedCapture, retryFailedCapture, type FailedCaptureSummary } from '@/actions/ingestion';
import { cn } from '@/lib/utils';

interface FailedCapturesCardProps {
  spaceId: string;
  captures: FailedCaptureSummary[];
}

const SOURCE_LABEL: Record<string, string> = {
  ai_text: 'Texto',
  ai_voice: 'Voz',
  ai_photo: 'Foto',
  ai_document: 'Documento',
};

function CaptureRow({ spaceId, capture }: { spaceId: string; capture: FailedCaptureSummary }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [editedText, setEditedText] = useState(capture.rawText ?? '');
  const [error, setError] = useState<string | null>(null);
  const [resolved, setResolved] = useState(false);

  function handleRetry() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await retryFailedCapture(spaceId, capture.id);
        if (!result.success) {
          setError(result.error);
          return;
        }
        setResolved(true);
        router.refresh();
      } catch (err) {
        console.error('Error de red al reintentar la captura:', err);
        setError('Se perdio la conexion antes de reintentar. Intenta de nuevo.');
      }
    });
  }

  function handleEditRetry() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await editAndRetryFailedCapture(spaceId, capture.id, editedText);
        if (!result.success) {
          setError(result.error);
          return;
        }
        setResolved(true);
        router.refresh();
      } catch (err) {
        console.error('Error de red al corregir y reintentar la captura:', err);
        setError('Se perdio la conexion antes de reintentar. Intenta de nuevo.');
      }
    });
  }

  function handleDiscard() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await discardFailedCapture(spaceId, capture.id);
        if (!result.success) {
          setError(result.error);
          return;
        }
        setResolved(true);
        router.refresh();
      } catch (err) {
        console.error('Error de red al descartar la captura:', err);
        setError('Se perdio la conexion antes de descartar. Intenta de nuevo.');
      }
    });
  }

  if (resolved) return null;

  return (
    <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.04] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-stone-400">
              {SOURCE_LABEL[capture.captureSource] ?? capture.captureSource}
            </span>
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-400">
              No se pudo interpretar
            </span>
          </div>
          <p className="mt-1.5 text-sm text-stone-100">
            {capture.rawText ?? capture.originalFilename ?? '(sin texto -- documento adjunto)'}
          </p>
          <p className="mt-0.5 text-[11px] text-stone-500">{new Date(capture.createdAt).toLocaleString('es-CO')}</p>
        </div>
      </div>

      {editing ? (
        <div className="mt-3">
          <input
            value={editedText}
            onChange={(e) => setEditedText(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-page px-3 py-2 text-sm text-stone-100 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
            autoFocus
          />
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setEditing(false)} className="text-xs text-stone-400 hover:text-stone-200">
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleEditRetry}
              disabled={isPending}
              className="rounded-lg bg-wealth px-3 py-1.5 text-xs font-medium text-white transition hover:bg-wealth-hover disabled:opacity-50"
            >
              {isPending ? 'Procesando...' : 'Guardar y reintentar'}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleRetry}
            disabled={isPending}
            className={cn(
              'rounded-lg bg-wealth px-3 py-1.5 text-xs font-medium text-white transition hover:bg-wealth-hover disabled:opacity-50',
            )}
          >
            {isPending ? 'Reintentando...' : 'Reintentar'}
          </button>
          {capture.rawText && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              disabled={isPending}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-stone-300 transition hover:border-white/20 disabled:opacity-50"
            >
              Corregir y reintentar
            </button>
          )}
          <button
            type="button"
            onClick={handleDiscard}
            disabled={isPending}
            className="rounded-lg px-3 py-1.5 text-xs text-stone-500 transition hover:text-red-400 disabled:opacity-50"
          >
            Descartar
          </button>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}

/**
 * Centro de Ingesta: entradas que ni Gemini ni el motor local pudieron
 * interpretar (ver actions/capture.ts). Nunca se pierden -- quedan aqui,
 * con la entrada original visible, hasta que la persona reintenta,
 * corrige o descarta. Cero Ruido: la tarjeta no existe si no hay nada
 * pendiente de resolver.
 */
export function FailedCapturesCard({ spaceId, captures }: FailedCapturesCardProps) {
  if (captures.length === 0) return null;

  return (
    <section className="rounded-xl border border-amber-500/25 bg-elevated p-5">
      <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-amber-400">
        Centro de Ingesta · {captures.length} sin interpretar
      </p>
      <p className="mt-1 text-xs text-stone-500">
        Tu informacion nunca se perdio -- solo necesita una revision antes de convertirse en un movimiento.
      </p>
      <div className="mt-3 flex flex-col gap-3">
        {captures.map((capture) => (
          <CaptureRow key={capture.id} spaceId={spaceId} capture={capture} />
        ))}
      </div>
    </section>
  );
}
