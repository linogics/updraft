import { movePanelIn, parsePageLayout, type PageLayoutValue } from './pageLayout';

/**
 * Panel layout of one page, kept in this browser. `extra` lists panel ids that come and go at runtime,
 * they are appended to the first column and dropped again when they are no longer listed.
 */
export class PageLayout {
  private stored = $state.raw<unknown>(null);
  value = $derived(this.parse());

  constructor(
    private key: string,
    private defaults: Record<string, string[]>,
    private collapsed: readonly string[],
    private extra: () => string[] = () => []
  ) {
    this.stored = this.load();
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

  hide(id: string) {
    if (!this.value.hidden.includes(id)) this.save({ ...this.without(id), hidden: [...this.value.hidden, id] });
  }

  /** Puts a hidden panel back at the end of its column. */
  show(id: string) {
    this.save({ ...this.value, hidden: this.value.hidden.filter((x) => x !== id) });
  }

  /** Drops every trace of a panel that is gone for good. */
  forget(id: string) {
    this.save({ ...this.without(id), hidden: this.value.hidden.filter((x) => x !== id) });
  }

  reset() {
    this.save(parsePageLayout(null, this.known(), this.collapsed));
  }

  private without(id: string) {
    const v = this.value;
    return {
      ...v,
      columns: Object.fromEntries(Object.entries(v.columns).map(([c, ids]) => [c, ids.filter((x) => x !== id)])),
      collapsed: v.collapsed.filter((x) => x !== id)
    };
  }

  private parse() {
    return parsePageLayout(this.stored, this.known(), this.collapsed);
  }

  private known(): Record<string, string[]> {
    const first = Object.keys(this.defaults)[0];
    return first ? { ...this.defaults, [first]: [...this.defaults[first], ...this.extra()] } : this.defaults;
  }

  // Storage can throw (private mode, blocked site data). The layout then starts at its defaults.
  private load(): unknown {
    try {
      return typeof localStorage === 'undefined' ? null : JSON.parse(localStorage.getItem(this.key) ?? 'null');
    } catch {
      return null;
    }
  }

  private save(next: PageLayoutValue) {
    this.stored = next;
    try {
      localStorage.setItem(this.key, JSON.stringify(next));
    } catch {
      // Not persisted, the layout still applies for this session.
    }
  }
}
