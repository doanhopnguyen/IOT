import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeServerAddress } from '../src/services/api/serverAddress';
test('accept LAN, Tailscale, DNS, HTTPS and IPv6 origins',()=>{
 assert.equal(normalizeServerAddress(' 100.111.90.116:8080 '),'http://100.111.90.116:8080');
 assert.equal(normalizeServerAddress('https://door.example/'),'https://door.example');
 assert.equal(normalizeServerAddress('http://[fd7a:115c:a1e0::1]:8080'),'http://[fd7a:115c:a1e0::1]:8080');
});
test('reject credential exfiltration paths, URL credentials, non-HTTP and invalid ports',()=>{
 for(const value of ['', 'https://user:pass@evil.example','https://server.example/api/auth','http://server.example?x=1','http://server.example#x','ftp://server.example','http://127.0.0.1:99999'])assert.throws(()=>normalizeServerAddress(value),value);
});
