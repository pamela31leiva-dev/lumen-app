'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { confirmTransaction, moveTransactionToSpace, rejectPendingTransaction } from '@/actions/confirm';
import { getReceiptSignedUrl } from '@/actions/dashboard';
import { saveClassificationHint } from '@/actions/classification';
import { getConfirmationInsight } from '@/actions/insights';
import { CustomSelect } from '@/components/ui/CustomSelect';
import type { TransactionType } from '@/domain/types/capture';
import type { AccountBalance, CategoryOption, PendingTransactionSummary } from '@/domain/types/dashboard';
import { cn } from '@/lib/utils';

const TYPE_LABEL: Record<TransactionType, string> = {
  income: 'Ingreso',
  expense: 'Gasto',
  transfer: 'Transferencia',
};

interface PendingConfirmationCardProps {
  transaction: PendingTransactionSummary;
  spaceId: string;
  accounts: AccountBalance[];
  categories: CategoryOption[];
  baseCurrency: string;
}

export function PendingConfirmationCard({
  transaction,
  spaceId,
  accounts,
  categories,
  baseCurrency,
}: PendingConfirmationCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [clarificationAnswered, setClarificationAnswered] = useState(false);
  const [clarificationAnswer, setClarificationAnswer] = useState('');
  const [spaceSuggestionDismissed, setSpaceSuggestionDismissed] = useState(false);
  const [tagsInput, setTagsInput] = useState(transaction.tags.join(', '));
  // Optimista de verdad: al tocar Confirmar/Descartar, la tarjeta cambia a
  // un estado de "listo" DE INMEDIATO, antes de que la mutacion real llegue
  // a Supabase -- nunca se espera la red para que la interfaz reaccione. Si
  // la mutacion en segundo plano falla, se revierte (vuelve el formulario)
  // y se explica por que ahi mismo, sin popups ni alertas intrusivas.
  const [optimisticOutcome, setOptimisticOutcome] = useState<{ kind: 'confirm' | 'reject' | 'move'; message: string } | null>(
    null,
  );

  const [type, setType] = useState<TransactionType>(transaction.type);
  const [accountId, setAccountId] = useState(transaction.accountId ?? '');
  const [destinationAccountId, setDestinationAccountId] = useState('');
  const [categoryId, setCategoryId] = useState(transaction.categoryId ?? '');
  const [amount, setAmount] = useState(String(transaction.amountOriginal));
  const [currency, setCurrency] = useState(transaction.currencyOriginal);
  const [exchangeRate, setExchangeRate] = useState('1');
  const [description, setDescription] = useState(transaction.description ?? '');
  const [date, setDate] = useState(transaction.transactionDate.slice(0, 10));
  // Simplicidad Absoluta: no mostrar moneda/tasa de cambio salvo que realmente aplique.
  const [showCurrencyDetails, setShowCurrencyDetails] = useState(transaction.currencyOriginal !== baseCurrency);

  const activeAccounts = accounts.filter((a) => a.isActive);
  const relevantCategories = categories.filter((c) => c.kind === (type === 'income' ? 'income' : 'expense'));
  const confidencePct = transaction.confidenceScore !== null ? Math.round(transaction.confidenceScore * 100) : null;

  // Cero Friccion: si la IA esta razonablemente segura y no hay nada que
  // resolver (ambiguedad, sugerencia de espacio, dudas), no hace falta
  // mostrar el formulario completo -- un toque en "Confirmar" basta. La
  // persona sigue pudiendo abrir el detalle si quiere ajustar algo.
  const isHighConfidence =
    confidencePct !== null &&
    confidencePct >= 85 &&
    transaction.uncertainties.length === 0 &&
    !transaction.clarificationQuestion &&
    !transaction.suggestedSpaceId;
  const [expanded, setExpanded] = useState(!isHighConfidence);

  function handleConfirm() {
    setError(null);
    const parsedAmount = Number(amount);
    // "Cuenta" NUNCA bloquea: si queda vacia, el servidor asigna la primera
    // cuenta del espacio (o crea "Efectivo" si no hay ninguna, ver
    // resolveAccountId en actions/confirm.ts -- funciona exista o no la
    // migracion 0012_default_account_per_space). Un transfer si necesita
    // las dos cuentas explicitas -- ahi no hay forma segura de adivinar.
    if (type === 'transfer' && (!accountId || !destinationAccountId || destinationAccountId === accountId)) {
      setError('Selecciona cuenta origen y destino, distintas entre si.');
      return;
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError('El monto debe ser mayor que cero.');
      return;
    }

    const transactionIso = new Date(date).toISOString();
    const finalCategoryId = type === 'transfer' ? null : categoryId || null;

    // Optimista: la tarjeta pasa a su estado de "listo" ya mismo, con un
    // mensaje generico que no depende de ninguna respuesta de red.
    setOptimisticOutcome({ kind: 'confirm', message: 'Listo. Un pendiente menos en tu espacio.' });

    startTransition(async () => {
      const result = await confirmTransaction({
        transaction_id: transaction.id,
        space_id: spaceId,
        type,
        account_id: accountId || '',
        destination_account_id: type === 'transfer' ? destinationAccountId : null,
        category_id: finalCategoryId,
        amount_original: parsedAmount,
        currency_original: currency,
        exchange_rate: Number(exchangeRate) || 1,
        description: description || null,
        transaction_date: transactionIso,
        receipt_id: transaction.receiptId,
        tags: tagsInput
          .split(',')
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean),
      });

      if (!result.success) {
        // Rollback silencioso: vuelve el formulario con lo que la persona ya
        // habia editado, y explica que paso ahi mismo -- nada de alertas.
        setOptimisticOutcome(null);
        setError(result.error);
        return;
      }

      router.refresh();

      // El insight es una mejora sobre el mensaje generico, no un requisito
      // para que la tarjeta reaccione -- si tarda o falla, el mensaje
      // generico ya mostrado sigue siendo perfectamente valido.
      getConfirmationInsight({
        spaceId,
        type,
        categoryId: finalCategoryId,
        transactionDate: transactionIso,
      })
        .then((message) => setOptimisticOutcome((current) => (current?.kind === 'confirm' ? { ...current, message } : current)))
        .catch(() => {});
    });
  }

  function handleReject() {
    setError(null);
    setOptimisticOutcome({ kind: 'reject', message: 'Descartado. Menos ruido en tu bandeja.' });
    startTransition(async () => {
      const result = await rejectPendingTransaction(transaction.id, spaceId);
      if (!result.success) {
        setOptimisticOutcome(null);
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function saveClarificationAnswer(answer: string, appendToDescription: boolean) {
    if (!transaction.clarificationQuestion) return;
    setError(null);
    startTransition(async () => {
      const result = await saveClassificationHint({
        space_id: spaceId,
        transaction_id: transaction.id,
        question: transaction.clarificationQuestion!,
        answer,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      if (appendToDescription) {
        setDescription((current) => (current ? `${current} — ${answer}` : answer));
      }
      setClarificationAnswered(true);
    });
  }

  function handleSaveClarification() {
    const trimmed = clarificationAnswer.trim();
    if (!trimmed) {
      setError('Escribe una respuesta breve.');
      return;
    }
    saveClarificationAnswer(trimmed, true);
  }

  /** Botones de un toque (ej. "Gasto"/"Ingreso") en vez de texto libre. */
  function handleTapClarificationOption(option: string) {
    const normalized = option.trim().toLowerCase();
    if (normalized === 'gasto') setType('expense');
    else if (normalized === 'ingreso') setType('income');
    saveClarificationAnswer(option, false);
  }

  function handleMoveToSuggestedSpace() {
    if (!transaction.suggestedSpaceId) return;
    setError(null);
    setOptimisticOutcome({ kind: 'move', message: `Movido a ${transaction.suggestedSpaceName}.` });
    startTransition(async () => {
      const result = await moveTransactionToSpace(transaction.id, spaceId, transaction.suggestedSpaceId!);
      if (!result.success) {
        setOptimisticOutcome(null);
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function handleViewDocument() {
    const receiptId = transaction.receiptId;
    if (!receiptId) return;
    startTransition(async () => {
      const result = await getReceiptSignedUrl(receiptId, spaceId);
      if ('error' in result) {
        setError(result.error);
        return;
      }
      setDocumentUrl(result.url);
    });
  }

  // Vista optimista: reemplaza la tarjeta editable de inmediato al tocar
  // Confirmar/Descartar/Mover, sin esperar la respuesta del servidor. Sigue
  // viva unos instantes (el mensaje puede mejorar con el insight real) hasta
  // que router.refresh() trae la lista actualizada y este componente deja de
  // montarse -- nunca desaparece en silencio, siempre "contesta" algo.
  if (optimisticOutcome) {
    const isNeutral = optimisticOutcome.kind === 'reject';
    return (
      <div
        className={cn(
          'animate-fade-scale-in flex items-center gap-3 rounded-xl border p-5 transition-all duration-300',
          isNeutral ? 'border-white/10 bg-elevated' : 'border-growth/25 bg-growth/5',
        )}
      >
        <span
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
            isNeutral ? 'bg-white/5 text-stone-400' : 'bg-growth/15 text-growth',
          )}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
          </svg>
        </span>
        <p className="text-sm text-stone-100">{optimisticOutcome.message}</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-scale-in rounded-xl border border-white/10 bg-elevated p-5 transition-all duration-300 hover:border-gold/15">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-stone-100">{transaction.description ?? 'Movimiento sin descripcion'}</p>
          <p className="amount text-xs text-stone-500">
            Detectado por IA · {transaction.amountOriginal.toLocaleString('es-CO')} {transaction.currencyOriginal}
          </p>
        </div>
        {confidencePct !== null && (
          <span
            className={cn(
              'shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium',
              confidencePct >= 85
                ? 'bg-emerald-600/15 text-emerald-400'
                : 'bg-gold/15 text-gold',
            )}
          >
            Confianza {confidencePct}%
          </span>
        )}
      </div>

      {transaction.suggestedSpaceId && transaction.suggestedSpaceName && !spaceSuggestionDismissed && (
        <div className="animate-fade-scale-in mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-600/30 bg-emerald-600/10 p-3">
          <p className="text-sm text-stone-100">
            Esto parece ser de <span className="font-medium text-emerald-400">{transaction.suggestedSpaceName}</span>, no
            de este espacio.
          </p>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={handleMoveToSuggestedSpace}
              disabled={isPending}
              className="rounded-lg bg-emerald-600/90 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-600 disabled:opacity-50"
            >
              Mover a {transaction.suggestedSpaceName}
            </button>
            <button
              type="button"
              onClick={() => setSpaceSuggestionDismissed(true)}
              disabled={isPending}
              className="rounded-lg px-3 py-1.5 text-xs text-stone-400 hover:text-stone-200"
            >
              Dejar aqui
            </button>
          </div>
        </div>
      )}

      {transaction.clarificationQuestion && !clarificationAnswered && (
        <div className="animate-fade-scale-in mt-3 rounded-lg border border-gold/30 bg-gold/10 p-3">
          <p className="text-sm text-stone-100">🤔 {transaction.clarificationQuestion}</p>

          {transaction.clarificationOptions.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {transaction.clarificationOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => handleTapClarificationOption(option)}
                  disabled={isPending}
                  className="rounded-lg bg-gold/90 px-4 py-2 text-sm font-medium text-obsidian transition hover:bg-gold disabled:opacity-50"
                >
                  {option}
                </button>
              ))}
            </div>
          ) : (
            <div className="mt-2 flex gap-2">
              <input
                value={clarificationAnswer}
                onChange={(e) => setClarificationAnswer(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSaveClarification();
                  }
                }}
                placeholder="Responde en pocas palabras..."
                disabled={isPending}
                className="min-w-0 flex-1 rounded-lg border border-white/10 bg-obsidian px-3 py-2 text-sm text-stone-100 placeholder:text-stone-600 focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
              />
              <button
                type="button"
                onClick={handleSaveClarification}
                disabled={isPending || !clarificationAnswer.trim()}
                className="shrink-0 rounded-lg bg-gold/90 px-3 py-2 text-sm font-medium text-obsidian transition hover:bg-gold disabled:opacity-50"
              >
                Guardar
              </button>
            </div>
          )}

          <p className="mt-1.5 text-[11px] text-stone-500">
            La proxima vez que registres algo parecido, Lumen ya sabra clasificarlo asi.
          </p>
        </div>
      )}

      {transaction.uncertainties.length > 0 && (
        <p className="mt-2 text-xs text-gold">
          Vale la pena revisar: {transaction.uncertainties.join(', ')}
        </p>
      )}

      {transaction.receiptId && (
        <button
          type="button"
          onClick={handleViewDocument}
          className="mt-2 text-xs text-emerald-400 underline decoration-emerald-400/40 underline-offset-2 hover:text-emerald-300"
        >
          Ver documento adjunto
        </button>
      )}
      {documentUrl && (
        <a
          href={documentUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-1 block text-xs text-stone-400 underline"
        >
          Abrir enlace (expira en 60s)
        </a>
      )}

      {!expanded ? (
        <div className="mt-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="text-xs text-stone-500 underline decoration-white/20 underline-offset-2 hover:text-stone-300"
          >
            Ver detalles
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleReject}
              disabled={isPending}
              className="rounded-lg px-3 py-2 text-sm text-stone-400 hover:text-red-400 disabled:opacity-50"
            >
              Descartar
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isPending}
              className={cn(
                'rounded-lg bg-wealth px-5 py-2 text-sm font-medium text-white transition hover:bg-wealth-hover',
                isPending && 'opacity-60',
              )}
            >
              {isPending ? 'Guardando...' : 'Confirmar'}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-300">Tipo</label>
              <CustomSelect
                value={type}
                onChange={(value) => setType(value as TransactionType)}
                options={Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label }))}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-stone-300">
                {type === 'transfer' ? 'Cuenta origen' : 'Cuenta (opcional)'}
              </label>
              <CustomSelect
                value={accountId}
                onChange={setAccountId}
                placeholder="Automatica si no eliges"
                emptyLabel="Se creara una cuenta automatica al confirmar"
                options={activeAccounts.map((a) => ({ value: a.accountId, label: a.name }))}
              />
            </div>

            {type === 'transfer' ? (
              <div>
                <label className="mb-1 block text-xs font-medium text-stone-300">Cuenta destino</label>
                <CustomSelect
                  value={destinationAccountId}
                  onChange={setDestinationAccountId}
                  placeholder="Selecciona..."
                  emptyLabel="No hay otra cuenta disponible"
                  options={activeAccounts
                    .filter((a) => a.accountId !== accountId)
                    .map((a) => ({ value: a.accountId, label: a.name }))}
                />
              </div>
            ) : (
              <div>
                <label className="mb-1 block text-xs font-medium text-stone-300">Categoria</label>
                <CustomSelect
                  value={categoryId}
                  onChange={setCategoryId}
                  options={[{ value: '', label: 'Sin categoria' }, ...relevantCategories.map((c) => ({ value: c.id, label: c.name }))]}
                />
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs font-medium text-stone-300">Monto</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-obsidian px-3 py-2 amount text-sm text-stone-100 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
              />
            </div>

            {showCurrencyDetails ? (
              <>
                <div>
                  <label className="mb-1 block text-xs font-medium text-stone-300">Moneda</label>
                  <input
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value.toUpperCase().slice(0, 3))}
                    maxLength={3}
                    className="w-full rounded-lg border border-white/10 bg-obsidian px-3 py-2 text-sm text-stone-100 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-stone-300">Tasa de cambio</label>
                  <input
                    type="number"
                    min="0"
                    step="0.0001"
                    value={exchangeRate}
                    onChange={(e) => setExchangeRate(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-obsidian px-3 py-2 amount text-sm text-stone-100 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
                  />
                </div>
              </>
            ) : (
              <div className="flex items-end sm:col-span-2">
                <button
                  type="button"
                  onClick={() => setShowCurrencyDetails(true)}
                  className="text-xs text-stone-500 underline decoration-white/20 underline-offset-2 hover:text-stone-300"
                >
                  ¿Es en otra moneda? Actualmente en {currency}
                </button>
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs font-medium text-stone-300">Fecha</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-obsidian px-3 py-2 text-sm text-stone-100 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-stone-300">Descripcion</label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-obsidian px-3 py-2 text-sm text-stone-100 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-stone-300">Etiquetas (opcional)</label>
              <input
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="ej. lonchera, colegio"
                className="w-full rounded-lg border border-white/10 bg-obsidian px-3 py-2 text-sm text-stone-100 placeholder:text-stone-600 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
              />
              <p className="mt-1 text-[11px] text-stone-500">Separadas por comas. Sirven para agrupar iniciativas dentro de este espacio.</p>
            </div>
          </div>

          {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

          <div className="mt-4 flex justify-end gap-2">
            {isHighConfidence && (
              <button
                type="button"
                onClick={() => setExpanded(false)}
                disabled={isPending}
                className="mr-auto text-xs text-stone-500 underline decoration-white/20 underline-offset-2 hover:text-stone-300"
              >
                Ocultar detalles
              </button>
            )}
            <button
              type="button"
              onClick={handleReject}
              disabled={isPending}
              className="rounded-lg px-3 py-2 text-sm text-stone-400 hover:text-red-400 disabled:opacity-50"
            >
              Descartar
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isPending}
              className={cn(
                'rounded-lg bg-wealth px-4 py-2 text-sm font-medium text-white transition hover:bg-wealth-hover',
                isPending && 'opacity-60',
              )}
            >
              {isPending ? 'Guardando...' : 'Confirmar'}
            </button>
          </div>
        </>
      )}

      {!expanded && error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}
