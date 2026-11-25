// Opening splash: the Voxel1 shield shows in the middle of the screen (markup
// and CSS are inline in index.html so it paints before this bundle loads).
// When the app is ready, the shield shrinks and flies into the header logo at
// the top left, then the splash is removed. Pages without that header logo
// (log in, admin layout) just get a short fade.

const MIN_VISIBLE_MS = 900;   // let the pop-in finish before leaving
const MAX_WAIT_MS = 12000;    // never trap the user behind the splash
const FLY_MS = 700;
const TARGET_SELECTOR = '.lockup img, .brand img';

export function runSplash(): void {
  const splash = document.getElementById('app-splash');
  const logo = splash?.querySelector<HTMLImageElement>('.app-splash-logo');
  if (!splash || !logo) return;

  const start = performance.now();
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let finished = false;
  let noTargetSince: number | null = null;

  const remove = () => splash.remove();

  const fadeOut = () => {
    splash.classList.add('is-fading');
    window.setTimeout(remove, 350);
  };

  const flyTo = (target: HTMLElement) => {
    const from = logo.getBoundingClientRect();
    const to = target.getBoundingClientRect();
    if (reduceMotion || !from.width || !to.width) { fadeOut(); return; }

    const dx = (to.left + to.width / 2) - (from.left + from.width / 2);
    const dy = (to.top + to.height / 2) - (from.top + from.height / 2);
    const scale = to.width / from.width;

    // Hide the real header logo until the flying one lands on it.
    target.style.visibility = 'hidden';
    // Freeze the pop-in at rest first, then start the move on the next frame
    // so the browser animates it instead of jumping straight to the end.
    splash.classList.add('is-flying');
    void logo.offsetWidth;
    requestAnimationFrame(() => {
      logo.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
    });

    window.setTimeout(() => {
      target.style.visibility = '';
      remove();
    }, FLY_MS + 40);
  };

  const check = () => {
    if (finished) return;
    const elapsed = performance.now() - start;
    if (elapsed > MAX_WAIT_MS) { finished = true; fadeOut(); return; }
    if (elapsed < MIN_VISIBLE_MS) return;

    const root = document.getElementById('root');
    const loading = document.querySelector('[data-app-loading]');
    if (!root?.firstElementChild || loading) { noTargetSince = null; return; }

    const target = document.querySelector<HTMLElement>(TARGET_SELECTOR);
    if (target && target.getBoundingClientRect().width > 0) {
      finished = true;
      // Wait one frame so the header has its final layout.
      requestAnimationFrame(() => flyTo(target));
      return;
    }
    // App is showing something without the header logo: fade instead.
    noTargetSince ??= performance.now();
    if (performance.now() - noTargetSince > 500) { finished = true; fadeOut(); }
  };

  const timer = window.setInterval(() => {
    check();
    if (finished) window.clearInterval(timer);
  }, 50);
}
