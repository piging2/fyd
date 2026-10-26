async function rpc(op, pathname, body, options) {
  const response = await fetch(`http://127.0.0.1:${process.env.FYD_P0_STORAGE_PORT}/rpc`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ actor: process.env.FYD_P0_ACTOR, op, pathname, body, options }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? 'P0 injected storage failure');
  return result;
}
export async function list() { return rpc('list'); }
export async function get(pathname) {
  const { record } = await rpc('get', pathname);
  return record ? { stream: new Response(JSON.stringify(record)).body } : null;
}
export async function put(pathname, body, options) {
  return rpc('put', pathname, JSON.parse(body), {
    allowOverwrite: options.allowOverwrite, addRandomSuffix: options.addRandomSuffix,
    access: options.access,
  });
}
