<script lang="ts">
  import { onMount } from 'svelte';
  import * as maplibregl from 'maplibre-gl';
  import type { GeoJSONSource, StyleSpecification } from 'maplibre-gl';
  import type { FeatureCollection } from 'geojson';
  import 'maplibre-gl/dist/maplibre-gl.css';
  // MapLibre derives its worker URL at runtime, which Vite cannot follow; bundle it explicitly.
  import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
  import { distance } from '#lib/domain/geo';
  import { positionAt } from '#lib/domain/timeline';
  import type { ReplayState } from '#lib/state/replay.svelte';

  let { replay, follow = false }: { replay: ReplayState; follow?: boolean } = $props();

  const OSM_STYLE: StyleSpecification = {
    version: 8,
    sources: {
      osm: {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: '© OpenStreetMap contributors'
      }
    },
    layers: [{ id: 'osm', type: 'raster', source: 'osm' }]
  };

  let container: HTMLDivElement;
  let map: maplibregl.Map | undefined;
  let ready = $state(false);

  function trackData(): FeatureCollection {
    return {
      type: 'FeatureCollection',
      features: replay.flights
        .filter((f) => f.visible)
        .map((f) => ({
          type: 'Feature',
          properties: { color: f.color, selected: f.flight.id === replay.selected?.flight.id },
          geometry: { type: 'LineString', coordinates: f.flight.fixes.map((x) => [x.lon, x.lat]) }
        }))
    };
  }

  function pilotData(t: number): FeatureCollection {
    return {
      type: 'FeatureCollection',
      features: replay.flights
        .filter((f) => f.visible)
        .map((f) => {
          const p = positionAt(f.flight.fixes, t);
          return {
            type: 'Feature',
            properties: { color: f.color },
            geometry: { type: 'Point', coordinates: [p.lon, p.lat] }
          };
        })
    };
  }

  function thermalData(): FeatureCollection {
    const sel = replay.selected;
    return {
      type: 'FeatureCollection',
      features: (sel?.analysis.thermals ?? [])
        .filter((t) => t.gain > 0)
        .map((t) => ({
          type: 'Feature',
          properties: { label: `+${Math.round(t.gain)}` },
          geometry: { type: 'Point', coordinates: [t.centerLon, t.centerLat] }
        }))
    };
  }

  onMount(() => {
    maplibregl.setWorkerUrl(maplibreWorkerUrl);
    const bounds = new maplibregl.LngLatBounds();
    for (const f of replay.flights) for (const x of f.flight.fixes) bounds.extend([x.lon, x.lat]);

    map = new maplibregl.Map({
      container,
      style: OSM_STYLE,
      bounds: bounds.isEmpty() ? undefined : bounds,
      fitBoundsOptions: { padding: 30 },
      attributionControl: { compact: true }
    });
    const m = map;

    m.on('load', () => {
      m.addSource('tracks', { type: 'geojson', data: trackData() });
      m.addSource('pilots', { type: 'geojson', data: pilotData(replay.time) });
      m.addSource('thermals', { type: 'geojson', data: thermalData() });
      m.addLayer({
        id: 'tracks',
        type: 'line',
        source: 'tracks',
        paint: {
          'line-color': ['get', 'color'],
          'line-width': ['case', ['get', 'selected'], 3, 1.5],
          'line-opacity': 0.85
        }
      });
      m.addLayer({
        id: 'thermals',
        type: 'circle',
        source: 'thermals',
        paint: { 'circle-radius': 5, 'circle-color': '#ff8c42', 'circle-opacity': 0.7 }
      });
      m.addLayer({
        id: 'pilots',
        type: 'circle',
        source: 'pilots',
        paint: {
          'circle-radius': 7,
          'circle-color': ['get', 'color'],
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 2
        }
      });
      ready = true;
    });

    // Click near the selected track to jump there in time.
    m.on('click', (e) => {
      const sel = replay.selected;
      if (!sel) return;
      const click = { lat: e.lngLat.lat, lon: e.lngLat.lng };
      let best = 0;
      let bestDist = Infinity;
      sel.flight.fixes.forEach((f, i) => {
        const d = distance(click, f);
        if (d < bestDist) [best, bestDist] = [i, d];
      });
      const pxPerMetre = 1 / (156543 * Math.cos((click.lat * Math.PI) / 180) / 2 ** m.getZoom());
      if (bestDist * pxPerMetre < 20) replay.seek(sel.flight.fixes[best].t);
    });

    const resize = new ResizeObserver(() => m.resize());
    resize.observe(container);
    return () => {
      resize.disconnect();
      m.remove();
    };
  });

  $effect(() => {
    const t = replay.time;
    if (!ready || !map) return;
    (map.getSource('pilots') as GeoJSONSource).setData(pilotData(t));
    const sel = replay.selected;
    if (follow && sel && replay.camera !== 'free') {
      const p = positionAt(sel.flight.fixes, t);
      map.setCenter([p.lon, p.lat]);
    }
  });

  $effect(() => {
    void replay.flights;
    void replay.selected;
    if (!ready || !map) return;
    (map.getSource('tracks') as GeoJSONSource).setData(trackData());
    (map.getSource('thermals') as GeoJSONSource).setData(thermalData());
  });
</script>

<div class="map" bind:this={container}></div>

<style>
  .map {
    width: 100%;
    height: 100%;
  }
</style>
