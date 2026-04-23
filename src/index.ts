/**
 * jupyter-geoagent — JupyterLab extension entry point.
 *
 * Registers a "GeoAgent Map" command and launcher entry.
 * Opening it creates a GeoAgentPanel in the main area.
 */

import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin,
  ILayoutRestorer,
} from '@jupyterlab/application';

import { ILauncher } from '@jupyterlab/launcher';
import { WidgetTracker } from '@jupyterlab/apputils';
import { LabIcon } from '@jupyterlab/ui-components';
import { GeoAgentPanel } from './panel';
import { registerGeoAgentCommands } from './commands';
import geoagentIconSvg from '../style/geoagent-icon.svg';

const geoagentIcon = new LabIcon({
  name: 'geoagent:icon',
  svgstr: geoagentIconSvg,
});

const COMMAND_ID = 'geoagent:open';
const PLUGIN_ID = '@boettiger-lab/jupyter-geoagent:plugin';

// Default settings — can be overridden via JupyterLab settings schema
const DEFAULTS = {
  catalogUrl: 'https://s3-west.nrp-nautilus.io/public-data/stac/catalog.json',
  titilerUrl: 'https://titiler.nrp-nautilus.io',
  mcpServerUrl: 'https://duckdb-mcp.nrp-nautilus.io/mcp',
  useProxy: true,
};

const plugin: JupyterFrontEndPlugin<void> = {
  id: PLUGIN_ID,
  description: 'Interactive geospatial data exploration via STAC catalogs and MCP queries.',
  autoStart: true,
  optional: [ILauncher, ILayoutRestorer],

  activate: (
    app: JupyterFrontEnd,
    launcher: ILauncher | null,
    restorer: ILayoutRestorer | null,
  ) => {
    console.log('jupyter-geoagent extension activated');
    registerGeoAgentCommands(app);

    const tracker = new WidgetTracker<GeoAgentPanel>({ namespace: 'geoagent' });

    if (restorer) {
      restorer.restore(tracker, {
        command: COMMAND_ID,
        name: () => 'geoagent',
      });
    }

    app.commands.addCommand(COMMAND_ID, {
      label: 'GeoAgent Map',
      icon: geoagentIcon,
      caption: 'Open an interactive geospatial map explorer',
      execute: () => {
        const panel = new GeoAgentPanel({
          serverSettings: app.serviceManager.serverSettings,
          defaultCatalogUrl: DEFAULTS.catalogUrl,
          titilerUrl: DEFAULTS.titilerUrl,
          mcpServerUrl: DEFAULTS.mcpServerUrl || undefined,
          useProxy: DEFAULTS.useProxy,
        });

        app.shell.add(panel, 'main');
        tracker.add(panel);
      },
    });

    if (launcher) {
      launcher.add({
        command: COMMAND_ID,
        category: 'Other',
        rank: 10,
      });
    }
  },
};

export default plugin;
