import { describe, expect, it, vi } from 'vitest';
import type { PluginContext } from '#lib/studio/pluginContext.svelte';
import { componentPlugin } from './componentPlugin';

vi.mock('svelte', () => ({ mount: vi.fn(() => ({})), unmount: vi.fn() }));

const component = (() => {}) as never;
const o = { id: 'updraft/t', name: 'T', dock: 'right' as const };

describe('componentPlugin', () => {
  it('requires the studio state by default', () => {
    expect(componentPlugin(o, component).requires).toEqual(['updraft/studio-state@1']);
  });

  it('requires no state when the component takes none', async () => {
    const p = componentPlugin({ ...o, requires: ['t/x@1'], state: null }, component);
    expect(p.requires).toEqual(['t/x@1']);
    const { mount } = await import('svelte');
    p.mount({} as HTMLElement, { use: () => 1 } as unknown as PluginContext);
    expect(vi.mocked(mount).mock.calls.at(-1)?.[1]).toMatchObject({ props: {} });
  });

  it('hands the named state to the component', async () => {
    const p = componentPlugin({ ...o, state: { service: 'updraft/plan-state@1', prop: 'plan' } }, component);
    expect(p.requires).toEqual(['updraft/plan-state@1']);
    const { mount } = await import('svelte');
    p.mount({} as HTMLElement, { use: (n: string) => n } as unknown as PluginContext);
    expect(vi.mocked(mount).mock.calls.at(-1)?.[1]).toMatchObject({ props: { plan: 'updraft/plan-state@1' } });
  });
});
