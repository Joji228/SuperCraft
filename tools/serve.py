"""Local web server for SuperCraft that tells the browser never to cache files,
so a normal refresh always loads the latest version of the game."""
import http.server
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Expires', '0')
        super().end_headers()


# threaded, so the browser's parallel module requests don't queue behind each other
with http.server.ThreadingHTTPServer(('', PORT), NoCacheHandler) as httpd:
    print(f'SuperCraft running at http://localhost:{PORT}  (close this window to stop)')
    httpd.serve_forever()
