// A small panel that opens from a button, and closes again when you tap
// elsewhere, press Esc, tap the button a second time, or open another one.
// Used by the clock, the speed menu, save and share, and music and sounds.
export type Toggle = (open?: boolean) => void;

/** Only one popover is open at a time: opening another closes it. */
let current: Toggle | null = null;

export function popover(button: HTMLElement, panel: HTMLElement, onOpen: () => void = () => {}): Toggle {
  const toggle: Toggle = (open = panel.hidden !== false) => {
    if (open && current && current !== toggle) current(false);
    panel.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    if (open) {
      current = toggle;
      onOpen();
    } else if (current === toggle) current = null;
  };
  button.addEventListener('click', () => toggle());
  document.addEventListener('pointerdown', (event) => {
    const target = event.target as Node;
    if (!panel.hidden && !panel.contains(target) && !button.contains(target)) toggle(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.hidden) toggle(false);
  });
  return toggle;
}
