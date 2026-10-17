/**
 * Campaign status and segment visual styles (P7.3).
 */
export const CAMPAIGN_STATUS_STYLES = Object.freeze({
  draft: 'bg-muted text-muted-foreground border-muted-foreground/30',
  scheduled: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30',
  sending: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 animate-pulse',
  sent: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  cancelled: 'bg-muted text-muted-foreground line-through border-muted-foreground/30',
  failed: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30',
});

export const CAMPAIGN_SEGMENT_STYLES = Object.freeze({
  all: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
  vip: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 font-semibold',
  loyal: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
  active: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  new: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20',
  slipping: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20',
  churn_risk: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
  idle: 'bg-muted text-muted-foreground border-border',
});
