'use client';

import { CheckCircle2, Loader2, Mail } from 'lucide-react';
import { useState } from 'react';

/**
 * Interactive Storefront Newsletter & VIP Club Signup Block.
 * Prevents full-page navigation, seamlessly posts to `/api/v1/newsletter`,
 * and displays inline real-time subscription status without broken redirects.
 */
export function StorefrontNewsletterBlock({
  heading = 'Subscribe for new offer updates',
  text = 'Get exclusive deals, flash discounts, and new arrivals delivered straight to your inbox.',
  buttonLabel = 'Subscribe',
  context = {},
}) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle'); // 'idle' | 'loading' | 'success' | 'error'
  const [feedback, setFeedback] = useState('');
  const [alreadySubscribed, setAlreadySubscribed] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !email.includes('@')) return;

    setStatus('loading');
    setFeedback('');

    try {
      const res = await fetch(context.newsletterAction ?? '/api/v1/newsletter', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          email: email.trim(),
          source: 'storefront_newsletter',
        }),
      });

      const data = await res.json().catch(() => null);

      if (res.ok && (data?.data?.success || data?.success || data?.data?.subscriber)) {
        setStatus('success');
        const isExisting = data?.data?.alreadySubscribed || data?.alreadySubscribed;
        setAlreadySubscribed(Boolean(isExisting));
        setFeedback(
          isExisting
            ? "You're already subscribed to our newsletter! We'll keep you posted on new deals."
            : "Thank you for subscribing! You're now registered to receive new offer updates.",
        );
        setEmail('');
      } else {
        setStatus('error');
        setFeedback(
          data?.error?.details?.[0]?.message ||
            data?.error?.message ||
            'Could not complete subscription. Please verify your email and try again.',
        );
      }
    } catch {
      setStatus('error');
      setFeedback('Network connection error. Please try again in a few moments.');
    }
  };

  return (
    <section className="relative overflow-hidden rounded-3xl border border-border/70 bg-gradient-to-br from-card via-muted/40 to-card p-8 sm:p-12 shadow-xl">
      <div className="absolute -start-24 -bottom-24 size-72 rounded-full bg-primary/10 blur-3xl pointer-events-none" />

      <div className="relative max-w-2xl space-y-4">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
          <span>✨</span> VIP Club
        </span>

        {heading ? (
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
            {heading}
          </h2>
        ) : null}

        {text ? (
          <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">{text}</p>
        ) : null}

        {status === 'success' ? (
          <div
            role="status"
            className="flex items-start gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-50/80 dark:bg-emerald-950/30 p-4 text-emerald-900 dark:text-emerald-100 shadow-sm"
          >
            <CheckCircle2 className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-semibold">
                {alreadySubscribed ? 'Already Subscribed' : 'Subscription Confirmed!'}
              </p>
              <p className="text-xs text-emerald-800 dark:text-emerald-200/90 leading-relaxed">
                {feedback}
              </p>
            </div>
          </div>
        ) : (
          <form
            method="post"
            action={context.newsletterAction ?? '/api/v1/newsletter'}
            onSubmit={handleSubmit}
            className="space-y-3 pt-2"
          >
            <div className="flex max-w-md flex-wrap sm:flex-nowrap gap-2.5">
              <div className="relative min-w-0 flex-1">
                <input
                  type="email"
                  name="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={status === 'loading'}
                  autoComplete="email"
                  aria-label={context.emailLabel ?? 'Email address'}
                  placeholder={context.emailLabel ?? 'Email address'}
                  className="h-12 w-full rounded-full border border-input bg-background px-5 text-sm shadow-xs focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                />
              </div>
              <button
                type="submit"
                disabled={status === 'loading'}
                className="h-12 rounded-full bg-primary px-7 text-sm font-bold text-primary-foreground shadow-md shadow-primary/25 transition-all duration-300 hover:scale-105 hover:bg-primary/90 disabled:opacity-60 disabled:hover:scale-100 cursor-pointer inline-flex items-center justify-center gap-2 shrink-0"
              >
                {status === 'loading' ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Subscribing...
                  </>
                ) : (
                  <>
                    <Mail className="size-4" />
                    {buttonLabel}
                  </>
                )}
              </button>
            </div>

            {status === 'error' && (
              <p role="alert" className="text-xs font-medium text-destructive">
                {feedback}
              </p>
            )}
          </form>
        )}

        <div className="flex flex-wrap items-center gap-4 pt-1 text-xs text-muted-foreground">
          <span>✓ Instant 10% Off coupon</span>
          <span>✓ Early access to flash sales</span>
          <span>✓ Unsubscribe anytime</span>
        </div>
      </div>
    </section>
  );
}
