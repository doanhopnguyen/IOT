/** Only an origin is accepted: never credentials, paths, queries or fragments. */
export function normalizeServerAddress(input: string): string {
  const raw = input.trim();
  if (!raw) throw new Error('Nhập IP hoặc hostname của backend.');
  const value = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `http://${raw}`;
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('Địa chỉ backend không hợp lệ.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash ||
      (url.pathname !== '/' && url.pathname !== '')) throw new Error('Chỉ nhập http(s)://host:cổng, không kèm đường dẫn hoặc tài khoản.');
  if (!url.hostname || /\s/.test(url.hostname)) throw new Error('Hostname không hợp lệ.');
  return url.origin;
}
