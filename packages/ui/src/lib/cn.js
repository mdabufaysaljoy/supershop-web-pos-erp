/** Joins truthy class names (apps run tailwind-merge where needed; this package stays dependency-light). */
export const cn = (...classes) => classes.filter(Boolean).join(' ');
