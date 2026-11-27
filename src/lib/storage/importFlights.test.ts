import 'fake-indexeddb/auto';

import { expect, it } from 'vitest';

import { importFlights } from './importFlights';

const track = JSON.stringify({
  type: 'LineString',
  coordinates: [
    [7, 46, 1000, 1_700_000_000],
    [7.01, 46.01, 1100, 1_700_000_060]
  ]
});

it('opens the stored flight when the same track is imported again', async () => {
  const first = await importFlights([new File([track], 'a.geojson')]);
  const again = await importFlights([new File([track], 'b.geojson'), new File([track], 'c.geojson')]);
  expect(first.errors).toEqual([]);
  expect(again).toEqual({ ids: [first.ids[0], first.ids[0]], errors: [] });
});
