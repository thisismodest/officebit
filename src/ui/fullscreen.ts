// Full screen (docs/UI.md): the whole town, sidebar and all, fills the screen,
// from the button above zoom (Esc comes back out). Hidden where the browser
// can't do it for a page (iPhones only allow it for video), and in the
// installed app, which has the screen to itself already.
import { icon } from './icons.ts';

/** Older Safari names it all with a prefix. */
type Prefixed = { webkitFullscreenEnabled?: boolean; webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void };

export function attachFullscreen(button: HTMLButtonElement, root: HTMLElement = document.documentElement): void {
  const doc = document as Document & Prefixed;
  if (!(document.fullscreenEnabled || doc.webkitFullscreenEnabled) || installed()) return;
  const on = () => !!(document.fullscreenElement || doc.webkitFullscreenElement);
  button.hidden = false;
  button.addEventListener('click', () => {
    if (on()) void (document.exitFullscreen?.() ?? doc.webkitExitFullscreen?.());
    else void (root.requestFullscreen?.() ?? (root as HTMLElement & { webkitRequestFullscreen?: () => void }).webkitRequestFullscreen?.());
  });
  const show = () => {
    const full = on();
    const label = full ? 'Leave full screen (Esc)' : 'Full screen';
    button.innerHTML = icon(full ? 'unfullscreen' : 'fullscreen');
    button.setAttribute('aria-pressed', String(full));
    button.setAttribute('aria-label', label);
    button.title = label;
  };
  document.addEventListener('fullscreenchange', show);
  document.addEventListener('webkitfullscreenchange', show);
  show();
}

/** Running as the installed app (from the home screen), not in a browser tab. */
export function installed(): boolean {
  return ['standalone', 'fullscreen', 'minimal-ui'].some((mode) => matchMedia(`(display-mode: ${mode})`).matches) || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** Make officebit installable, and open offline: the service worker lives at the site's root, so it looks after every page. */
export function registerApp(): void {
  if (!('serviceWorker' in navigator)) return;
  // The worker's own script is always fetched fresh, so a new release's worker takes over straight away.
  addEventListener('load', () => void navigator.serviceWorker.register(new URL('./sw.js', location.href), { updateViaCache: 'none' }).catch(() => {}));
}
