/**
 * Account area. Nothing personal is rendered on the server (the pages stay cacheable, D-036) and
 * nothing here belongs in a search index.
 */
export const metadata = { robots: { index: false, follow: false } };

export default function AccountLayout({ children }) {
  return children;
}
