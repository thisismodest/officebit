// Tiny DOM helpers: building HTML strings safely, and the screen size.

/** Phones and small tablets, as style.css has them: the sidebar's a sheet, the editor's picker a strip. */
export const narrow = matchMedia('(max-width: 60rem)');

/** Escape text for use inside HTML. */
export function esc(text: string): string {
  return text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}
