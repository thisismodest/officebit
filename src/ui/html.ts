// Tiny DOM helpers: building HTML strings safely, patching them in, and the screen size.

/** Phones and small tablets, as style.css has them: the sidebar's a sheet, the editor's picker a strip. */
export const narrow = matchMedia('(max-width: 60rem)');

/** Escape text for use inside HTML. */
export function esc(text: string): string {
  return text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

/**
 * Put `html` into `root`, keeping the elements that are already there where
 * they match (same tag, in the same place) and changing only the text and
 * attributes that differ. A panel that refreshes as the story goes on keeps
 * the button under your pointer, so it doesn't lose its hover and flash.
 */
export function patch(root: Element, html: string): void {
  const next = document.createElement('template');
  next.innerHTML = html;
  morph(root, next.content);
}

function morph(into: Node, from: Node): void {
  const wanted = [...from.childNodes];
  for (const [i, node] of wanted.entries()) {
    const have = into.childNodes[i];
    if (!have) into.appendChild(node);
    else if (have.nodeType !== node.nodeType || have.nodeName !== node.nodeName) into.replaceChild(node, have);
    else if (node instanceof Element) {
      const el = have as Element;
      for (const { name } of [...el.attributes]) if (!node.hasAttribute(name)) el.removeAttribute(name);
      for (const { name, value } of [...node.attributes]) if (el.getAttribute(name) !== value) el.setAttribute(name, value);
      morph(el, node);
    } else if (have.nodeValue !== node.nodeValue) have.nodeValue = node.nodeValue;
  }
  while (into.childNodes.length > wanted.length) into.lastChild!.remove();
}
