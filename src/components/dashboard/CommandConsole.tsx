'use client';

import { useEffect, useRef, useState, useTransition, type KeyboardEvent } from 'react';
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

// El Web Speech API no tiene tipos oficiales en lib.dom.d.ts y
// webkitSpeechRecognition no existe en absoluto ahi; se declara aqui el
// subconjunto minimo que se usa, en vez de tipar todo el API.
interface MinimalSpeechRecognition extends EventTarget {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}

function getSpeechRecognitionCtor(): (new () => MinimalSpeechRecognition) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => MinimalSpeechRecognition;
    webkitSpeechRecognition?: new () => MinimalSpeechRecognition;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Bloque (c) del Executive Action Board: la Consola de Comando Directa.
 * Vive arriba (sticky, justo debajo del encabezado) en vez de fija abajo:
 * un input fijo al fondo en movil queda tapado o mal posicionado cuando se
 * abre el teclado virtual justo al escribir — el momento en que mas se
 * necesita verla. Arriba evita ese problema por completo y ademas es
 * literalmente lo primero que se ve al entrar, sin buscar ni hacer scroll.
 * Escribir/dictar y presionar Enter (o Registrar) debe sentirse tan rapido
 * como mandar un mensaje de texto.
 */
export function CommandConsole({ spaceId }: CommandConsoleProps) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<MinimalSpeechRecognition | null>(null);

  useEffect(() => {
    setSpeechSupported(getSpeechRecognitionCtor() !== null);
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

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

  function toggleListening() {
    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }

    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;

    const recognition = new Ctor();
    recognition.lang = 'es-CO';
    recognition.interimResults = true;
    recognition.continuous = false;

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? '')
        .join(' ');
      setText(transcript);
    };
    recognition.onerror = () => {
      setIsListening(false);
      setFeedback({ kind: 'error', message: 'No se pudo escuchar el microfono. Intenta de nuevo o escribe.' });
    };
    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    setFeedback(null);
    setIsListening(true);
    recognition.start();
  }

  return (
    <section
      id="quick-capture"
      className="sticky top-4 z-20 rounded-xl border border-white/10 bg-elevated/95 px-4 py-3 shadow-2xl shadow-black/40 backdrop-blur transition-colors hover:border-gold/15 sm:px-5"
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

        {speechSupported && (
          <button
            type="button"
            onClick={toggleListening}
            disabled={isPending}
            title={isListening ? 'Detener dictado' : 'Dictar por voz'}
            aria-label={isListening ? 'Detener dictado' : 'Dictar por voz'}
            className={cn(
              'flex shrink-0 items-center justify-center rounded-lg border p-2.5 transition disabled:opacity-50',
              isListening
                ? 'animate-pulse border-red-500/40 text-red-400'
                : 'border-white/10 text-stone-400 hover:border-gold/30 hover:text-gold',
            )}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-4 w-4">
              <rect x="9" y="2" width="6" height="12" rx="3" strokeLinecap="round" strokeLinejoin="round" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 11a7 7 0 0 0 14 0M12 18v4" />
            </svg>
          </button>
        )}

        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isPending}
          placeholder={isListening ? 'Escuchando...' : 'Ej. 45.000 almuerzo con Juan, o 2.300.000 pago de arriendo'}
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
