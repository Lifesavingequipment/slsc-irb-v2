import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// Must match the VAPID_PUBLIC_KEY hardcoded in src/lib/push.ts.
const VAPID_PUBLIC_KEY = 'BGlEY4Kti932EYcfbwfAMGKDK6kBcnSUikAYXJT4e2VC30_7s3zUL2ZodS-2NOEBWRn3-9YARtULk5SGL5G3XIg';
// Set VAPID_PRIVATE_KEY secret in Supabase as the full private key JWK JSON string.
const VAPID_PRIVATE_KEY_RAW = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:info@lifesavingequipment.co.nz';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── Base64url helpers ────────────────────────────────────────────────────────

function b64urlDecode(s: string): Uint8Array {
  // Accept both standard base64 and URL-safe base64
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64 + '==='.slice((b64.length + 3) % 4);
  return Uint8Array.from(atob(pad), (c) => c.charCodeAt(0));
}

function b64urlEncode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

// ─── HKDF-SHA-256 (single-block, L ≤ 32 bytes) ───────────────────────────────

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  // Extract: PRK = HMAC-SHA-256(salt, IKM)
  const saltKey = await crypto.subtle.importKey('raw', salt, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const prk = new Uint8Array(await crypto.subtle.sign('HMAC', saltKey, ikm));
  // Expand T(1) = HMAC-SHA-256(PRK, info || 0x01)
  const prkKey = await crypto.subtle.importKey('raw', prk, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const t = new Uint8Array(await crypto.subtle.sign('HMAC', prkKey, new Uint8Array([...info, 0x01])));
  return t.slice(0, length);
}

// ─── RFC 8291 Web Push payload encryption (aes128gcm) ────────────────────────

async function encryptPayload(
  plaintext: string,
  p256dhB64: string, // subscriber p256dh, standard base64 (from btoa in browser)
  authB64: string    // subscriber auth, standard base64 (from btoa in browser)
): Promise<{ body: Uint8Array; contentEncoding: string }> {
  const enc = new TextEncoder();

  const uaPublic = b64urlDecode(p256dhB64);   // 65-byte uncompressed P-256 point
  const authSecret = b64urlDecode(authB64);    // 16-byte auth secret

  // Import subscriber's public key for ECDH
  const uaKey = await crypto.subtle.importKey(
    'raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, true, []
  );

  // Generate ephemeral application server key pair
  const asKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']
  );
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', asKeyPair.publicKey)); // 65 bytes

  // ECDH shared secret
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, asKeyPair.privateKey, 256)
  );

  // Random 16-byte encryption salt
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // RFC 8291 §3.4: IKM = HKDF(salt=auth_secret, ikm=ecdh_secret,
  //                             info="WebPush: info\0" + ua_public + as_public, L=32)
  const prkInfo = new Uint8Array([...enc.encode('WebPush: info\x00'), ...uaPublic, ...asPublic]);
  const ikm = await hkdf(authSecret, ecdhSecret, prkInfo, 32);

  // CEK = HKDF(salt, ikm, "Content-Encoding: aes128gcm\0", 16)
  const cekInfo = new Uint8Array([...enc.encode('Content-Encoding: aes128gcm'), 0x00]);
  const cek = await hkdf(salt, ikm, cekInfo, 16);

  // NONCE = HKDF(salt, ikm, "Content-Encoding: nonce\0", 12)
  const nonceInfo = new Uint8Array([...enc.encode('Content-Encoding: nonce'), 0x00]);
  const nonce = await hkdf(salt, ikm, nonceInfo, 12);

  // Plaintext + 0x02 delimiter (RFC 8188 §2 padding delimiter, no padding)
  const padded = new Uint8Array([...enc.encode(plaintext), 0x02]);

  // AES-128-GCM encryption
  const aesKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, aesKey, padded)
  );

  // RFC 8188 §2.1 content header: salt(16) || rs(4 BE) || idlen(1) || keyid(asPublic, 65)
  const rs = 4096;
  const header = new Uint8Array(21 + asPublic.length);
  header.set(salt, 0);
  header[16] = (rs >>> 24) & 0xff;
  header[17] = (rs >>> 16) & 0xff;
  header[18] = (rs >>> 8) & 0xff;
  header[19] = rs & 0xff;
  header[20] = asPublic.length; // 65
  header.set(asPublic, 21);

  const body = new Uint8Array(header.length + ciphertext.length);
  body.set(header);
  body.set(ciphertext, header.length);

  return { body, contentEncoding: 'aes128gcm' };
}

// ─── VAPID authorization header (RFC 8292) ────────────────────────────────────

async function vapidAuthorization(endpoint: string): Promise<string> {
  const audience = new URL(endpoint).origin;
  const exp = Math.floor(Date.now() / 1000) + 43200; // 12 h

  const enc = new TextEncoder();
  const header = b64urlEncode(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64urlEncode(enc.encode(JSON.stringify({ aud: audience, exp, sub: VAPID_SUBJECT })));
  const sigInput = enc.encode(`${header}.${claims}`);

  const jwk = JSON.parse(VAPID_PRIVATE_KEY_RAW);
  const privateKey = await crypto.subtle.importKey(
    'jwk', jwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false, ['sign']
  );

  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, sigInput);
  const token = `${header}.${claims}.${b64urlEncode(sig)}`;
  return `vapid t=${token},k=${VAPID_PUBLIC_KEY}`;
}

// ─── Deliver one push notification ───────────────────────────────────────────

async function sendWebPush(
  endpoint: string,
  p256dh: string,
  auth: string,
  payload: object
): Promise<{ ok: boolean; status: number }> {
  const { body } = await encryptPayload(JSON.stringify(payload), p256dh, auth);
  const authorization = await vapidAuthorization(endpoint);

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      'TTL': '86400',
      Authorization: authorization,
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error(`[send-push] endpoint rejected: ${res.status} — ${text.slice(0, 200)}`);
  }

  return { ok: res.ok, status: res.status };
}

// ─── Edge function entry point ────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  if (!VAPID_PRIVATE_KEY_RAW) {
    console.error('[send-push] VAPID_PRIVATE_KEY secret is not set');
    return new Response(JSON.stringify({ error: 'VAPID_PRIVATE_KEY secret not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  const { member_ids, title, body, url } = await req.json();
  if (!Array.isArray(member_ids) || member_ids.length === 0 || !title || !body) {
    return new Response(JSON.stringify({ error: 'member_ids, title and body are required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  const supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data: subs, error } = await supabaseClient
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .in('member_id', member_ids);

  if (error) {
    console.error('[send-push] DB error:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  if (!subs || subs.length === 0) {
    return new Response(
      JSON.stringify({ sent: false, reason: 'No push subscriptions for these members', recipients: 0 }),
      { headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
    );
  }

  const payload = { title, body, ...(url ? { url } : {}) };
  const results = await Promise.allSettled(
    subs.map((s) => sendWebPush(s.endpoint, s.p256dh, s.auth, payload))
  );

  const delivered = results.filter((r) => r.status === 'fulfilled' && r.value.ok).length;
  console.log(`[send-push] delivered ${delivered}/${subs.length}`);

  return new Response(
    JSON.stringify({ sent: delivered > 0, recipients: delivered, total: subs.length }),
    { headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
  );
});
