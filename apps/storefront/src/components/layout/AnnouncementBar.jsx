import Link from 'next/link';
import { localizePath } from '@/i18n/config';

/**
 * The strip above the header (P5.4). Text and link are the shop's, already translated by the API;
 * the three tones are ours, so a shop cannot pick an unreadable colour pair.
 */
const TONES = {
  primary: 'bg-primary text-primary-foreground',
  dark: 'bg-foreground text-background',
  light: 'bg-muted text-foreground',
};

export function AnnouncementBar({ announcement, lang }) {
  if (!announcement?.enabled || !announcement.text) return null;
  const tone = TONES[announcement.tone] ?? TONES.primary;
  const text = <span className="block px-4 py-2 text-center text-sm">{announcement.text}</span>;
  return (
    <aside className={tone}>
      {announcement.href ? (
        <Link
          href={
            announcement.href.startsWith('/')
              ? localizePath(announcement.href, lang)
              : announcement.href
          }
          className="block hover:underline"
        >
          {text}
        </Link>
      ) : (
        text
      )}
    </aside>
  );
}
