import { describe, expect, it } from 'vitest';

import { writeRouteGpx, writeXctsk } from './task';

const route = [
  { lat: 46.1, lon: 8.2 },
  { lat: 46.3, lon: 8.5 }
];

describe('route export', () => {
  it('writes an XCTrack task with one cylinder per point', () => {
    const task = JSON.parse(writeXctsk(route));
    expect(task).toMatchObject({ taskType: 'CLASSIC', version: 1, earthModel: 'WGS84' });
    expect(task.turnpoints).toEqual([
      { radius: 400, waypoint: { name: 'TP01', description: '', lat: 46.1, lon: 8.2, altSmoothed: 0 } },
      { radius: 400, waypoint: { name: 'TP02', description: '', lat: 46.3, lon: 8.5, altSmoothed: 0 } }
    ]);
  });

  it('writes a GPX route with escaped title', () => {
    const gpx = writeRouteGpx(route, 'A & B');
    expect(gpx).toContain('<name>A &amp; B</name>');
    expect(gpx).toContain('<rtept lat="46.3" lon="8.5"><name>TP02</name></rtept>');
  });
});
