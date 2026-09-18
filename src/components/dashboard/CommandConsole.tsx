'use client';

import { useEffect, useRef, useState, useTransition, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { AnimatePresence, motion } from 'framer-motion';
import { processIncomingCapture } from '@/actions/capture';
import { checkStorageQuota } from '@/actions/plan-limits';
import { getSupabaseBrowserClient } from '@/infrastructure/supabase/client';
import { COLLAPSE_VARIANTS, SPRING_SNAPPY } from '@/lib/motion';
import type { AiCaptureSource } from '@/domain/types/capture';
import { cn } from '@/lib/utils';

// El parser de Excel/CSV (xlsx) es pesado; se difiere del bundle inicial del
// tablero y solo se descarga cuando el usuario realmente abre el importador.
const BulkImportModal = dynamic(
  () => import('@/components/dashboard/BulkImportModal').then((mod) => mod.BulkImportModal),
  { ssr: false, loading: () => null },
);

// Se usa con poca frecuencia (solo al recibir una factura electronica) --
// mismo motivo de diferir la carga que BulkImportModal.
const XmlInvoiceUploadModal = dynamic(
  () => import('@/components/dashboard/XmlInvoiceUploadModal').then((mod) => mod.XmlInvoiceUploadModal),
  { ssr: false, loading: () => null },
);

interface CommandConsoleProps {
  spaceId: string;
  /** RBAC (Bloque P4): owner/admin/editor. Un Visor no puede capturar movimientos (RLS ya lo bloquea; esto evita mostrar una consola que terminaria en un error de permiso). */
  canEdit: boolean;
}

function sourceForMimeType(mimeType: string): AiCaptureSource {
  return mimeType.startsWith('image/') ? 'ai_photo' : 'ai_document';
}

/**
 * Optimizacion de Interfaz en Confirmacion: antes, la tarjeta con los
 * valores procesados por la IA aparecia mas abajo en la bandeja de
 * pendientes (ActionFeed), exigiendo desplazamiento manual para verla justo
 * despues de "Registrar". Esto la trae a la vista de inmediato, justo
 * debajo de la consola (que es sticky arriba) -- lectura en 3 segundos, sin
 * scroll. router.refresh() es asincrono, asi que se reintenta unos
 * instantes hasta que el nodo con el nuevo id exista en el DOM.
 */
function scrollToPendingTransaction(transactionId: string) {
  const start = Date.now();
  const MAX_WAIT_MS = 3000;

  function attempt() {
    const el = document.getElementById(`pending-${transactionId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (Date.now() - start < MAX_WAIT_MS) {
      requestAnimationFrame(attempt);
    }
  }

  requestAnimationFrame(attempt);
}

// Umbral bajo el cual una imagen ya es lo bastante liviana como para no
// valer la pena recomprimir (fotos de pantalla, capturas ya optimizadas).
const COMPRESS_THRESHOLD_BYTES = 600 * 1024;
const MAX_IMAGE_DIMENSION_PX = 1920;

/**
 * Redimensiona/recomprime una foto en el navegador (canvas + JPEG) antes de
 * subirla, para que una foto de camara de varios MB no se cargue completa a
 * Storage en conexiones moviles lentas. Los PDF pasan intactos (comprimir un
 * PDF en el cliente de forma segura no es viable sin una libreria pesada).
 * Cualquier fallo cae de vuelta al archivo original: nunca bloquea la captura.
 */
async function compressImageIfNeeded(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.size <= COMPRESS_THRESHOLD_BYTES) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_IMAGE_DIMENSION_PX / Math.max(bitmap.width, bitmap.height));
    const targetWidth = Math.round(bitmap.width * scale);
    const targetHeight = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
    if (!blob || blob.size >= file.size) return file;

    const compressedName = file.name.replace(/\.[^./\\]+$/, '') + '.jpg';
    return new File([blob], compressedName, { type: 'image/jpeg' });
  } catch {
    return file;
  }
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

export function CommandConsole({ spaceId, canEdit }: CommandConsoleProps) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error' | 'illegible'; message: string } | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [showSlowNotice, setShowSlowNotice] = useState(false);
  // Archivo elegido (camara o subida) en espera de que el usuario confirme
  // que es el correcto antes de enviarlo a la IA -- "muestra el nombre o
  // miniatura del archivo seleccionado antes de confirmar".
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<MinimalSpeechRecognition | null>(null);
  const latestTranscriptRef = useRef('');
  const speechSafetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Atajo global (Cmd/Ctrl+K, estandar de "command palette" -- Linear,
  // Vercel, Raycast): salta directo al input de captura desde cualquier
  // parte del tablero, sin buscar ni hacer scroll hasta arriba. preventDefault
  // es necesario porque Ctrl+K ya tiene un significado nativo en algunos
  // navegadores (barra de busqueda).
  useEffect(() => {
    function handleGlobalKeyDown(event: globalThis.KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        textInputRef.current?.focus();
      }
    }
    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  function clearSpeechSafetyTimer() {
    if (speechSafetyTimerRef.current) {
      clearTimeout(speechSafetyTimerRef.current);
      speechSafetyTimerRef.current = null;
    }
  }

  useEffect(() => {
    setSpeechSupported(getSpeechRecognitionCtor() !== null);
    return () => {
      clearSpeechSafetyTimer();
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

  /**
   * Acepta un valor opcional para poder enviar el dictado por voz de
   * inmediato al terminar de hablar, sin depender del estado `text` (que
   * todavia no se habria repintado en el mismo tick) ni de un tercer toque
   * manual en "Registrar" -- "sin tipeo manual" incluye no tener que tocar
   * nada despues de dictar.
   */
  function submitText(overrideValue?: string) {
    const trimmed = (overrideValue ?? text).trim();
    if (!trimmed) return;
    setFeedback(null);
    startTransition(async () => {
      try {
        const result = await processIncomingCapture({ space_id: spaceId, capture_source: 'ai_text', raw_text: trimmed });
        if (!result.success) {
          setFeedback({ kind: 'error', message: result.error });
          return;
        }
        setText('');
        setFeedback({
          kind: 'success',
          message: result.needsReview ? 'Registrado. Vale la pena confirmar un par de detalles.' : 'Registrado. Tu mapa sigue intacto.',
        });
        router.refresh();
        scrollToPendingTransaction(result.transactionId);
      } catch (error) {
        // Auditoria P9: sin este catch, una caida de red o un timeout del
        // servidor a mitad de la captura dejaba el boton "Registrar" activo
        // de nuevo sin ningun aviso -- la persona no sabia si su movimiento
        // quedo guardado o no. El texto escrito se conserva a proposito (no
        // se limpia el input) para que reintentar sea con un solo toque.
        console.error('Error de red al registrar el movimiento:', error);
        setFeedback({ kind: 'error', message: 'Se perdio la conexion antes de terminar. Revisa tu internet e intenta de nuevo.' });
      }
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

  async function handleFileSelected(file: File) {
    setFeedback(null);
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      setFeedback({ kind: 'error', message: `El archivo pesa mas de ${MAX_FILE_SIZE_MB}MB. Usa uno mas liviano.` });
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(file);
    setPreviewUrl(file.type.startsWith('image/') ? URL.createObjectURL(file) : null);

    // La miniatura ya se ve con el archivo original; la compresion corre en
    // paralelo y reemplaza el archivo a subir cuando termina, sin bloquear
    // la vista previa ni el resto de la interfaz.
    if (file.type.startsWith('image/') && file.size > COMPRESS_THRESHOLD_BYTES) {
      setIsCompressing(true);
      const compressed = await compressImageIfNeeded(file);
      setIsCompressing(false);
      setSelectedFile((current) => (current === file ? compressed : current));
    }
  }

  function submitSelectedFile() {
    const file = selectedFile;
    if (!file) return;
    setFeedback(null);
    startTransition(async () => {
      try {
        // Enforcement de plan (Bloque P9): se valida ANTES de subir a
        // Storage -- rechazar despues de ya haber subido el archivo
        // desperdiciaria el cupo que justo se esta protegiendo.
        const quotaCheck = await checkStorageQuota(spaceId, file.size);
        if (!quotaCheck.allowed) {
          setFeedback({ kind: 'error', message: quotaCheck.error });
          return;
        }

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
          if (result.illegible) clearSelectedFile();
          setFeedback({ kind: result.illegible ? 'illegible' : 'error', message: result.error });
          return;
        }

        clearSelectedFile();
        setFeedback({
          kind: 'success',
          message: result.needsReview ? 'Documento registrado. Vale la pena confirmar un par de detalles.' : 'Documento registrado. Tu mapa sigue intacto.',
        });
        router.refresh();
        scrollToPendingTransaction(result.transactionId);
      } catch (error) {
        // Auditoria P9 (mismo hallazgo que submitText): el archivo NO se
        // descarta -- selectedFile sigue intacto para reintentar sin tener
        // que elegirlo de nuevo desde la camara/galeria.
        console.error('Error de red al subir el documento:', error);
        setFeedback({ kind: 'error', message: 'Se perdio la conexion antes de terminar. Revisa tu internet e intenta de nuevo.' });
      }
    });
  }

  /** El boton "Registrar" hace lo que corresponda: si hay un archivo esperando confirmacion, lo envia; si no, envia el texto. */
  function handleRegistrar() {
    if (selectedFile) submitSelectedFile();
    else submitText();
  }

  function toggleListening() {
    if (isListening) {
      clearSpeechSafetyTimer();
      recognitionRef.current?.stop();
      return;
    }

    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;

    const recognition = new Ctor();
    recognition.lang = 'es-CO';
    recognition.interimResults = true;
    // continuous=true: el motor de voz NO corta la grabacion en la primera
    // pausa natural del habla (respirar, pensar el monto) -- solo termina
    // cuando el usuario vuelve a tocar el boton. Con continuous=false (el
    // valor anterior) una pausa de medio segundo bastaba para cortar el
    // dictado a mitad de frase, perdiendo el resto del mensaje.
    recognition.continuous = true;

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? '')
        .join(' ');
      latestTranscriptRef.current = transcript;
      setText(transcript);
    };
    recognition.onerror = () => {
      clearSpeechSafetyTimer();
      setIsListening(false);
      setFeedback({ kind: 'error', message: 'No se pudo escuchar el microfono. Intenta de nuevo o escribe.' });
    };
    // Widget de voz ultrarrapido: en cuanto termina de hablar, se envia solo
    // -- no hace falta tocar "Registrar" despues de dictar.
    recognition.onend = () => {
      clearSpeechSafetyTimer();
      setIsListening(false);
      const finalTranscript = latestTranscriptRef.current.trim();
      if (finalTranscript) submitText(finalTranscript);
    };

    recognitionRef.current = recognition;
    latestTranscriptRef.current = '';
    setFeedback(null);
    setIsListening(true);
    recognition.start();

    // Temporizador de seguridad: si el usuario se distrae y nunca vuelve a
    // tocar el boton para detener el dictado, continuous=true dejaria el
    // microfono escuchando indefinidamente. A los 75s se fuerza el stop
    // (dispara onend igual que un stop manual, asi que si ya alcanzo a
    // dictar algo se envia solo).
    const SPEECH_SAFETY_TIMEOUT_MS = 75_000;
    speechSafetyTimerRef.current = setTimeout(() => {
      recognitionRef.current?.stop();
    }, SPEECH_SAFETY_TIMEOUT_MS);
  }

  // RBAC (Bloque P4): un Visor no puede capturar nada -- se muestra un aviso
  // en vez de una consola completa que terminaria en un error de RLS al
  // tocar "Registrar".
  if (!canEdit) {
    return (
      <section
        id="quick-capture"
        className="sticky top-4 z-20 rounded-xl border border-white/10 bg-elevated/95 px-4 py-3 text-sm text-stone-500 shadow-2xl shadow-black/40 backdrop-blur sm:px-5"
      >
        Tu rol de Visor en este espacio solo permite consultar -- no puedes registrar movimientos.
      </section>
    );
  }

  return (
    <section
      id="quick-capture"
      className="command-glow sticky top-4 z-20 rounded-xl border border-white/10 bg-elevated/95 px-4 py-3 shadow-2xl shadow-black/40 backdrop-blur transition-colors sm:px-5"
    >
      <AnimatePresence initial={false}>
        {selectedFile && (
          <motion.div
            className="mb-2 flex items-center gap-2 overflow-hidden rounded-lg border border-white/10 bg-page px-3 py-2"
            variants={COLLAPSE_VARIANTS}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
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
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => cameraInputRef.current?.click()}
          disabled={isPending}
          title="Tomar una foto"
          aria-label="Tomar una foto"
          className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg border border-white/10 p-2.5 text-stone-400 transition hover:border-gold/30 hover:text-gold disabled:opacity-50"
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
          className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg border border-white/10 p-2.5 text-stone-400 transition hover:border-gold/30 hover:text-gold disabled:opacity-50"
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
          <div className="relative shrink-0">
            {isListening && (
              <>
                <span className="absolute inset-0 animate-ping rounded-lg bg-gold/30" />
                <span className="absolute inset-0 animate-ping rounded-lg bg-gold/20 [animation-delay:0.35s]" />
              </>
            )}
            <button
              type="button"
              onClick={toggleListening}
              disabled={isPending}
              title={isListening ? 'Detener y enviar' : 'Dictar por voz'}
              aria-label={isListening ? 'Detener y enviar' : 'Dictar por voz'}
              className={cn(
                'relative flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg border p-2.5 transition disabled:opacity-50',
                isListening
                  ? 'border-gold/50 bg-gold/10 text-gold'
                  : 'border-white/10 text-stone-400 hover:border-gold/30 hover:text-gold',
              )}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-4 w-4">
                <rect x="9" y="2" width="6" height="12" rx="3" strokeLinecap="round" strokeLinejoin="round" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 11a7 7 0 0 0 14 0M12 18v4" />
              </svg>
            </button>
          </div>
        )}

        <div className="relative min-w-0 flex-1">
          <input
            ref={textInputRef}
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
            className="peer w-full rounded-lg border border-white/10 bg-page px-3 py-2.5 text-sm text-stone-100 placeholder:text-stone-600 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 disabled:opacity-60"
          />
          {/* Pista de atajo global (Cmd/Ctrl+K) -- solo visible con el campo vacio y sin foco, via peer-placeholder-shown/peer-focus (sin JS extra para esto). */}
          <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-medium text-stone-500 opacity-0 transition-opacity peer-placeholder-shown:opacity-100 peer-focus:opacity-0 sm:flex">
            ⌘K
          </kbd>
        </div>

        <button
          type="button"
          onClick={handleRegistrar}
          disabled={isPending || (!text.trim() && !selectedFile)}
          className="shrink-0 rounded-lg bg-wealth px-4 py-2.5 text-sm font-medium text-white transition hover:bg-wealth-hover disabled:opacity-50"
        >
          {isPending ? '...' : 'Registrar'}
        </button>

        <div className="hidden shrink-0 gap-2 sm:flex">
          <BulkImportModal spaceId={spaceId} />
          <XmlInvoiceUploadModal spaceId={spaceId} />
        </div>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {feedback && feedback.kind === 'illegible' && (
          <motion.div
            key="illegible"
            className="mt-2 overflow-hidden rounded-lg border border-gold/30 bg-gold-soft px-3 py-2"
            variants={COLLAPSE_VARIANTS}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <p className="text-xs text-stone-100">{feedback.message}</p>
          </motion.div>
        )}
        {feedback && feedback.kind !== 'illegible' && (
          <motion.div
            key="feedback"
            className="mt-2 flex items-center gap-1.5 overflow-hidden"
            variants={COLLAPSE_VARIANTS}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            {feedback.kind === 'success' && (
              <motion.svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                className="h-3.5 w-3.5 shrink-0 text-growth"
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={SPRING_SNAPPY}
              >
                <motion.path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.3, ease: 'easeOut', delay: 0.05 }}
                />
              </motion.svg>
            )}
            <p className={cn('text-xs', feedback.kind === 'success' ? 'text-growth' : 'text-red-400')}>{feedback.message}</p>
          </motion.div>
        )}
        {!feedback && isCompressing && (
          <motion.p key="compressing" className="mt-2 text-xs text-stone-500" variants={COLLAPSE_VARIANTS} initial="hidden" animate="visible" exit="exit">
            Optimizando imagen...
          </motion.p>
        )}
        {!feedback && !isCompressing && showSlowNotice && (
          <motion.p key="slow" className="mt-2 text-xs text-stone-500" variants={COLLAPSE_VARIANTS} initial="hidden" animate="visible" exit="exit">
            La IA esta interpretando tu movimiento, ya casi...
          </motion.p>
        )}
      </AnimatePresence>
    </section>
  );
}
