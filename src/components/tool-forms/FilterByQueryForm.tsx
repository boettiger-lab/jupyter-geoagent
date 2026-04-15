/**
 * FilterByQueryForm — wraps geo-agent's filter_by_query tool. Runs a
 * SQL SELECT via MCP; keeps only features whose id_property appears in
 * the result. Rendered only when an MCPClientWrapper is available.
 */

import * as React from 'react';
import { LayerState } from '../../core/types';
import { MapViewController } from '../MapView';
import { ToolCallRecorder } from '../../core/tools';
import { MCPClientWrapper } from '../../core/mcp';
import { getToolMetadata } from '../../core/tool-metadata';

export interface FilterByQueryFormProps {
  layer: LayerState;
  mapController: MapViewController;
  recorder: ToolCallRecorder;
  mcpClient: MCPClientWrapper;
  onChange: () => void;
}

export const FilterByQueryForm: React.FC<FilterByQueryFormProps> = ({
  layer,
  mapController,
  recorder,
  mcpClient,
  onChange,
}) => {
  const [sql, setSql] = React.useState('');
  const [idProperty, setIdProperty] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [info, setInfo] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    setSql('');
    setIdProperty('');
    setError(null);
    setInfo(null);
  }, [layer.id]);

  const meta = React.useMemo(() => getToolMetadata(mapController), [mapController]);
  const desc = meta['filter_by_query']?.description ?? '';

  const apply = async () => {
    setError(null);
    setInfo(null);
    if (!sql.trim() || !idProperty.trim()) {
      setError('SQL and ID property are both required.');
      return;
    }
    setBusy(true);
    try {
      const result = await mapController.filterByQuery(layer.id, sql, idProperty, mcpClient);
      if (!result.success) {
        setError((result as { success: false; error: string }).error);
      } else {
        recorder.record('filter_by_query', {
          layer_id: layer.id,
          sql,
          id_property: idProperty,
          id_count: result.idCount,
        });
        if (result.idCount === 0) {
          setInfo(result.message ?? 'Query matched no features.');
        } else {
          setInfo(`Applied — ${result.idCount} feature${result.idCount === 1 ? '' : 's'} match.`);
        }
        onChange();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="jp-GeoAgent-field jp-GeoAgent-tool-form">
      <div className="jp-GeoAgent-field-label">
        <span>Filter by SQL query</span>
      </div>
      <textarea
        className="jp-GeoAgent-textarea"
        rows={4}
        value={sql}
        onChange={e => setSql(e.target.value)}
        placeholder="SELECT HYBAS_ID FROM read_parquet('s3://...') WHERE UP_AREA > 50000"
      />
      <div className="jp-GeoAgent-field-row">
        <span className="jp-GeoAgent-field-label">ID property</span>
        <input
          type="text"
          className="jp-GeoAgent-input"
          value={idProperty}
          onChange={e => setIdProperty(e.target.value)}
          placeholder="_cng_fid"
        />
      </div>
      {error && <div className="jp-GeoAgent-error">{error}</div>}
      {info && <div className="jp-GeoAgent-info">{info}</div>}
      <div className="jp-GeoAgent-field-row">
        <button
          className="jp-GeoAgent-button jp-GeoAgent-button-small"
          onClick={apply}
          disabled={busy}
        >
          {busy ? 'Running…' : 'Apply'}
        </button>
      </div>
      {desc && (
        <details className="jp-GeoAgent-tool-form-help">
          <summary>SQL filter syntax (from geo-agent)</summary>
          <pre>{desc}</pre>
        </details>
      )}
    </div>
  );
};
