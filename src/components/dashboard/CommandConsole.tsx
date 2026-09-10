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
const MAX_FILE_SIZE_MB = 15;

export function CommandConsole({ spaceId }: CommandConsoleProps) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [showSlowNotice, setShowSlowNotice] = useState(false);
  // Archivo elegido (camara o subida) en espera de que el usuario confirme
  // que es el correcto antes de enviarlo a la IA -- "muestra el nombre o
  // miniatura del archivo seleccionado antes de confirmar".
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<MinimalSpeechRecognition | null>(null);

  useEffect(() => {
    setSpeechSupported(getSpeechRecognitionCtor() !== null);
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  // Libera la miniatura anterior (u la ultima, al desmontar) — createObjectURL
  // reserva memoria hasta que se revoque explicitamente.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // El backend ya no se cuelga indefinidamente (timeout duro en
  // GeminiExtractionProvider), pero un intento con reintentos por 503 igual
  // puede tomar 10-20s reales. Esto evita que la espera se sienta como que
  // la interfaz esta congelada.
  useEffect(() => {
    if (!isPending) {
      setShowSlowNotice(false);
      return;
    }
    const timer = setTimeout(() => setShowSlowNotice(true), 6000);
    return () => clearTimeout(timer);
  }, [isPending]);

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
      handleRegistrar();
    }
  }

  function clearSelectedFile() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(null);
    setPreviewUrl(null);
    if (cameraInputRef.current) cameraInputRef.current.value = '';
    if (uploadInputRef.current) uploadInputRef.current.value = '';
  }

  function handleFileSelected(file: File) {
    setFeedback(null);
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      setFeedback({ kind: 'error', message: `El archivo pesa mas de ${MAX_FILE_SIZE_MB}MB. Usa uno mas liviano.` });
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(file);
    setPreviewUrl(file.type.startsWith('image/') ? URL.createObjectURL(file) : null);
  }

  function submitSelectedFile() {
    const file = selectedFile;
    if (!file) return;
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

      clearSelectedFile();
      setFeedback({
        kind: 'success',
        message: result.needsReview ? 'Documento guardado. Vale la pena revisar algunos detalles.' : 'Documento guardado y listo para confirmar.',
      });
      router.refresh();
    });
  }

  /** El boton "Registrar" hace lo que corresponda: si hay un archivo esperando confirmacion, lo envia; si no, envia el texto. */
  function handleRegistrar() {
    if (selectedFile) submitSelectedFile();
    else submitText();
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
      {selectedFile && (
        <div className="animate-fade-scale-in mb-2 flex items-center gap-2 rounded-lg border border-white/10 bg-obsidian px-3 py-2">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:), no un asset optimizable por next/image
            <img src={previewUrl} alt="" className="h-9 w-9 shrink-0 rounded object-cover" />
          ) : (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-white/5 text-red-400">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-5 w-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M14 2v5h5" />
              </svg>
            </div>
          )}
          <span className="min-w-0 flex-1 truncate text-xs text-stone-300">{selectedFile.name}</span>
          <button
            type="button"
            onClick={clearSelectedFile}
            disabled={isPending}
            title="Quitar archivo"
            aria-label="Quitar archivo"
            className="shrink-0 rounded-md p-1 text-stone-500 transition hover:bg-white/5 hover:text-stone-300 disabled:opacity-50"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => cameraInputRef.current?.click()}
          disabled={isPending}
          title="Tomar una foto"
          aria-label="Tomar una foto"
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
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFileSelected(file);
          }}
        />

        <button
          type="button"
          onClick={() => uploadInputRef.current?.click()}
          disabled={isPending}
          title="Subir imagen o PDF (comprobante, factura)"
          aria-label="Subir imagen o PDF"
          className="flex shrink-0 items-center justify-center rounded-lg border border-white/10 p-2.5 text-stone-400 transition hover:border-gold/30 hover:text-gold disabled:opacity-50"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-4 w-4">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21.44 11.05 12.5 20a5 5 0 0 1-7.07-7.07l8.94-8.94a3.5 3.5 0 0 1 4.95 4.95L10.4 17.87a2 2 0 0 1-2.83-2.83l7.78-7.78"
            />
          </svg>
        </button>
        <input
          ref={uploadInputRef}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFileSelected(file);
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
          value={selectedFile ? '' : text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isPending || Boolean(selectedFile)}
          placeholder={
            selectedFile
              ? 'Archivo listo — presiona Registrar'
              : isListening
                ? 'Escuchando...'
                : 'Ej. 45.000 almuerzo con Juan, o 2.300.000 pago de arriendo'
          }
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-obsidian px-3 py-2.5 text-sm text-stone-100 placeholder:text-stone-600 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 disabled:opacity-60"
        />

        <button
          type="button"
          onClick={handleRegistrar}
          disabled={isPending || (!text.trim() && !selectedFile)}
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
      {!feedback && showSlowNotice && (
        <p className="mt-2 text-xs text-stone-500">La IA esta interpretando tu movimiento, ya casi...</p>
      )}
    </section>
  );
}
