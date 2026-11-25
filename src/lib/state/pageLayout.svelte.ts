import { movePanelIn, parsePageLayout, type PageLayoutValue } from './pageLayout';

/** Panel layout of one page, kept in this browser. */
export class PageLayout {
  value: PageLayoutValue = $state(parsePageLayout(null, {}, []));

  constructor(
    private key: string,
    private defaults: Record<string, string[]>,
    private collapsed: readonly string[]
  ) {
    this.value = this.load();
  }

  columnOf(id: string): string | undefined {
    return Object.keys(this.value.columns).find((c) => this.value.columns[c].includes(id));
  }

  move(id: string, column: string, index: number) {
    this.save(movePanelIn(this.value, id, column, index));
  }

  toggleCollapsed(id: string) {
    const c = this.value.collapsed;
    this.save({ ...this.value, collapsed: c.includes(id) ? c.filter((x) => x !== id) : [...c, id] });
  }

  reset() {
    this.save(parsePageLayout(null, this.defaults, this.collapsed));
  }

  // Storage can throw (private mode, blocked site data). The layout then starts at its defaults.
  private load(): PageLayoutValue {
    try {
      const raw = typeof localStorage === 'undefined' ? null : JSON.parse(localStorage.getItem(this.key) ?? 'null');
      return parsePageLayout(raw, this.defaults, this.collapsed);
    } catch {
      return parsePageLayout(null, this.defaults, this.collapsed);
    }
  }

  private save(next: PageLayoutValue) {
    this.value = next;
    try {
      localStorage.setItem(this.key, JSON.stringify(next));
    } catch {
      // Not persisted, the layout still applies for this session.
    }
  }
}
