import { notFound } from 'next/navigation';

/** Any unmatched path inside a language renders that language's not-found page (HTTP 404). */
export default function CatchAll() {
  notFound();
}
