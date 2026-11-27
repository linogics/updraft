/** Width limits of the planner sidebar in px. */
export const PLAN_SIDEBAR = { min: 200, max: 480, initial: 300 } as const;

const KEY = 'updraft.planSidebar';
const clamp = (v: number) => Math.min(PLAN_SIDEBAR.max, Math.max(PLAN_SIDEBAR.min, v));

/** Width and open state of the planner sidebar, kept in this browser. */
class PlanSidebar {
  width = $state<number>(PLAN_SIDEBAR.initial);
  open = $state(true);

  constructor() {
    // Storage can throw (private mode, blocked site data). The sidebar then starts at its defaults.
    try {
      const s = JSON.parse((typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY)) ?? 'null') as {
        width?: unknown;
        open?: unknown;
      } | null;
      if (typeof s?.width === 'number' && Number.isFinite(s.width)) this.width = clamp(s.width);
      if (typeof s?.open === 'boolean') this.open = s.open;
    } catch {
      // Defaults apply.
    }
  }

  resize(v: number) {
    this.width = clamp(v);
    this.save();
  }

  reset() {
    this.resize(PLAN_SIDEBAR.initial);
  }

  toggle() {
    this.open = !this.open;
    this.save();
  }

  private save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ width: this.width, open: this.open }));
    } catch {
      // Not persisted, the size still applies for this session.
    }
  }
}

export const planSidebar = new PlanSidebar();
