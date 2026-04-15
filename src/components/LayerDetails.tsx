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
  const [filterColumn, setFilterColumn] = React.useState<string>('');
  const [filterValues, setFilterValues] = React.useState<string[]>([]);

  // Reset the builder when the selected layer changes.
  React.useEffect(() => {
    setFilterColumn('');
    setFilterValues([]);
  }, [layer.id]);

  const columnsWithValues = React.useMemo(
    () => layer.columns.filter(c => c.values && c.values.length > 0),
    [layer.columns]
  );

  const activeColumn = columnsWithValues.find(c => c.name === filterColumn);

  const applyCategoricalFilter = () => {
    if (!mapController) return;
    if (!filterColumn || filterValues.length === 0) {
      mapController.clearFilter(layer.id);
      recorder.record('clear_filter', { layer_id: layer.id });
    } else {
      // MapLibre `match` expression: ["match", ["get", col], [v1, v2, ...], true, false]
      const expr: any[] = ['match', ['get', filterColumn], filterValues, true, false];
      mapController.setFilter(layer.id, expr);
      recorder.record('set_filter', { layer_id: layer.id, filter: expr });
    }
    onChange();
  };

  const toggleValue = (v: string) => {
    setFilterValues(prev =>
      prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v]
    );
  };

  // Rescale is a "min,max" string on LayerState; split for the two inputs.
  const [rescaleMin, rescaleMax] = React.useMemo(() => {
    if (!layer.rescale) return ['', ''];
    const [a, b] = layer.rescale.split(',');
    return [a ?? '', b ?? ''];
  }, [layer.rescale]);

  const [minInput, setMinInput] = React.useState(rescaleMin);
  const [maxInput, setMaxInput] = React.useState(rescaleMax);

  React.useEffect(() => {
    setMinInput(rescaleMin);
    setMaxInput(rescaleMax);
  }, [rescaleMin, rescaleMax, layer.id]);

  const applyRescale = () => {
    if (!mapController) return;
    const trimmedMin = minInput.trim();
    const trimmedMax = maxInput.trim();
    const rescale = (trimmedMin && trimmedMax) ? `${trimmedMin},${trimmedMax}` : undefined;
    mapController.setRescale(layer.id, rescale);
    recorder.record('set_rescale', { layer_id: layer.id, rescale: rescale ?? null });
    onChange();
  };

  const handleColormap = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const cm = e.target.value;
    if (!mapController) return;
    mapController.setColormap(layer.id, cm);
    recorder.record('set_colormap', { layer_id: layer.id, colormap: cm });
    onChange();
  };

  const handleVersionSwitch = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const idx = parseInt(e.target.value, 10);
    if (!mapController || isNaN(idx)) return;
    mapController.switchVersion(layer.id, idx);
    recorder.record('switch_version', {
      layer_id: layer.id,
      version_index: idx,
      version_label: layer.versions?.[idx]?.label,
    });
    onChange();
  };

  const COLORMAPS = [
    'viridis', 'plasma', 'inferno', 'magma', 'cividis',
    'turbo', 'reds', 'blues', 'greens', 'greys',
    'ylgnbu', 'ylorrd', 'rdylgn', 'spectral',
  ];

  const handleOpacity = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    if (!mapController) return;
    mapController.setOpacity(layer.id, v);
    recorder.record('set_opacity', { layer_id: layer.id, opacity: v });
    onChange();
  };

  const handleFillColor = (e: React.ChangeEvent<HTMLInputElement>) => {
    const c = e.target.value;
    if (!mapController) return;
    mapController.setFillColor(layer.id, c);
    recorder.record('set_fill_color', { layer_id: layer.id, color: c });
    onChange();
  };

  return (
    <div className="jp-GeoAgent-layer-details">
      <h4>Layer Details</h4>
      <div className="jp-GeoAgent-layer-details-name">{layer.displayName}</div>

      {layer.versions && layer.versions.length > 1 && (
        <div className="jp-GeoAgent-field">
          <div className="jp-GeoAgent-field-label">
            <span>Version</span>
          </div>
          <select
            className="jp-GeoAgent-input"
            value={layer.currentVersionIndex ?? 0}
            onChange={handleVersionSwitch}
          >
            {layer.versions.map((v, i) => (
              <option key={v.assetId} value={i}>{v.label}</option>
            ))}
          </select>
        </div>
      )}

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

      {layer.type === 'vector' && (
        <div className="jp-GeoAgent-field">
          <div className="jp-GeoAgent-field-label">
            <span>Fill color</span>
            <span>{layer.fillColor ?? '—'}</span>
          </div>
          <input
            type="color"
            value={layer.fillColor ?? '#2E7D32'}
            onChange={handleFillColor}
          />
        </div>
      )}

      {layer.type === 'vector' && columnsWithValues.length > 0 && (
        <div className="jp-GeoAgent-field">
          <div className="jp-GeoAgent-field-label">
            <span>Filter by column</span>
            {layer.filter && (
              <button
                className="jp-GeoAgent-button jp-GeoAgent-button-small"
                onClick={() => {
                  if (!mapController) return;
                  mapController.clearFilter(layer.id);
                  recorder.record('clear_filter', { layer_id: layer.id });
                  setFilterColumn('');
                  setFilterValues([]);
                  onChange();
                }}
              >
                Clear
              </button>
            )}
          </div>
          <select
            className="jp-GeoAgent-input"
            value={filterColumn}
            onChange={e => { setFilterColumn(e.target.value); setFilterValues([]); }}
          >
            <option value="">— column —</option>
            {columnsWithValues.map(c => (
              <option key={c.name} value={c.name}>{c.name}</option>
            ))}
          </select>
          {activeColumn && (
            <>
              <div
                style={{
                  maxHeight: 140,
                  overflowY: 'auto',
                  border: '1px solid var(--jp-border-color2)',
                  borderRadius: 3,
                  padding: '4px 6px',
                }}
              >
                {activeColumn.values!.map(v => (
                  <label
                    key={v}
                    style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--jp-ui-font-size0)' }}
                  >
                    <input
                      type="checkbox"
                      checked={filterValues.includes(v)}
                      onChange={() => toggleValue(v)}
                    />
                    <span>{v}</span>
                  </label>
                ))}
              </div>
              <button
                className="jp-GeoAgent-button jp-GeoAgent-button-small"
                disabled={filterValues.length === 0}
                onClick={applyCategoricalFilter}
              >
                Apply filter ({filterValues.length})
              </button>
            </>
          )}
        </div>
      )}

      {layer.type === 'raster' && (
        <>
          <div className="jp-GeoAgent-field">
            <div className="jp-GeoAgent-field-label">
              <span>Colormap</span>
            </div>
            <select
              className="jp-GeoAgent-input"
              value={layer.colormap ?? 'reds'}
              onChange={handleColormap}
            >
              {COLORMAPS.map(cm => (
                <option key={cm} value={cm}>{cm}</option>
              ))}
            </select>
          </div>

          <div className="jp-GeoAgent-field">
            <div className="jp-GeoAgent-field-label">
              <span>Rescale (min, max)</span>
            </div>
            <div className="jp-GeoAgent-field-row">
              <input
                type="number"
                className="jp-GeoAgent-input"
                value={minInput}
                placeholder="min"
                onChange={e => setMinInput(e.target.value)}
              />
              <input
                type="number"
                className="jp-GeoAgent-input"
                value={maxInput}
                placeholder="max"
                onChange={e => setMaxInput(e.target.value)}
              />
              <button className="jp-GeoAgent-button jp-GeoAgent-button-small" onClick={applyRescale}>
                Apply
              </button>
            </div>
          </div>
        </>
      )}

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
