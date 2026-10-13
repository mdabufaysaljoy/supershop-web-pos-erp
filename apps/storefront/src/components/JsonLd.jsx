import { serializeJsonLd } from '@/lib/structuredData';

/** Renders structured data. Input is escaped by serializeJsonLd (no HTML injection possible). */
export function JsonLd({ data }) {
  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger -- JSON-LD must be raw text; serializeJsonLd escapes <, >, &
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}
