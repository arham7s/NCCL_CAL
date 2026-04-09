#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import mimetypes
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Dict

from broker_catalog import get_bootstrap_payload
from margin_engine import calculate_portfolio


WEB_DIR = Path(__file__).parent / "web"


class BrokerCalculatorHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        if self.path in {"/", "/index.html"}:
            self._serve_file("index.html")
            return
        if self.path == "/api/bootstrap":
            self._send_json(get_bootstrap_payload())
            return
        if self.path.startswith("/static/"):
            self._serve_file(self.path.removeprefix("/static/"))
            return
        self.send_error(HTTPStatus.NOT_FOUND, "Not found")

    def do_POST(self) -> None:
        if self.path != "/api/calculate":
            self.send_error(HTTPStatus.NOT_FOUND, "Not found")
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            raw_body = self.rfile.read(length)
            payload = json.loads(raw_body or b"{}")
            self._send_json(calculate_portfolio(payload))
        except ValueError as exc:
            self._send_json({"error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
        except Exception as exc:  # pragma: no cover
            self._send_json(
                {"error": f"Unexpected server error: {exc}"},
                status=HTTPStatus.INTERNAL_SERVER_ERROR,
            )

    def _serve_file(self, file_name: str) -> None:
        path = (WEB_DIR / file_name).resolve()
        if not str(path).startswith(str(WEB_DIR.resolve())) or not path.exists():
            self.send_error(HTTPStatus.NOT_FOUND, "Asset not found")
            return
        content_type, _ = mimetypes.guess_type(path.name)
        payload = path.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type or "application/octet-stream")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def _send_json(
        self,
        payload: Dict[str, Any],
        status: HTTPStatus = HTTPStatus.OK,
    ) -> None:
        encoded = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def log_message(self, format: str, *args: Any) -> None:
        return


def build_argument_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Run NCCL CAL, an India-focused broker-style margin calculator."
    )
    parser.add_argument("--host", default="127.0.0.1", help="Host to bind.")
    parser.add_argument("--port", default=8181, type=int, help="Port to bind.")
    return parser


def main() -> int:
    parser = build_argument_parser()
    args = parser.parse_args()
    server = ThreadingHTTPServer((args.host, args.port), BrokerCalculatorHandler)
    print(f"NCCL CAL running at http://{args.host}:{args.port}")
    print("Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server.")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
