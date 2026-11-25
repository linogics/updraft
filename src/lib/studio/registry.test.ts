import { describe, expect, it } from 'vitest';
import { airspacePrefs } from '#lib/airspace/prefs.svelte';
import { xcPrefs } from '#lib/state/xcPrefs.svelte';
import { studioLayout } from '#lib/state/studioLayout.svelte';
import { panelById } from './registry.svelte';

describe('bundled plugin panels', () => {
  it('keep the enable flags of the old panels', () => {
    expect(panelById('plugin:updraft/xc')?.startsOff).toBe(true);
    expect(panelById('plugin:updraft/airspace')?.enable).toBeTypeOf('function');
    expect(panelById('plugin:updraft/thermal-overlay')?.enable).toBeTypeOf('function');
  });

  it('restoring the defaults turns xc off and the airspace on', () => {
    xcPrefs.setEnabled(true);
    airspacePrefs.set({ show: false });
    studioLayout.restoreDefaults();

    expect(xcPrefs.enabled).toBe(false);
    expect(airspacePrefs.show).toBe(true);
  });
});
