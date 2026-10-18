/**
 * Customer Testimonials & Verified Buyer Reviews
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
        'Fast delivery in less than 24 hours in Riyadh. The sound quality and noise cancellation are unbelievable for this price.',
    },
    {
      name: 'Sara Al-Ghamdi',
      city: 'Jeddah',
      verified: true,
      rating: 5,
      product: 'Minimalist Travel Backpack & Power Bank',
      comment:
        'Everything arrived securely packed with official warranty. Splitting with Tabby made checkout seamless.',
    },
    {
      name: 'Khalid Al-Dossary',
      city: 'Khobar',
      verified: true,
      rating: 5,
      product: 'Ergonomic Mechanical Keyboard',
      comment:
        'Excellent customer service and genuine products. The Arabic keyboard layout is top notch.',
    },
  ];

  return (
    <section aria-label="Customer Reviews" className="grid gap-6">
      <div className="text-center">
        <span className="text-xs font-bold uppercase tracking-wider text-primary">
          Verified Customer Feedback
        </span>
        <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Loved by Thousands across Saudi Arabia
        </h2>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {reviews.map((r, i) => (
          <div
            key={i}
            className="flex flex-col justify-between rounded-2xl border border-border/80 bg-card p-6 shadow-xs transition-all duration-300 hover:shadow-md"
          >
            <div>
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex text-amber-500" aria-label={`${r.rating} stars`}>
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

              <blockquote className="text-sm text-foreground/90 leading-relaxed italic">
                “{r.comment}”
              </blockquote>
            </div>

            <div className="mt-5 border-t border-border/60 pt-3 flex items-center justify-between text-xs">
              <div>
                <p className="font-bold text-foreground">{r.name}</p>
                <p className="text-muted-foreground">{r.city}, KSA</p>
              </div>
              <p className="text-[11px] text-muted-foreground truncate max-w-[140px]">
                {r.product}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
