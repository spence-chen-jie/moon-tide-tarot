export function parseAllowedOrigins(config = '') {
  return new Set(config.split(',').map(value => value.trim()).filter(Boolean).map(value => {
    let url;
    try { url = new URL(value); } catch { throw new Error('TAROT_ALLOWED_ORIGINS 必须由完整网站来源组成'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== value) {
      throw new Error('TAROT_ALLOWED_ORIGINS 只接受协议、主机和可选端口');
    }
    return url.origin;
  }));
}

export function allowApiRequest(request, response, origins, backendOnly, path) {
  const origin = request.headers.origin;
  const isPreflight = request.method === 'OPTIONS';
  const method = path === '/api/consult' ? 'POST' : 'GET';
  response.setHeader('Vary','Origin');
  if (!origin) return !isPreflight && (!backendOnly || path === '/api/status');
  if (origin !== 'http://' + request.headers.host || backendOnly) {
    if (!origins.has(origin)) return false;
  }
  if (isPreflight && request.headers['access-control-request-method'] !== method) return false;
  response.setHeader('Access-Control-Allow-Origin',origin);
  if (isPreflight) {
    response.setHeader('Access-Control-Allow-Methods',method);
    response.setHeader('Access-Control-Allow-Headers','Content-Type');
    response.setHeader('Access-Control-Max-Age','600');
  }
  return true;
}
