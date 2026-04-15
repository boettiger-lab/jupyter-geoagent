/**
 * MapView — React wrapper around a MapLibre GL JS map instance.
 *
 * Manages the MapLibre lifecycle (create, resize, destroy) and provides
 * imperative methods for adding layers, toggling visibility, etc.
 * All map mutations go through this component so the ToolCallRecorder
 * can intercept them.
 */

import * as React from 'react';
import maplibregl from 'maplibre-gl';
import * as pmtiles from 'pmtiles';
import { MapLayerConfig, LayerState, MapViewState } from '../core/types';
import type { ColumnInfo } from 'geo-agent/app/dataset-catalog.js';

const BASEMAPS: Record<string, { tiles: string[]; maxzoom: number }> = {
  natgeo: {
    tiles: ['https://services.arcgisonline.com/ArcGIS/rest/services/NatGeo_World_Map/MapServer/tile/{z}/{y}/{x}'],
    maxzoom: 16,
  },
  satellite: {
    tiles: ['https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
    maxzoom: 19,
  },
  plain: {
    tiles: ['https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png'],
    maxzoom: 19,
  },
};

export interface MapViewProps {
  center?: [number, number];
  zoom?: number;
  basemap?: string;
  titilerUrl?: string;
  onMapReady?: (mapView: MapViewController) => void;
}

/**
 * Imperative controller exposed via onMapReady callback.
 * Keeps React rendering separate from MapLibre mutations.
 */
export class MapViewController {
  map: maplibregl.Map;
  layers: Map<string, LayerState> = new Map();
  private titilerUrl: string;

  constructor(map: maplibregl.Map, titilerUrl: string) {
    this.map = map;
    this.titilerUrl = titilerUrl;
  }

  /**
   * Add a dataset layer to the map (from a processed MapLayerConfig).
   */
  addLayer(datasetId: string, config: MapLayerConfig, columns: ColumnInfo[] = []): string {
    const layerId = `${datasetId}/${config.assetId}`;
    const sourceId = `src-${layerId.replace(/[^a-zA-Z0-9]/g, '-')}`;

    if (this.map.getSource(sourceId)) {
      return layerId;
    }

    if (config.layerType === 'vector') {
      if (config.sourceType === 'geojson') {
        this.map.addSource(sourceId, { type: 'geojson', data: config.url! });
      } else {
        this.map.addSource(sourceId, {
          type: 'vector',
          url: `pmtiles://${config.url}`,
        });
      }

      const paint = config.defaultStyle || {
        'fill-color': '#2E7D32',
        'fill-opacity': 0.5,
      };

      const layerDef: maplibregl.LayerSpecification = {
        id: layerId,
        type: 'fill',
        source: sourceId,
        paint: paint as any,
        layout: { visibility: config.defaultVisible ? 'visible' : 'none' },
      };

      if (config.sourceLayer && config.sourceType !== 'geojson') {
        (layerDef as any)['source-layer'] = config.sourceLayer;
      }

      this.map.addLayer(layerDef);

      const outlineId = `${layerId}-outline`;
      const outlineDef: maplibregl.LayerSpecification = {
        id: outlineId,
        type: 'line',
        source: sourceId,
        paint: { 'line-color': '#333', 'line-width': 0.5, 'line-opacity': 0.5 },
        layout: { visibility: config.defaultVisible ? 'visible' : 'none' },
      };
      if (config.sourceLayer && config.sourceType !== 'geojson') {
        (outlineDef as any)['source-layer'] = config.sourceLayer;
      }
      this.map.addLayer(outlineDef);

    } else if (config.layerType === 'raster') {
      let tilesUrl = `${this.titilerUrl}/cog/tiles/WebMercatorQuad/{z}/{x}/{y}.png?url=${encodeURIComponent(config.cogUrl!)}`;
      tilesUrl += `&colormap_name=${config.colormap || 'reds'}`;
      if (config.rescale) tilesUrl += `&rescale=${config.rescale}`;

      this.map.addSource(sourceId, {
        type: 'raster',
        tiles: [tilesUrl],
        tileSize: 256,
      });

      this.map.addLayer({
        id: layerId,
        type: 'raster',
        source: sourceId,
        paint: { 'raster-opacity': 0.7 },
        layout: { visibility: config.defaultVisible ? 'visible' : 'none' },
      });
    }

    const initialOpacity = config.layerType === 'raster' ? 0.7 : 0.5;
    const initialFillColor = config.layerType === 'vector'
      ? (config.defaultStyle?.['fill-color'] as string | undefined) || '#2E7D32'
      : undefined;

    this.layers.set(layerId, {
      id: layerId,
      datasetId,
      assetId: config.assetId,
      displayName: config.title,
      type: config.layerType,
      visible: config.defaultVisible,
      opacity: initialOpacity,
      fillColor: initialFillColor,
      filter: config.defaultFilter,
      defaultFilter: config.defaultFilter,
      paint: config.defaultStyle,
      colormap: config.colormap,
      rescale: config.rescale ?? undefined,
      sourceId,
      sourceLayer: config.sourceLayer,
      columns,
      versions: config.versions,
      currentVersionIndex: config.defaultVersionIndex,
      titilerUrl: this.titilerUrl,
      cogUrl: config.cogUrl,
    });

    return layerId;
  }

  showLayer(layerId: string): boolean {
    if (!this.map.getLayer(layerId)) return false;
    this.map.setLayoutProperty(layerId, 'visibility', 'visible');
    if (this.map.getLayer(`${layerId}-outline`)) {
      this.map.setLayoutProperty(`${layerId}-outline`, 'visibility', 'visible');
    }
    const state = this.layers.get(layerId);
    if (state) state.visible = true;
    return true;
  }

  hideLayer(layerId: string): boolean {
    if (!this.map.getLayer(layerId)) return false;
    this.map.setLayoutProperty(layerId, 'visibility', 'none');
    if (this.map.getLayer(`${layerId}-outline`)) {
      this.map.setLayoutProperty(`${layerId}-outline`, 'visibility', 'none');
    }
    const state = this.layers.get(layerId);
    if (state) state.visible = false;
    return true;
  }

  removeLayer(layerId: string): boolean {
    if (this.map.getLayer(`${layerId}-outline`)) {
      this.map.removeLayer(`${layerId}-outline`);
    }
    if (this.map.getLayer(layerId)) {
      this.map.removeLayer(layerId);
    }
    const state = this.layers.get(layerId);
    if (state && this.map.getSource(state.sourceId)) {
      this.map.removeSource(state.sourceId);
    }
    this.layers.delete(layerId);
    return true;
  }

  setFilter(layerId: string, filter: any[]): boolean {
    if (!this.map.getLayer(layerId)) return false;
    this.map.setFilter(layerId, filter as any);
    if (this.map.getLayer(`${layerId}-outline`)) {
      this.map.setFilter(`${layerId}-outline`, filter as any);
    }
    const state = this.layers.get(layerId);
    if (state) state.filter = filter;
    return true;
  }

  clearFilter(layerId: string): boolean {
    if (!this.map.getLayer(layerId)) return false;
    this.map.setFilter(layerId, null);
    if (this.map.getLayer(`${layerId}-outline`)) {
      this.map.setFilter(`${layerId}-outline`, null);
    }
    const state = this.layers.get(layerId);
    if (state) state.filter = undefined;
    return true;
  }

  flyTo(center: [number, number], zoom?: number): void {
    this.map.flyTo({ center, zoom: zoom || this.map.getZoom() });
  }

  getViewState(): MapViewState {
    const center = this.map.getCenter();
    return {
      center: [center.lng, center.lat],
      zoom: this.map.getZoom(),
      bearing: this.map.getBearing(),
      pitch: this.map.getPitch(),
    };
  }

  getVisibleLayers(): LayerState[] {
    return [...this.layers.values()].filter(l => l.visible);
  }

  setBasemap(name: string): void {
    for (const [key] of Object.entries(BASEMAPS)) {
      const visibility = key === name ? 'visible' : 'none';
      if (this.map.getLayer(`${key}-base`)) {
        this.map.setLayoutProperty(`${key}-base`, 'visibility', visibility);
      }
    }
  }

  resize(): void {
    this.map.resize();
  }
}

export const MapView: React.FC<MapViewProps> = ({
  center = [-98, 39],
  zoom = 4,
  basemap = 'natgeo',
  titilerUrl = 'https://titiler.nrp-nautilus.io',
  onMapReady,
}) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const mapRef = React.useRef<maplibregl.Map | null>(null);

  React.useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // Register PMTiles protocol
    const protocol = new pmtiles.Protocol();
    maplibregl.addProtocol('pmtiles', protocol.tile);

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
        sources: {
          natgeo: { type: 'raster', tiles: BASEMAPS.natgeo.tiles, tileSize: 256, maxzoom: BASEMAPS.natgeo.maxzoom },
          satellite: { type: 'raster', tiles: BASEMAPS.satellite.tiles, tileSize: 256, maxzoom: BASEMAPS.satellite.maxzoom },
          plain: { type: 'raster', tiles: BASEMAPS.plain.tiles, tileSize: 256, maxzoom: BASEMAPS.plain.maxzoom },
        },
        layers: [
          { id: 'natgeo-base', type: 'raster', source: 'natgeo', layout: { visibility: basemap === 'natgeo' ? 'visible' : 'none' } },
          { id: 'satellite-base', type: 'raster', source: 'satellite', layout: { visibility: basemap === 'satellite' ? 'visible' : 'none' } },
          { id: 'plain-base', type: 'raster', source: 'plain', layout: { visibility: basemap === 'plain' ? 'visible' : 'none' } },
        ],
      },
      center,
      zoom,
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');

    map.on('load', () => {
      mapRef.current = map;
      const controller = new MapViewController(map, titilerUrl);
      if (onMapReady) onMapReady(controller);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="jp-GeoAgent-map"
      style={{ width: '100%', height: '100%' }}
    />
  );
};
