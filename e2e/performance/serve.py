#!/usr/bin/env python3
"""Serve an Expo web export on loopback, including client-router deep links."""

import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit


class SpaHandler(SimpleHTTPRequestHandler):
    def send_head(self):
        decoded_path = unquote(urlsplit(self.path).path)
        if "\x00" in decoded_path or "\\" in decoded_path:
            self.send_error(400, "Invalid path")
            return None

        root = Path(self.directory).resolve()
        requested = (root / decoded_path.lstrip("/")).resolve()
        if not requested.is_relative_to(root):
            self.send_error(403, "Path is outside the export")
            return None

        if requested.is_file():
            return super().send_head()
        if requested.is_dir() and (requested / "index.html").is_file():
            self.path = "/" + str((requested / "index.html").relative_to(root))
            return self.send_head()
        if Path(decoded_path).suffix:
            self.send_error(404, "Asset not found")
            return None

        self.path = "/index.html"
        return self.send_head()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="Expo web export directory")
    parser.add_argument("--port", type=int, default=4191)
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error("--port must be between 1 and 65535")
    root = args.directory.resolve()
    if not (root / "index.html").is_file():
        parser.error("directory must contain index.html")

    handler = partial(SpaHandler, directory=str(root))
    server = ThreadingHTTPServer(("127.0.0.1", args.port), handler)
    print(f"Serving {root} at http://127.0.0.1:{args.port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
