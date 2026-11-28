<script lang="ts">
  import 'maplibre-gl/dist/maplibre-gl.css';

  import type { GeoJSONSource, LayerSpecification, SourceSpecification, StyleSpecification } from 'maplibre-gl';
  import * as maplibregl from 'maplibre-gl';
  // MapLibre derives its worker URL at runtime, which Vite cannot follow, so bundle it explicitly.
  import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
  import { onMount } from 'svelte';

  import { syncAirspaces } from '#lib/airspace/layers';
  import { airspacePrefs } from '#lib/airspace/prefs.svelte';
  import type { LatLon } from '#lib/domain/geo';
  import { BASEMAP_IDS, type BasemapId } from '#lib/domain/scene';
  import { BASEMAPS, TERRARIUM_ATTRIBUTION, TERRARIUM_MAX_ZOOM, TERRARIUM_URL } from '#lib/map/basemaps';
  import { m } from '#lib/paraglide/messages';
  import { syncThermals } from '#lib/thermals/layers';
  import { thermalOverlayPrefs } from '#lib/thermals/prefs.svelte';

  let {
    points,
    selected,
    basemap,
    onadd,
    onmove,
    oninsert,
    onselect,
    reach,
    start,
    armed,
    onstart
  }: {
    points: LatLon[];
    selected: number | null;
    basemap: BasemapId;
    onadd: (p: LatLon) => void;
    /** Called once when a drag ends. */
    onmove: (i: number, p: LatLon) => void;
    /** Insert a point at index i. */
    oninsert: (i: number, p: LatLon) => void;
    onselect: (i: number | null) => void;
    /** Ring of the glide reach area. */
    reach: LatLon[] | null;
    /** Glide start point. */
    start: LatLon | null;
    /** The next click sets the glide start point instead of adding a route point. */
    armed: boolean;
    onstart: (p: LatLon) => void;
  } = $props();

  function baseStyle(active: BasemapId): StyleSpecification {
    const sources: Record<string, SourceSpecification> = {
      dem: {
        type: 'raster-dem',
        tiles: [TERRARIUM_URL],
        encoding: 'terrarium',
        tileSize: 256,
        maxzoom: TERRARIUM_MAX_ZOOM,
        attribution: TERRARIUM_ATTRIBUTION
      }
    };
    const layers: LayerSpecification[] = [];
    for (const id of BASEMAP_IDS) {
      const { tiles, maxZoom, attribution } = BASEMAPS[id];
      sources[id] = { type: 'raster', tiles, tileSize: 256, maxzoom: maxZoom, attribution };
      layers.push({ id, type: 'raster', source: id, layout: { visibility: id === active ? 'visible' : 'none' } });
    }

    layers.push({
      id: 'hillshade',
      type: 'hillshade',
      source: 'dem',
      layout: { visibility: active === 'osm' ? 'visible' : 'none' },
      paint: { 'hillshade-exaggeration': 0.35 }
    });
    return { version: 8, sources, layers };
  }

  let container: HTMLDivElement;
  let map: maplibregl.Map | undefined;
  let ready = $state(false);
  let markers: maplibregl.Marker[] = [];

  const line = (pts: LatLon[]) => ({
    type: 'Feature' as const,
    properties: {},
    geometry: { type: 'LineString' as const, coordinates: pts.map((p) => [p.lon, p.lat]) }
  });

  const polygon = (ring: LatLon[] | null) => ({
    type: 'Feature' as const,
    properties: {},
    geometry: {
      type: 'Polygon' as const,
      coordinates: ring ? [[...ring, ring[0]].map((p) => [p.lon, p.lat])] : []
    }
  });

  let startMarker: maplibregl.Marker | undefined;

  function marker(el: HTMLElement, p: LatLon, draggable: boolean) {
    const mk = new maplibregl.Marker({ element: el, draggable }).setLngLat([p.lon, p.lat]).addTo(map!);
    markers.push(mk);
    return mk;
  }

  function rebuild() {
    for (const mk of markers) mk.remove();
    markers = [];
    points.forEach((p, i) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'pt' + (i === selected ? ' sel' : '');
      el.textContent = String(i + 1);
      el.ariaLabel = m.plan_point({ n: i + 1 });
      el.onclick = (e) => {
        e.stopPropagation();
        onselect(i);
      };

      const mk = marker(el, p, true);
      const at = () => ({ lat: mk.getLngLat().lat, lon: mk.getLngLat().lng });
      // Update the line while dragging, commit only on drag end.
      mk.on('drag', () => {
        const next = points.slice();
        next[i] = at();
        void (map!.getSource('route') as GeoJSONSource).setData(line(next));
      });
      mk.on('dragend', () => onmove(i, at()));
      if (i === 0) return;
      const q = points[i - 1];
      const mid = { lat: (p.lat + q.lat) / 2, lon: (p.lon + q.lon) / 2 };
      const h = document.createElement('button');
      h.type = 'button';
      h.className = 'mid';
      h.ariaLabel = m.plan_insert_point({ n: i + 1 });
      h.onclick = (e) => {
        e.stopPropagation();
        oninsert(i, mid);
      };

      marker(h, mid, false);
    });
  }

  onMount(() => {
    maplibregl.setWorkerUrl(maplibreWorkerUrl);
    const bounds = new maplibregl.LngLatBounds();
    for (const p of points) bounds.extend([p.lon, p.lat]);
    // A single point has empty extent, so center on it instead of fitting.
    const fit = points.length > 1;
    map = new maplibregl.Map({
      container,
      style: baseStyle(basemap),
      bounds: fit ? bounds : undefined,
      fitBoundsOptions: { padding: 60 },
      center: fit ? undefined : points.length ? [points[0].lon, points[0].lat] : [8.0, 46.5],
      zoom: fit ? undefined : points.length ? 10 : 7,
      attributionControl: { compact: true }
    });
    const m = map;
    m.on('load', () => {
      m.addSource('route', { type: 'geojson', data: line(points) });
      m.addSource('reach', { type: 'geojson', data: polygon(reach) });
      m.addLayer({
        id: 'reach-fill',
        type: 'fill',
        source: 'reach',
        paint: { 'fill-color': '#2ea8ff', 'fill-opacity': 0.2 }
      });
      m.addLayer({
        id: 'reach-line',
        type: 'line',
        source: 'reach',
        paint: { 'line-color': '#2ea8ff', 'line-width': 2 }
      });
      m.addLayer({
        id: 'route-casing',
        type: 'line',
        source: 'route',
        layout: { 'line-join': 'round' },
        paint: { 'line-color': '#0b0c0f', 'line-width': 7 }
      });
      m.addLayer({
        id: 'route',
        type: 'line',
        source: 'route',
        layout: { 'line-join': 'round' },
        paint: { 'line-color': '#ffd400', 'line-width': 3 }
      });
      ready = true;
    });
    m.on('click', (e) => {
      onselect(null);
      if (armed) return onstart({ lat: e.lngLat.lat, lon: e.lngLat.lng });
      onadd({ lat: e.lngLat.lat, lon: e.lngLat.lng });
    });
    const resize = new ResizeObserver(() => m.resize());
    resize.observe(container);
    return () => {
      resize.disconnect();
      m.remove();
    };
  });

  $effect(() => {
    if (!ready || !map) return;
    void (map.getSource('route') as GeoJSONSource).setData(line(points));
    void selected;
    rebuild();
  });

  $effect(() => {
    if (!ready || !map) return;
    void (map.getSource('reach') as GeoJSONSource).setData(polygon(reach));
  });

  $effect(() => {
    if (!ready || !map) return;
    map.getCanvas().style.cursor = armed ? 'crosshair' : '';
  });

  $effect(() => {
    startMarker?.remove();
    startMarker = undefined;
    if (!ready || !map || !start) return;
    const el = document.createElement('div');
    el.className = 'glide-start';
    el.role = 'img';
    el.ariaLabel = m.glide_start_marker();
    startMarker = new maplibregl.Marker({ element: el }).setLngLat([start.lon, start.lat]).addTo(map);
  });

  $effect(() => {
    const { show, classes, maxFloor, opacity, key } = airspacePrefs;
    if (!ready || !map) return;
    syncAirspaces(map, { show, classes, maxFloor, opacity }, key, 'route-casing');
  });

  $effect(() => {
    const { showHotspots: hotspots, showSkyways: skyways, opacity } = thermalOverlayPrefs;
    if (!ready || !map) return;
    syncThermals(map, { hotspots, skyways, opacity }, 'route-casing');
  });

  $effect(() => {
    const active = basemap;
    if (!ready || !map) return;
    for (const id of BASEMAP_IDS) map.setLayoutProperty(id, 'visibility', id === active ? 'visible' : 'none');
    map.setLayoutProperty('hillshade', 'visibility', active === 'osm' ? 'visible' : 'none');
  });
</script>

<div class="map" bind:this={container}></div>

<style>
  .map {
    width: 100%;
    height: 100%;
  }
  .map :global(.pt) {
    width: 26px;
    height: 26px;
    padding: 0;
    border-radius: 50%;
    border: 2px solid #0b0c0f;
    background: #ffd400;
    color: #0b0c0f;
    font: 600 13px/1 var(--display, sans-serif);
    cursor: grab;
  }
  .map :global(.pt.sel),
  .map :global(.pt:focus-visible) {
    background: #fff;
    outline: 2px solid #ffd400;
  }
  .map :global(.glide-start) {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 3px solid #fff;
    background: #2ea8ff;
    box-shadow: 0 0 0 2px #0b0c0f;
  }
  .map :global(.mid) {
    width: 12px;
    height: 12px;
    padding: 0;
    border-radius: 50%;
    border: 2px solid #ffd400;
    background: #0b0c0f;
    cursor: copy;
  }
</style>
