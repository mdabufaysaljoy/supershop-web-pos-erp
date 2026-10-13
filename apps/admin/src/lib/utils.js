import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merges class names, letting later Tailwind classes override earlier ones. */
export const cn = (...inputs) => twMerge(clsx(inputs));
