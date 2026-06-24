import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Set these secrets in Supabase dashboard → Settings → Edge Functions:
//   VAPID_PUBLIC_KEY   — base64url uncompressed P-256 public key (65 bytes)
//   VAPID_PRIVATE_KEY  — base64url raw P-256 private key (32 bytes, the "d" value)
//   VAPID_SUBJECT      — mailto: contact address
const VAPID_PUBLIC_KEY  = Deno.env.get('VAPID_PUBLIC_KEY')  ?? '';
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
const VAPID_SUBJECT     = Deno.env.get('VAPID_SUBJECT')     ?? 'mailto:info@lifesavingequipment.co.nz';

// --- Byte helpers ---

function base64UrlToBytes(b64: string): Uint8Array {
  const padded = b64.replace(/-/g, '+').replace(/_/g, '/');
  const pad = (4 - (padded.length % 4)) % 4;
  const raw = atob(padded + '='.repeat(pad));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function bytesToBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const len = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(len);
  let i = 0;
  for (const a of arrays) { out.set(a, i); i += a.length; }
  return out;
}

function uint32BE(n: number): Uint8Array {
  const b = new ArrayBuffer(4);
  new DataView(b).setUint32(0, n, false);
  return new Uint8Array(b);
}

// --- VAPID JWT (RFC 8292) ---

async function buildVapidJwt(endpoint: string): Promise<string> {
  const { protocol, host } = new URL(endpoint);
  const enc = new TextEncoder();

  const header  = bytesToBase64Url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payload = bytesToBase64Url(enc.encode(JSON.stringify({
    aud: `${protocol}//${host}`,
    exp: Math.floor(Date.now() / 1000) + 43200,
    sub: VAPID_SUBJECT,
  })));

  // Reconstruct private key JWK from raw private key + uncompressed public key
  const pubBytes = base64UrlToBytes(VAPID_PUBLIC_KEY);
  const x = bytesToBase64Url(pubBytes.slice(1, 33));
  const y = bytesToBase64Url(pubBytes.slice(33, 65));

  const signingKey = await crypto.subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', d: VAPID_PRIVATE_KEY, x, y, key_ops: ['sign'] },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );

  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    signingKey,
    enc.encode(`${header}.${payload}`),
  );

  return `${header}.${payload}.${bytesToBase64Url(new Uint8Array(sig))}`;
}

// --- Web Push message encryption (RFC 8291 / RFC 8188 aes128gcm) ---

async function encryptPayload(
  plaintext: string,
  p256dh: string,
  authSecret: string,
): Promise<Uint8Array> {
  const enc        = new TextEncoder();
  const plain      = enc.encode(plaintext);
  const authBytes  = base64UrlToBytes(authSecret);
  const recipBytes = base64UrlToBytes(p256dh);

  const recipPubKey = await crypto.subtle.importKey(
    'raw', recipBytes, { name: 'ECDH', namedCurve: 'P-256' }, true, [],
  );

  // Ephemeral sender key pair
  const ephKP = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'],
  );
  const senderPub = new Uint8Array(await crypto.subtle.exportKey('raw', ephKP.publicKey));

  // ECDH shared secret
  const sharedBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: recipPubKey }, ephKP.privateKey, 256,
  );

  // Random 16-byte salt
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // IKM = HKDF(salt=auth_secret, ikm=ecdh_secret, info="WebPush: info\0" + ua_pub + as_pub, L=32)
  const prkIkm  = await crypto.subtle.importKey('raw', new Uint8Array(sharedBits), 'HKDF', false, ['deriveBits']);
  const ikmInfo = concat(enc.encode('WebPush: info\0'), recipBytes, senderPub);
  const ikm = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: authBytes, info: ikmInfo }, prkIkm, 256,
  ));

  const ikmKey = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);

  // CEK (16 bytes) and nonce (12 bytes)
  const cekBits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info: enc.encode('Content-Encoding: aes128gcm\0') },
    ikmKey, 128,
  );
  const nonceBits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info: enc.encode('Content-Encoding: nonce\0') },
    ikmKey, 96,
  );

  // AES-128-GCM encrypt: plain + 0x02 (last-record delimiter per RFC 8188)
  const aesKey = await crypto.subtle.importKey('raw', new Uint8Array(cekBits), 'AES-GCM', false, ['encrypt']);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: new Uint8Array(nonceBits) },
    aesKey,
    concat(plain, new Uint8Array([0x02])),
  ));

  // aes128gcm body = header + ciphertext
  // header: salt(16) || rs(4 BE) || idlen(1) || keyid(senderPub)
  const header = concat(salt, uint32BE(4096), new Uint8Array([senderPub.length]), senderPub);
  return concat(header, ciphertext);
}

// --- Send one Web Push notification ---

async function sendWebPush(
  endpoint: string,
  p256dh: string,
  auth: string,
  payload: Record<string, unknown>,
): Promise<{ status: number; dead: boolean }> {
  const jwt  = await buildVapidJwt(endpoint);
  const body = await encryptPayload(JSON.stringify(payload), p256dh, auth);

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `vapid t=${jwt},k=${VAPID_PUBLIC_KEY}`,
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      TTL: '86400',
    },
    body,
  });

  const dead = res.status === 404 || res.status === 410;
  if (!res.ok && !dead) {
    const text = await res.text().catch(() => '');
    console.error(`[send-push] push failed status=${res.status}:`, text);
  }
  return { status: res.status, dead };
}

// --- Edge function ---

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  const { member_ids, title, body, url } = await req.json();
  if (!Array.isArray(member_ids) || !member_ids.length || !title || !body) {
    return new Response(JSON.stringify({ error: 'member_ids, title and body are required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  const uniqueIds = Array.from(new Set(member_ids as string[]));

  const { data: subs, error: subErr } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .in('member_id', uniqueIds);

  if (subErr) {
    console.error('[send-push] DB error:', subErr);
    return new Response(JSON.stringify({ error: subErr.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  if (!subs?.length) {
    return new Response(
      JSON.stringify({ sent: false, reason: 'no push subscriptions found', recipients: 0 }),
      { headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
    );
  }

  const pushPayload: Record<string, unknown> = { title, body };
  if (url) pushPayload.url = url;

  let sent = 0;
  const deadIds: string[] = [];

  await Promise.all(
    subs.map(async (sub) => {
      try {
        const result = await sendWebPush(sub.endpoint, sub.p256dh, sub.auth, pushPayload);
        if (result.dead) {
          deadIds.push(sub.id);
          console.log(`[send-push] dead subscription ${sub.id} (${result.status})`);
        } else if (result.status >= 200 && result.status < 300) {
          sent++;
          console.log(`[send-push] delivered to ${sub.id} (${result.status})`);
        }
      } catch (err) {
        console.error(`[send-push] error for subscription ${sub.id}:`, err);
      }
    }),
  );

  if (deadIds.length) {
    const { error: delErr } = await supabase.from('push_subscriptions').delete().in('id', deadIds);
    if (delErr) console.error('[send-push] failed to delete dead subscriptions:', delErr);
    else console.log(`[send-push] removed ${deadIds.length} dead subscription(s)`);
  }

  return new Response(
    JSON.stringify({ sent: sent > 0, recipients: sent, dead: deadIds.length }),
    { headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
  );
});
