export function backendOrigin(value = process.env.TAROT_API_BASE) {
  let url;
  try { url = new URL(value); } catch { throw new Error('请配置 TAROT_API_BASE 为公开的 HTTPS 后端来源'); }
  if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
    throw new Error('TAROT_API_BASE 必须是 HTTPS 来源，不含路径、查询参数或凭据');
  }
  return url.origin;
}
