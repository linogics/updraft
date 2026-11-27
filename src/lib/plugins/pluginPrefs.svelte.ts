import { parsePlugins, type PluginEntry } from './entries';
import { services } from './services';

const KEY = 'plugins';

// Storage can throw (private mode, blocked site data). The list then starts empty.
function load(): PluginEntry[] {
  try {
    return parsePlugins(JSON.parse(localStorage.getItem(KEY) ?? 'null'));
  } catch {
    return [];
  }
}

/** Plugins added by URL, kept in this browser. */
class PluginPrefs {
  list = $state.raw<PluginEntry[]>(typeof localStorage === 'undefined' ? [] : load());

  add(entry: PluginEntry) {
    this.save([...this.list, entry]);
  }

  remove(id: string) {
    this.save(this.list.filter((e) => e.id !== id));
  }

  /** Grants or revokes the right of a plugin to change `service`, effective on its next call. */
  setGrant(id: string, service: string, on: boolean) {
    this.save(
      this.list.map((e) => {
        if (e.id !== id) return e;
        const grants = (e.grants ?? []).filter((n) => n !== service);
        return { ...e, grants: on ? [...grants, service] : grants };
      })
    );
  }

  /** Stores what a plugin requires and may change, after `add`. */
  setAccess(id: string, requires: string[], grants: string[]) {
    this.save(this.list.map((e) => (e.id === id ? { ...e, requires, grants } : e)));
  }

  private save(next: PluginEntry[]) {
    this.list = next;
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // Not persisted, the plugin still works for this session.
    }
  }
}

export const pluginPrefs = new PluginPrefs();

services.setGrants((id) => pluginPrefs.list.find((e) => e.id === id)?.grants ?? []);
