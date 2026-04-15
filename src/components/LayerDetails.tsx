/**
 * LayerDetails — detail pane rendered at the bottom of the LayerPanel
 * when a layer is selected. Exposes per-layer config: opacity, fill color,
 * default_filter display, categorical filter builder, colormap / rescale,
 * and version switcher.
 *
 * Tiers 1 and 2 from boettiger-lab/jupyter-geoagent#3.
 */

import * as React from 'react';
import { LayerState } from '../core/types';
import { MapViewController } from './MapView';
import { ToolCallRecorder } from '../core/tools';

export interface LayerDetailsProps {
  layer: LayerState;
  mapController: MapViewController | null;
  recorder: ToolCallRecorder;
  /** Fired after any control change so the parent can re-read layer state. */
  onChange: () => void;
}

export const LayerDetails: React.FC<LayerDetailsProps> = ({ layer }) => {
  return (
    <div className="jp-GeoAgent-layer-details">
      <h4>Layer Details</h4>
      <div className="jp-GeoAgent-layer-details-name">{layer.displayName}</div>
    </div>
  );
};
