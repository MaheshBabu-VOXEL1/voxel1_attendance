/** Announcement icon: a filled megaphone with sound lines (Kesari's choice, option D). */
export default function AnnouncementIcon({ size = 18 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M3 9.5h3.2L15 5v14l-8.8-4.5H3a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1z" fill="currentColor" />
    <path d="M6.4 15l1.5 4.3a1 1 0 0 0 .95.7h1.3a.8.8 0 0 0 .75-1.1L9.6 15.6z" fill="currentColor" />
    <path d="M18 9a4 4 0 0 1 0 6M20.6 6.4a7.6 7.6 0 0 1 0 11.2" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
  </svg>;
}
