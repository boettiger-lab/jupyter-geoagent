/**
 * Types specific to jupyter-geoagent.
 *
 * STAC, dataset, and tool types are imported from geo-agent's modules
 * (see src/typings/geo-agent.d.ts). This file defines only the types
 * that are unique to the Jupyter extension.
 */

// Import geo-agent types for use in this file, then re-export
import type {
  DatasetEntry as _DatasetEntry,
  MapLayerConfig as _MapLayerConfig,
  ParquetAsset as _ParquetAsset,
  ColumnInfo as _ColumnInfo,
} from 'geo-agent/app/dataset-catalog.js';

// Re-export geo-agent types so components can import from one place
export type DatasetEntry = _DatasetEntry;
export type MapLayerConfig = _MapLayerConfig;
export type ParquetAsset = _ParquetAsset;
export type ColumnInfo = _ColumnInfo;

export type {
  ToolResult,
} from 'geo-agent/app/tool-registry.js';

// ── Tool call recording (jupyter-geoagent specific) ──

export interface RecordedToolCall {
  id: number;
  tool: string;
  args: Record<string, any>;
  result?: string;
  timestamp: string;
}

export interface ToolCallLog {
  version: string;
  catalog: string;
  created: string;
  calls: RecordedToolCall[];
}

// ── Map view state ──

export interface MapViewState {
  center: [number, number];
  zoom: number;
  bearing: number;
  pitch: number;
}

// ── Layer state (UI tracking, not geo-agent's internal state) ──

export interface LayerState {
  id: string;
  datasetId: string;
  assetId: string;
  displayName: string;
  type: 'vector' | 'raster';
  visible: boolean;
  opacity: number;
  fillColor?: string;
  filter?: any[];
  defaultFilter?: any[];
  /** Original paint from MapLayerConfig.defaultStyle — never mutated after addLayer. */
  defaultStyle?: Record<string, any>;
  /** Live paint: seeded from defaultStyle, updated by setStyle. */
  currentStyle?: Record<string, any>;
  colormap?: string;
  rescale?: string;
  sourceId: string;
  sourceLayer?: string;
  columns: ColumnInfo[];
  versions?: Array<{
    label: string;
    assetId: string;
    layerType: string;
    url?: string;
    cogUrl?: string;
    sourceLayer?: string;
    sourceType?: string;
  }>;
  currentVersionIndex?: number;
  /** TiTiler base URL captured at layer creation, so raster retile calls don't need to thread it through. */
  titilerUrl?: string;
  /** The original COG url (raster only), kept so we can rebuild the tiles URL on colormap/rescale change. */
  cogUrl?: string;
}

// ── Export formats ──

export interface LayersInputConfig {
  catalog: string;
  titiler_url: string;
  view: MapViewState;
  collections: Array<string | {
    collection_id: string;
    assets?: Array<string | { id: string; display_name?: string; visible?: boolean }>;
  }>;
}

// ── MCP server configuration ──

export interface MCPServerConfig {
  name: string;
  url: string;
  type: 'remote' | 'local';
  headers?: Record<string, string>;
}
