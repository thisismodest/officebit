// Tabs, the modest-ui way: toggle data-state on tabs and panels.
export function attachTabs(root: HTMLElement): void {
  const tabs = [...root.querySelectorAll<HTMLElement>('[data-tab]')];
  const panels = [...root.querySelectorAll<HTMLElement>('[data-panel]')];
  for (const tab of tabs) {
    tab.addEventListener('click', () => {
      for (const t of tabs) t.dataset.state = t === tab ? 'active' : 'inactive';
      for (const p of panels) p.dataset.state = p.dataset.panel === tab.dataset.tab ? 'active' : 'inactive';
    });
  }
}
