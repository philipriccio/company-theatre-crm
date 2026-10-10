"""Offline router grammar/selection proof using a caller-supplied Traefik 3.6 binary.

Runs loopback-only disposable backends. Private backend returns 401; this proves
router selection, not deployment authentication/credentials or TLS issuance.
"""
import http.client
import http.server
import json
import os
from pathlib import Path
import subprocess
import tempfile
import threading
import time

ROOT = Path(__file__).resolve().parents[1]
proposal = json.loads((ROOT / 'reports/delivery-readiness-2026-10-10/proposed-public-email-router.json').read_text())


def backend(status):
    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            self.send_response(status)
            self.end_headers()

        do_HEAD = do_POST = do_PUT = do_DELETE = do_OPTIONS = do_PATCH = do_GET

        def log_message(self, *args):
            pass
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


public, private = backend(200), backend(401)
# Preserve exact production host/rule/priority; replace only infrastructure refs.
router = proposal['http']['routers']['crm-public-email']
router.update(entryPoints=['proof'], service='public')
router.pop('middlewares')
router.pop('tls')
proposal['http']['routers']['private'] = {
    'entryPoints': ['proof'], 'rule': 'Host(`crm.companytheatre.ca`)',
    'priority': 1, 'service': 'private',
}
proposal['http']['services'] = {
    name: {'loadBalancer': {'servers': [{'url': f'http://127.0.0.1:{server.server_port}'}]}}
    for name, server in [('public', public), ('private', private)]
}
cases = []
for path in ['/unsubscribe/synthetic', '/api/unsubscribe/synthetic', '/api/track/open/synthetic', '/api/track/click/synthetic', '/_next/static/chunks/synthetic.js']:
    cases += [(method, path, 200) for method in ['GET', 'HEAD']]
cases += [('POST', '/api/unsubscribe/synthetic', 200), ('POST', '/api/webhooks/ses', 200)]
for path in ['/', '/contacts', '/campaigns', '/settings', '/api/contacts', '/api/campaigns/synthetic/send', '/api/campaigns/synthetic/test', '/api/intake/scratch', '/api/cron/send-scheduled', '/api/webhooks/sendgrid', '/unsubscribe', '/unsubscribe/a/b', '/unsubscribe-admin/a', '/api/unsubscribe/a/admin', '/api/webhooks/ses-extra', '/_next/server/app/contacts', '/api/website-signups']:
    cases += [(method, path, 401) for method in ['GET', 'POST']]
cases += [('GET', '/api/webhooks/ses', 401), ('HEAD', '/api/webhooks/ses', 401)]
for method in ['PUT', 'DELETE', 'PATCH', 'OPTIONS']:
    cases += [(method, path, 401) for path in ['/unsubscribe/a', '/api/unsubscribe/a', '/api/track/open/a', '/_next/static/a.js', '/api/webhooks/ses']]
# Encoded traversal/slashes must never arrive at the public backend.
encoded = ['/_next/static/../../api/contacts', '/_next/static/%2e%2e/%2e%2e/api/contacts', '/unsubscribe/a%2fb', '/api/unsubscribe/a%2fadmin', '/api/webhooks/ses%2f..%2fcontacts', '/unsubscribe/%2e%2e/contacts']

with tempfile.TemporaryDirectory(prefix='crm-router-proof-') as tmp:
    config = Path(tmp) / 'dynamic.json'
    config.write_text(json.dumps(proposal))
    with (Path(tmp) / 'traefik.log').open('w+') as log:
        process = subprocess.Popen([os.environ['TRAEFIK_BINARY'], '--entrypoints.proof.address=127.0.0.1:18379', '--providers.file.filename=' + str(config), '--log.level=ERROR', '--global.checknewversion=false', '--global.sendanonymoususage=false'], stdout=log, stderr=log)
        try:
            def request(method, path, host='crm.companytheatre.ca'):
                connection = http.client.HTTPConnection('127.0.0.1', 18379, timeout=5)
                connection.request(method, path, headers={'Host': host})
                response = connection.getresponse()
                status = response.status
                response.read()
                connection.close()
                return status
            for attempt in range(50):
                try:
                    if request('GET', '/') == 401:
                        break
                except OSError:
                    pass
                time.sleep(.1)
            for method, path, expected in cases:
                actual = request(method, path)
                assert actual == expected, (method, path, expected, actual)
                print(f'PASS {method} {path}: {actual}')
            for path in encoded:
                actual = request('GET', path)
                assert actual in [400, 401, 404], (path, actual)
                print(f'PASS encoded GET {path}: {actual}')
            assert request('GET', '/unsubscribe/a', 'other.example') == 404
            print(f'PASS {len(cases) + len(encoded) + 1} route cases; real Traefik grammar and file provider. No production writes.')
        finally:
            process.terminate()
            process.wait(timeout=10)
            public.shutdown()
            private.shutdown()
