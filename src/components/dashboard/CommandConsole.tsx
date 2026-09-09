'use client';

import { useRef, useState, useTransition, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { processIncomingCapture } from '@/actions/capture';
import { getSupabaseBrowserClient } from '@/infrastructure/supabase/client';
import type { AiCaptureSource } from '@/domain/types/capture';
import { cn } from '@/lib/utils';

// El parser de Excel/CSV (xlsx) es pesado; se difiere del bundle inicial del
// tablero y solo se descarga cuando el usuario realmente abre el importador.
const BulkImportModal = dynamic(
  () => import('@/components/dashboard/BulkImportModal').then((mod) => mod.BulkImportModal),
  { ssr: false, loading: () => null },
);

interface CommandConsoleProps {
  spaceId: string;
}

function sourceForMimeType(mimeType: string): AiCaptureSource {
  return mimeType.startsWith('image/') ? 'ai_photo' : 'ai_document';
}

/**
 * Bloque (c) del Executive Action Board: la Consola de Comando Directa.
 * Una sola franja fija y compacta (no una tarjeta alta) siempre alcanzable —
 * escribir y presionar Enter (o Registrar) debe sentirse tan rapido como
 * mandar un mensaje de texto.
 * Nota: solo texto y foto/documento estan implementados; la entrada por voz
 * es una aspiracion del producto, no un boton que aparente funcionar sin hacerlo.
 */
export function CommandConsole({ spaceId }: CommandConsoleProps) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function submitText() {
    const trimmed = text.trim();
    if (!trimmed) return;
    setFeedback(null);
    startTransition(async () => {
      const result = await processIncomingCapture({ space_id: spaceId, capture_source: 'ai_text', raw_text: trimmed });
      if (!result.success) {
        setFeedback({ kind: 'error', message: result.error });
        return;
      }
      setText('');
      setFeedback({
        kind: 'success',
        message: result.needsReview ? 'Guardado. Vale la pena revisar algunos detalles.' : 'Guardado y listo para confirmar.',
      });
      router.refresh();
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      submitText();
    }
  }

  function submitFile(file: File) {
    setFeedback(null);
    startTransition(async () => {
      const supabase = getSupabaseBrowserClient();
      const path = `${spaceId}/${crypto.randomUUID()}-${file.name}`;

      const { error: uploadError } = await supabase.storage.from('receipts').upload(path, file, { upsert: false });
      if (uploadError) {
        console.error('Error al subir el documento:', uploadError);
        setFeedback({ kind: 'error', message: 'No se pudo subir el archivo. Intenta de nuevo.' });
        return;
      }

      const result = await processIncomingCapture({
        space_id: spaceId,
        capture_source: sourceForMimeType(file.type),
        storage_path: path,
        mime_type: file.type,
        original_filename: file.name,
      });

      if (!result.success) {
        setFeedback({ kind: 'error', message: result.error });
        return;
      }

      if (fileInputRef.current) fileInputRef.current.value = '';
      setFeedback({
        kind: 'success',
        message: result.needsReview ? 'Documento guardado. Vale la pena revisar algunos detalles.' : 'Documento guardado y listo para confirmar.',
      });
      router.refresh();
    });
  }

  return (
    <section
      id="quick-capture"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-white/10 bg-elevated/95 px-4 py-3 shadow-2xl shadow-black/40 backdrop-blur transition-colors hover:border-gold/15 sm:inset-x-6 sm:bottom-4 sm:mx-auto sm:max-w-5xl sm:rounded-xl sm:border sm:px-5 sm:py-3"
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isPending}
          title="Tomar o adjuntar una foto"
          aria-label="Tomar o adjuntar una foto"
          className="flex shrink-0 items-center justify-center rounded-lg border border-white/10 p-2.5 text-stone-400 transition hover:border-gold/30 hover:text-gold disabled:opacity-50"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-4 w-4">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 7h3.5l1.2-2h8.6l1.2 2H21a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z"
            />
            <circle cx="12" cy="13" r="3.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) submitFile(file);
          }}
        />

        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isPending}
          placeholder="Ej. 45.000 almuerzo con Juan, o 2.300.000 pago de arriendo"
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-obsidian px-3 py-2.5 text-sm text-stone-100 placeholder:text-stone-600 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
        />

        <button
          type="button"
          onClick={submitText}
          disabled={isPending || !text.trim()}
          className="shrink-0 rounded-lg bg-wealth px-4 py-2.5 text-sm font-medium text-white transition hover:bg-wealth-hover disabled:opacity-50"
        >
          {isPending ? '...' : 'Registrar'}
        </button>

        <div className="hidden shrink-0 sm:block">
          <BulkImportModal spaceId={spaceId} />
        </div>
      </div>

      {feedback && (
        <p className={cn('mt-2 text-xs', feedback.kind === 'success' ? 'text-growth' : 'text-red-400')}>
          {feedback.message}
        </p>
      )}
    </section>
  );
}
