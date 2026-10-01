/**
 * A round initials picture ("MA" for MaheshBabu) drawn in the app itself, as a
 * data: URL usable in <img src>. Replaces ui-avatars.com, which received every
 * person's name to draw the same thing.
 */
const COLORS = ['#4c83bf', '#0e7c6b', '#8a5cc2', '#c2562f', '#2f7d32', '#b23b6b', '#5b6b7c', '#a67c00'];

export function initialsAvatar(name: string | undefined | null): string {
  const clean = (name || '').trim();
  const words = clean.split(/\s+/).filter(Boolean);
  const initials = (words.length > 1 ? words[0][0] + words[1][0] : clean.slice(0, 2)).toUpperCase() || '?';
  let hash = 0;
  for (const ch of clean) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const bg = COLORS[hash % COLORS.length];
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">` +
    `<rect width="128" height="128" fill="${bg}"/>` +
    `<text x="50%" y="50%" dy=".35em" text-anchor="middle" fill="#fff" ` +
    `font-family="Inter Variable, Inter, system-ui, sans-serif" font-size="52" font-weight="600">` +
    `${initials.replace(/[<>&"]/g, '')}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
