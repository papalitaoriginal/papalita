const STORE_ID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const IMAGE_FILE = /^[a-f0-9]{64}\.(jpg|png|webp)$/;

function unavailable(status) {
  return new Response(null, { status, headers: { 'Cache-Control': 'no-store' } });
}

async function photo({ request, env, params, waitUntil }) {
  if (!STORE_ID.test(params.storeId) || !['logo', 'product'].includes(params.kind) || !IMAGE_FILE.test(params.file)) {
    return unavailable(404);
  }

  const bucket = env.PAPALITA_PHOTOS;
  if (!bucket) return unavailable(503);
  const head = request.method === 'HEAD';
  const url = new URL(request.url);
  url.search = '';
  const cacheKey = new Request(url);
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return head ? new Response(null, { headers: cached.headers }) : cached;

  const key = `${params.storeId}/${params.kind}/${params.file}`;
  const object = head ? await bucket.head(key) : await bucket.get(key);
  if (!object) return unavailable(404);
  const headers = new Headers({
    'Cache-Control': 'public, max-age=31536000, immutable',
    'Content-Type': object.httpMetadata.contentType,
    'Content-Length': String(object.size),
    'X-Content-Type-Options': 'nosniff',
    ETag: object.httpEtag
  });
  const response = new Response(head ? null : object.body, { headers });
  if (!head) waitUntil(cache.put(cacheKey, response.clone()).catch(() => {}));
  return response;
}

export const onRequestGet = photo;
export const onRequestHead = photo;
