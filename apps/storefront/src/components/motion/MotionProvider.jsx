'use client';

import { domAnimation, LazyMotion, MotionConfig } from 'motion/react';

/**
 * Motion for the whole storefront: only the small DOM animation feature set is loaded (`m.*`
 * components), and every animation respects the visitor's "reduce motion" setting.
 */
export function MotionProvider({ children }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
