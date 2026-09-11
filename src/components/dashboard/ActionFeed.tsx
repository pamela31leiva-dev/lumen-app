import { ProactiveAssistantBanner } from '@/components/dashboard/ProactiveAssistantBanner';
import { PendingConfirmationCard } from '@/components/dashboard/PendingConfirmationCard';
import { DailyCheckInBubble } from '@/components/dashboard/DailyCheckInBubble';
import { BillAlerts } from '@/components/dashboard/BillAlerts';
import type { AccountBalance, CategoryOption, PendingTransactionSummary } from '@/domain/types/dashboard';
import type { RecurringObligation } from '@/domain/types/analytics';
import type { BillSummary } from '@/actions/bills';

interface ActionFeedProps {
  spaceId: string;
  baseCurrency: string;
  pendingTransactions: PendingTransactionSummary[];
  recurringObligations: RecurringObligation[];
  hasActivityToday: boolean;
  accounts: AccountBalance[];
  categories: CategoryOption[];
  bills: BillSummary[];
}

/**
 * Bloque (b) del Executive Action Board: un unico feed priorizado con todo lo
 * que requiere una decision hoy — primero las alertas del motor de patrones
 * (recurrencias vencidas / check-in nocturno), luego las confirmaciones
 * pendientes de la bandeja. "Cero Ruido": nada que no requiera una decision
 * hoy vive aqui (el detalle por cuenta, por ejemplo, esta en otro bloque).
 */
export function ActionFeed({
  spaceId,
  baseCurrency,
  pendingTransactions,
  recurringObligations,
  hasActivityToday,
  accounts,
  categories,
  bills,
}: ActionFeedProps) {
  const hasPending = pendingTransactions.length > 0;
  const hasOverdueObligation = recurringObligations.some((o) => o.isOverdue);
  const hasUrgentBill = bills.some((b) => b.daysUntilDue <= 3);

  return (
    <section>
      <h2 className="mb-3 text-sm font-medium text-stone-200">
        Requiere tu atencion {hasPending && `(${pendingTransactions.length})`}
      </h2>

      <DailyCheckInBubble spaceId={spaceId} hasActivityToday={hasActivityToday} />

      <div className="flex flex-col gap-4">
        <BillAlerts spaceId={spaceId} bills={bills} />

        <ProactiveAssistantBanner spaceId={spaceId} baseCurrency={baseCurrency} recurringObligations={recurringObligations} />

        {pendingTransactions.map((transaction) => (
          <PendingConfirmationCard
            key={transaction.id}
            transaction={transaction}
            spaceId={spaceId}
            accounts={accounts}
            categories={categories}
            baseCurrency={baseCurrency}
          />
        ))}

        {!hasPending && !hasOverdueObligation && !hasUrgentBill && (
          <div className="rounded-xl border border-white/10 bg-elevated p-5 text-sm text-stone-500 transition-colors hover:border-gold/15">
            Todo esta al dia. No hay nada pendiente por revisar en este espacio.
          </div>
        )}
      </div>
    </section>
  );
}
