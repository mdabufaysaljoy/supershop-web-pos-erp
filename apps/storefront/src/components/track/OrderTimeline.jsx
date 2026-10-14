'use client';

import { useT } from '@/i18n/I18nProvider';

/**
 * The delivery progress, drawn from the shared `trackingTimeline` (one definition for storefront
 * and admin). Horizontal on a wide screen, vertical on a phone; direction follows the page, so it
 * reads right-to-left in Arabic without a second layout.
 */
export function OrderTimeline({ timeline, updatedAt, fmt }) {
  const t = useT();

  if (timeline.closed)
    return (
      <div className="rounded-xl border border-dashed p-5">
        <p className="font-medium">{t(`account.orders.status.${timeline.status}`)}</p>
        <p className="text-sm text-muted-foreground">
          {t(`track.closed.${timeline.status}`)}
          {updatedAt ? ` · ${fmt.date(updatedAt)}` : ''}
        </p>
      </div>
    );

  return (
    <ol
      aria-label={t('track.progress')}
      className="grid gap-4 rounded-xl border p-5 sm:grid-cols-4 sm:gap-2"
    >
      {timeline.steps.map((step, index) => {
        const done = step.state === 'done';
        const current = step.state === 'current';
        return (
          <li key={step.key} className="flex items-start gap-3 sm:block">
            <span className="flex items-center gap-2 sm:mb-2 sm:flex">
              <span
                aria-hidden="true"
                className={`grid size-7 shrink-0 place-items-center rounded-full border text-xs font-semibold ${
                  done || current
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'text-muted-foreground'
                }`}
              >
                {done ? '✓' : index + 1}
              </span>
              <span
                aria-hidden="true"
                className={`hidden h-px flex-1 sm:block ${done ? 'bg-primary' : 'bg-border'}`}
              />
            </span>
            <span className="grid gap-0.5">
              <span className={`text-sm font-medium ${current ? '' : 'text-muted-foreground'}`}>
                {t(`track.steps.${step.key}`)}
              </span>
              <span className="text-xs text-muted-foreground">
                {current ? t('track.currentStep') : t(`track.stepHints.${step.key}`)}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
