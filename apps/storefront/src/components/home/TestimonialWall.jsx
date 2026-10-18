/**
 * Customer Testimonials & Verified Buyer Reviews
 * Smoothly auto-slides slowly from right to left with pause-on-hover.
 */
export function TestimonialWall() {
  const reviews = [
    {
      name: 'Fahad Al-Otaibi',
      city: 'Riyadh',
      verified: true,
      rating: 5,
      product: 'Smart Wireless ANC Headphones',
      comment:
        'Fast delivery in less than 24 hours in Riyadh. The sound quality and active noise cancellation are unbelievable for this price.',
    },
    {
      name: 'Sara Al-Ghamdi',
      city: 'Jeddah',
      verified: true,
      rating: 5,
      product: 'Minimalist Travel Backpack & Power Bank',
      comment:
        'Everything arrived securely packed with official Saudi warranty. Splitting with Tabby made checkout totally seamless.',
    },
    {
      name: 'Khalid Al-Dossary',
      city: 'Khobar',
      verified: true,
      rating: 5,
      product: 'Ergonomic Mechanical Keyboard',
      comment:
        'Excellent customer service and 100% genuine products. The Arabic keyboard layout is durable and top notch.',
    },
    {
      name: 'Nouf Al-Shehri',
      city: 'Abha',
      verified: true,
      rating: 5,
      product: 'Smart Fitness Tracker & Health Band',
      comment:
        'Arrived in pristine condition in Abha. Accurate battery life, heart-rate tracking, and Arabic notifications work perfectly.',
    },
    {
      name: 'Mohammed Al-Zahrani',
      city: 'Mecca',
      verified: true,
      rating: 5,
      product: 'Ultra-Fast GaN 65W Multi-Port Charger',
      comment:
        'Super compact charger for my phone and laptop. Authentic certified electronics, no heating issues whatsoever.',
    },
    {
      name: 'Reem Al-Harbi',
      city: 'Medina',
      verified: true,
      rating: 5,
      product: 'Oversized Streetwear Cotton Hoodie',
      comment:
        'Fabric is ultra soft and premium heavyweight cotton. Accurate sizing chart and fast doorstep dispatch.',
    },
    {
      name: 'Abdullah Al-Qahtani',
      city: 'Dammam',
      verified: true,
      rating: 5,
      product: 'Wireless Gaming Mouse with RGB',
      comment:
        'Next-day delivery in Eastern Province. Precision sensor, zero lag, and competitive pricing compared to local retail.',
    },
    {
      name: 'Lina Al-Mutairi',
      city: 'Qassim',
      verified: true,
      rating: 5,
      product: 'MagSafe Leather Phone Wallet Stand',
      comment:
        'Strong magnets, luxurious leather finish, and quick customer support tracking updates. Highly recommended supershop!',
    },
  ];

  // Duplicate list so the marquee loop connects seamlessly
  const looped = [...reviews, ...reviews];

  return (
    <section aria-label="Customer Reviews" className="grid gap-6 overflow-hidden py-4">
      <div className="flex flex-col items-center text-center">
        <span className="flex items-center gap-1.5 rounded-full bg-primary/10 px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-primary">
          <span aria-hidden="true">⭐</span>
          Verified Customer Feedback
        </span>
        <h2 className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Loved by Thousands across Saudi Arabia
        </h2>
        <p className="mt-1 max-w-lg text-sm text-muted-foreground">
          Real experiences from verified shoppers across Riyadh, Jeddah, Dammam, and beyond.
        </p>
      </div>

      {/* Slowly sliding right-to-left marquee container */}
      <div className="relative w-full overflow-hidden mask-[linear-gradient(to_right,transparent_0%,black_10%,black_90%,transparent_100%)]">
        <div className="animate-marquee flex gap-5 py-2">
          {looped.map((r, i) => (
            <div
              key={i}
              className="flex w-[320px] sm:w-[360px] shrink-0 flex-col justify-between rounded-2xl border border-border/80 bg-card p-5 shadow-xs transition-transform duration-300 hover:scale-[1.02] hover:shadow-md select-none"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex text-amber-500 text-sm" aria-label={`${r.rating} stars`}>
                    {Array.from({ length: r.rating }).map((_, idx) => (
                      <span key={idx} aria-hidden="true">
                        ★
                      </span>
                    ))}
                  </div>
                  <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600">
                    <span className="size-1 rounded-full bg-emerald-500" />
                    Verified Buyer
                  </span>
                </div>

                <blockquote className="text-sm text-foreground/90 leading-relaxed italic line-clamp-3">
                  “{r.comment}”
                </blockquote>
              </div>

              <div className="mt-4 border-t border-border/60 pt-3 flex items-center justify-between text-xs">
                <div>
                  <p className="font-bold text-foreground">{r.name}</p>
                  <p className="text-muted-foreground">{r.city}, KSA</p>
                </div>
                <p className="text-[11px] font-medium text-primary truncate max-w-[150px]">
                  {r.product}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
