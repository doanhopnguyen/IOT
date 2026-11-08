"""Serve the admin build locally and proxy API/media to the central backend.

Using the frontend hostname for API calls keeps web session cookies same-site.
"""
import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit, unquote
import mimetypes
import requests

ROOT=Path(__file__).resolve().parents[1]
HOP={'connection','keep-alive','proxy-authenticate','proxy-authorization','te','trailers','transfer-encoding','upgrade'}


def handler(upstream, admin):
    class Handler(BaseHTTPRequestHandler):
        protocol_version='HTTP/1.1'

        def log_message(self,*args): pass

        def do_GET(self): self.dispatch()
        def do_HEAD(self): self.dispatch()
        def do_POST(self): self.dispatch()
        def do_PUT(self): self.dispatch()
        def do_PATCH(self): self.dispatch()
        def do_DELETE(self): self.dispatch()
        def do_OPTIONS(self): self.dispatch()

        def dispatch(self):
            path=unquote(urlsplit(self.path).path)
            if path=='/':
                self.send_response(302);self.send_header('Location','/admin/index.html');self.send_header('Content-Length','0');self.end_headers();return
            if path.startswith('/admin/') and self.command in ('GET','HEAD'):
                file=(admin/path[len('/admin/'):]).resolve()
                if not file.is_relative_to(admin.resolve()) or not file.is_file():
                    self.send_error(404);return
                self.send_response(200);self.send_header('Content-Type',mimetypes.guess_type(file)[0] or 'application/octet-stream')
                self.send_header('Content-Length',str(file.stat().st_size));self.end_headers()
                if self.command!='HEAD':
                    with file.open('rb') as stream:
                        import shutil
                        shutil.copyfileobj(stream,self.wfile)
                return
            if not self.path.startswith('/') or self.headers.get('Transfer-Encoding'):
                self.send_error(400);return
            try: length=int(self.headers.get('Content-Length','0'))
            except ValueError: self.send_error(400);return
            if not 0<=length<=21*1024*1024:
                self.send_error(413);return
            body=self.rfile.read(length) if length else None
            connection_headers={v.strip().lower() for v in self.headers.get('Connection','').split(',')}
            headers={k:v for k,v in self.headers.items() if k.lower() not in HOP|connection_headers|{'host','content-length'}}
            started=False
            try:
                with requests.request(self.command,upstream+self.path,headers=headers,data=body,
                                      timeout=(5,90),stream=True,allow_redirects=False) as response:
                    started=True
                    self.send_response(response.status_code)
                    for k in response.raw.headers:
                        if k.lower() not in HOP:
                            for value in response.raw.headers.getlist(k): self.send_header(k,value)
                    self.send_header('Connection','close');self.end_headers();self.close_connection=True
                    if self.command!='HEAD':
                        for block in response.raw.stream(65536,decode_content=False):
                            self.wfile.write(block);self.wfile.flush()
            except requests.RequestException:
                self.close_connection=True
                if not started and not self.wfile.closed:
                    # Upstream failures are retried by the app; no request/credential logging.
                    try: self.send_error(502,'Central backend unavailable')
                    except OSError: pass
            except (BrokenPipeError,ConnectionResetError): self.close_connection=True
    return Handler


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--listen',default='100.109.158.8');p.add_argument('--port',type=int,default=8080)
    p.add_argument('--backend',default='http://100.95.248.100:8080');a=p.parse_args()
    admin=ROOT/'smart-access-control-backend/src/main/resources/static/admin'
    if not (admin/'index.html').is_file(): p.error('Build admin-web first: npm ci; npm run build')
    server=ThreadingHTTPServer((a.listen,a.port),handler(a.backend.rstrip('/'),admin));server.daemon_threads=True
    print(f'Admin + API proxy: http://{a.listen}:{a.port}/admin/index.html',flush=True)
    try: server.serve_forever()
    except KeyboardInterrupt: pass
    finally: server.server_close()


if __name__=='__main__': main()
