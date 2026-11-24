import { parsePlugins, type PluginEntry } from './pluginPrefs';

const KEY = 'studioPlugins';

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
