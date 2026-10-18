/**
 * VIP Club & Newsletter Signup Section
 */
export function NewsletterSection() {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-indigo-900/30 bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 p-8 text-white shadow-xl sm:p-12">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -end-16 -top-16 size-72 rounded-full bg-blue-500/20 blur-3xl"
      />

      <div className="relative z-10 flex flex-col items-center justify-between gap-8 lg:flex-row text-center lg:text-start">
        <div className="max-w-xl grid gap-2">
          <div className="inline-flex w-fit items-center gap-1.5 rounded-full bg-indigo-500/20 px-3 py-1 text-xs font-semibold text-indigo-300 mx-auto lg:mx-0">
            <span>✨</span>
            <span>Join 50,000+ Supershop Insiders</span>
          </div>

          <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
            Get 10% Off Your First Order
          </h2>

          <p className="text-sm text-slate-300 leading-relaxed">
            Subscribe for early flash deal drops, secret member promo codes, and weekly new tech
            releases. No spam, ever.
          </p>
        </div>

        <form
          method="post"
          action="/api/v1/newsletter"
          className="flex w-full max-w-md flex-col gap-2.5 sm:flex-row"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const input = form.querySelector('input[type="email"]');
            const btn = form.querySelector('button');
            const email = input?.value;
            if (!email) return;
            if (btn) btn.disabled = true;
            try {
              await fetch('/api/v1/newsletter', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, source: 'storefront_footer_newsletter' }),
              });
              if (btn) {
                btn.textContent = 'Subscribed ✓';
              }
              if (input) input.disabled = true;
            } catch {
              if (btn) btn.disabled = false;
            }
          }}
        >
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            placeholder="Enter your email address"
            className="h-12 w-full rounded-full border border-white/20 bg-white/10 px-5 text-sm text-white placeholder:text-slate-400 outline-none backdrop-blur-md focus:border-white focus:bg-white/15"
          />
          <button
            type="submit"
            className="inline-flex h-12 shrink-0 items-center justify-center rounded-full bg-white px-7 text-xs font-bold text-slate-950 shadow-md transition-all hover:bg-slate-100 hover:scale-[1.02] active:scale-[0.98]"
          >
            Claim 10% Off
          </button>
        </form>
      </div>
    </section>
  );
}
