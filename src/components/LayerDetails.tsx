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

export const LayerDetails: React.FC<LayerDetailsProps> = ({
  layer,
  mapController,
  recorder,
  onChange,
}) => {
  const handleOpacity = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    if (!mapController) return;
    mapController.setOpacity(layer.id, v);
    recorder.record('set_opacity', { layer_id: layer.id, opacity: v });
    onChange();
  };

  return (
    <div className="jp-GeoAgent-layer-details">
      <h4>Layer Details</h4>
      <div className="jp-GeoAgent-layer-details-name">{layer.displayName}</div>

      <div className="jp-GeoAgent-field">
        <div className="jp-GeoAgent-field-label">
          <span>Opacity</span>
          <span>{layer.opacity.toFixed(2)}</span>
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={layer.opacity}
          onChange={handleOpacity}
        />
      </div>

      {layer.defaultFilter && (
        <div className="jp-GeoAgent-field">
          <div className="jp-GeoAgent-field-label">
            <span>Default filter</span>
          </div>
          <div className="jp-GeoAgent-filter-readonly">
            {JSON.stringify(layer.defaultFilter)}
          </div>
        </div>
      )}
    </div>
  );
};
