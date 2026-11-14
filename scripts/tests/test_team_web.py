import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from team_web import proxy_headers


class ProxyHeadersTest(unittest.TestCase):
    upstream = 'http://100.95.248.100:8080'

    def test_https_same_origin_translated_and_session_csrf_preserved(self):
        result = proxy_headers({
            'Host': 'doan-hop.tailad91e1.ts.net',
            'Origin': 'https://doan-hop.tailad91e1.ts.net',
            'X-Forwarded-Proto': 'https',
            'Cookie': 'JSESSIONID=test-only',
            'X-CSRF-TOKEN': 'csrf-test',
        }, self.upstream, trusted_forwarder=True)
        self.assertEqual(result['origin'], self.upstream)
        self.assertEqual(result['cookie'], 'JSESSIONID=test-only')
        self.assertEqual(result['x-csrf-token'], 'csrf-test')
        self.assertNotIn('host', result)
        self.assertNotIn('x-forwarded-proto', result)

    def test_localhost_http_same_origin_translated(self):
        result = proxy_headers({'Host': 'localhost:8080', 'Origin': 'http://localhost:8080'}, self.upstream)
        self.assertEqual(result['origin'], self.upstream)

    def test_foreign_and_null_origins_still_checked_by_backend(self):
        for origin in ('https://attacker.invalid', 'null', 'https://admin.example:444', 'http://admin.example'):
            with self.subTest(origin=origin):
                result = proxy_headers({'Host': 'admin.example', 'Origin': origin,
                                        'X-Forwarded-Proto': 'https'}, self.upstream, trusted_forwarder=True)
                self.assertEqual(result['origin'], origin)

    def test_network_clients_cannot_claim_forwarded_https(self):
        result = proxy_headers({'Host': 'admin.example', 'Origin': 'https://admin.example',
                                'X-Forwarded-Proto': 'https'}, self.upstream)
        self.assertEqual(result['origin'], 'https://admin.example')

    def test_forwarded_and_connection_headers_removed(self):
        result = proxy_headers({'Host': 'admin.example', 'Forwarded': 'host=spoofed.invalid',
                                'X-Forwarded-Host': 'spoofed.invalid', 'X-Forwarded-For': '1.2.3.4',
                                'Connection': 'keep-alive, X-Internal', 'X-Internal': 'secret',
                                'Content-Length': '123', 'Content-Type': 'application/json'}, self.upstream)
        self.assertEqual(result, {'content-type': 'application/json'})

    def test_absent_origin_stays_absent(self):
        self.assertNotIn('origin', proxy_headers({'Host': 'localhost:8080'}, self.upstream))


if __name__ == '__main__':
    unittest.main()
