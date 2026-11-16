const MAX_BYTES = 5 * 1024 * 1024;
const STORE_ID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const EXTENSIONS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

function reply(status, data) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

async function readPhoto(body) {
  if (!body) return new Uint8Array();

  const reader = body.getReader();
  const bytes = new Uint8Array(MAX_BYTES);
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return bytes.subarray(0, length);
      if (length + value.byteLength > MAX_BYTES) {
        await reader.cancel();
        return null;
      }
      bytes.set(value, length);
      length += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
}

function matchesFormat(bytes, type) {
  if (type === 'image/png') {
    return bytes.length >= 33 && [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b);
  }
  if (type === 'image/jpeg') {
    return bytes.length > 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  }
  return bytes.length >= 20 && [82, 73, 70, 70].every((b, i) => bytes[i] === b)
    && [87, 69, 66, 80].every((b, i) => bytes[i + 8] === b);
}

export async function onRequestPost({ request, env }) {
  const bucket = env.PAPALITA_PHOTOS;
  if (!bucket || !env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) {
    return reply(503, { code: 'photo_storage_unconfigured', error: 'Photo storage is not configured.' });
  }

  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return reply(401, { error: 'Sign in to upload a photo.' });

  const url = new URL(request.url);
  const storeId = url.searchParams.get('store') || '';
  const kind = url.searchParams.get('kind');
  const type = request.headers.get('Content-Type');
  if (!STORE_ID.test(storeId) || !['logo', 'product'].includes(kind)) {
    return reply(400, { error: 'Choose a valid store and photo type.' });
  }
  if (!Object.hasOwn(EXTENSIONS, type)) return reply(415, { error: 'Use a JPEG, PNG or WebP photo.' });
  if (Number(request.headers.get('Content-Length')) > MAX_BYTES) {
    return reply(413, { error: 'Photo must be 5 MB or smaller.' });
  }

  try {
    const headers = { apikey: env.SUPABASE_PUBLISHABLE_KEY, Authorization: authorization };
    const userResponse = await fetch(new URL('/auth/v1/user', env.SUPABASE_URL), { headers });
    if ([401, 403].includes(userResponse.status)) return reply(401, { error: 'Sign in again to upload a photo.' });
    if (!userResponse.ok) throw new Error('Supabase Auth unavailable');
    const { id: owner } = await userResponse.json();
    if (!STORE_ID.test(owner || '')) return reply(401, { error: 'Sign in again to upload a photo.' });

    const stores = new URL('/rest/v1/stores', env.SUPABASE_URL);
    stores.search = new URLSearchParams({ select: 'id', id: `eq.${storeId}`, owner_id: `eq.${owner}`, status: 'eq.approved', limit: '1' });
    const storeResponse = await fetch(stores, { headers });
    if (!storeResponse.ok) throw new Error('Could not verify store ownership');
    const [store] = await storeResponse.json();
    if (store?.id !== storeId) return reply(403, { error: 'You can only upload photos for your approved store.' });

    const bytes = await readPhoto(request.body);
    if (!bytes) return reply(413, { error: 'Photo must be 5 MB or smaller.' });
    if (!matchesFormat(bytes, type)) return reply(415, { error: 'The file does not match the selected image format.' });

    // A retry with the same file keeps the same URL and cannot overwrite another photo.
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    const hash = Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
    const key = `${storeId}/${kind}/${hash}.${EXTENSIONS[type]}`;
    await bucket.put(key, bytes, {
      onlyIf: new Headers({ 'If-None-Match': '*' }),
      httpMetadata: { contentType: type }
    });
    return reply(200, { publicUrl: new URL(`/merchant-media/${key}`, url.origin).href });
  } catch (error) {
    console.error('Merchant photo upload failed', error.name);
    return reply(502, { error: 'Photo upload is temporarily unavailable. Try again.' });
  }
}
