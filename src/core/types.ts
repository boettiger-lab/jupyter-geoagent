/**
 * Core type definitions for jupyter-geoagent.
 *
 * Mirrors the interfaces used by the geo-agent web app
 * (DatasetCatalog, MapManager, ToolRegistry) so the same
 * conceptual model applies in both environments.
 */

// ── STAC types ──

export interface STACLink {
  rel: string;
  href: string;
  type?: string;
  title?: string;
  id?: string;
}

export interface STACAsset {
  href: string;
  type?: string;
  title?: string;
  description?: string;
  'vector:layers'?: string[];
  'pmtiles:layer'?: string;
  'raster:bands'?: Array<{
    'classification:classes'?: Array<{
      value: number;
      description?: string;
      'color-hint'?: string;
      color_hint?: string;
    }>;
  }>;
}

export interface STACCollection {
  id: string;
  type?: string;
  title?: string;
  description?: string;
  keywords?: string[];
  license?: string;
  extent?: {
    spatial?: { bbox?: number[][] };
    temporal?: { interval?: string[][] };
  };
  links?: STACLink[];
  assets?: Record<string, STACAsset>;
  providers?: Array<{ name: string; roles?: string[] }>;
  'table:columns'?: Array<{
    name: string;
    type?: string;
    description?: string;
    values?: string[];
  }>;
  summaries?: Record<string, any>;
}

export interface STACCatalog {
  id?: string;
  type?: string;
  title?: string;
  description?: string;
  links?: STACLink[];
}

// ── Dataset types (processed from STAC) ──

export interface ColumnInfo {
  name: string;
  type: string;
  description: string;
  values?: string[];
}

export interface MapLayerConfig {
  assetId: string;
  layerType: 'vector' | 'raster';
  sourceType?: 'geojson';
  title: string;
  description: string;
  url?: string;
  cogUrl?: string;
  sourceLayer?: string;
  defaultVisible: boolean;
  defaultFilter?: any[];
  defaultStyle?: Record<string, any>;
  colormap?: string;
  rescale?: string;
}

export interface ParquetAsset {
  assetId: string;
  title: string;
  s3Path: string;
  originalUrl: string;
  isPartitioned: boolean;
  description: string;
}

export interface DatasetEntry {
  id: string;
  title: string;
  description: string;
  license: string;
  keywords: string[];
  provider: string;
  columns: ColumnInfo[];
  mapLayers: MapLayerConfig[];
  parquetAssets: ParquetAsset[];
  extent?: STACCollection['extent'];
  thumbnail?: string;
}

// ── Tool types ──

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
  execute: (args: Record<string, any>) => Promise<string>;
}

export interface ToolResult {
  success: boolean;
  name: string;
  result: string;
  source: 'local' | 'remote' | 'error';
  sqlQuery?: string;
}

export interface RecordedToolCall {
  id: number;
  tool: string;
  args: Record<string, any>;
  result?: string;
  timestamp: string;
}

// ── Map types ──

export interface MapViewState {
  center: [number, number];
  zoom: number;
  bearing: number;
  pitch: number;
}

export interface LayerState {
  id: string;
  datasetId: string;
  displayName: string;
  type: 'vector' | 'raster';
  visible: boolean;
  opacity: number;
  filter?: any[];
  paint?: Record<string, any>;
  sourceId: string;
  sourceLayer?: string;
  columns: ColumnInfo[];
}

// ── MCP types ──

export interface MCPServerConfig {
  name: string;
  url: string;
  type: 'remote' | 'local';
  headers?: Record<string, string>;
}

// ── Export types ──

export interface ToolCallLog {
  version: string;
  catalog: string;
  created: string;
  calls: RecordedToolCall[];
}

export interface LayersInputConfig {
  catalog: string;
  titiler_url: string;
  view: MapViewState;
  collections: Array<string | {
    collection_id: string;
    assets?: Array<string | { id: string; display_name?: string; visible?: boolean }>;
  }>;
}
