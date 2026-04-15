"""Server-side handlers for jupyter-geoagent.

Provides an MCP proxy endpoint that relays requests from the frontend
to remote MCP servers, bypassing CORS and network restrictions in
JupyterHub environments.
"""

import json

from jupyter_server.base.handlers import APIHandler
from jupyter_server.utils import url_path_join
import tornado
from tornado.httpclient import AsyncHTTPClient, HTTPRequest


class MCPProxyHandler(APIHandler):
    """Proxy MCP requests to a remote server.

    The frontend POSTs a JSON body with:
      - server_url: the remote MCP server URL
      - payload: the JSON-RPC body to forward
      - headers: optional extra headers (e.g. auth tokens)
    """

    @tornado.web.authenticated
    async def post(self):
        try:
            body = json.loads(self.request.body)
        except json.JSONDecodeError:
            self.set_status(400)
            self.finish(json.dumps({"error": "Invalid JSON body"}))
            return

        server_url = body.get("server_url")
        payload = body.get("payload")
        extra_headers = body.get("headers", {})

        if not server_url or payload is None:
            self.set_status(400)
            self.finish(json.dumps({"error": "server_url and payload are required"}))
            return

        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
        }
        headers.update(extra_headers)

        client = AsyncHTTPClient()
        request = HTTPRequest(
            url=server_url,
            method="POST",
            headers=headers,
            body=json.dumps(payload),
            request_timeout=120,
        )

        try:
            response = await client.fetch(request)
            self.set_status(response.code)
            self.set_header("Content-Type", response.headers.get("Content-Type", "application/json"))
            self.finish(response.body)
        except tornado.httpclient.HTTPError as e:
            self.set_status(e.code if e.code else 502)
            self.finish(json.dumps({
                "error": f"MCP proxy error: {str(e)}",
                "upstream_status": e.code,
            }))
        except Exception as e:
            self.set_status(502)
            self.finish(json.dumps({"error": f"MCP proxy error: {str(e)}"}))


class HealthHandler(APIHandler):
    @tornado.web.authenticated
    def get(self):
        self.finish(json.dumps({"status": "ok"}))


def setup_handlers(web_app):
    host_pattern = ".*$"
    base_url = web_app.settings["base_url"]

    handlers = [
        (url_path_join(base_url, "jupyter-geoagent", "health"), HealthHandler),
        (url_path_join(base_url, "jupyter-geoagent", "mcp-proxy"), MCPProxyHandler),
    ]
    web_app.add_handlers(host_pattern, handlers)
