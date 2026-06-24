const ONESIGNAL_APP_ID = 'f625ba7b-3998-43ff-8be4-a4a1fc08ef0b';
const ONESIGNAL_REST_API_KEY = Deno.env.get('ONESIGNAL_REST_API_KEY') ?? '';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  const { member_ids, title, body, url } = await req.json();
  if (!Array.isArray(member_ids) || member_ids.length === 0 || !title || !body) {
    return new Response(JSON.stringify({ error: 'member_ids, title and body are required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  const externalIds = Array.from(new Set(member_ids as string[]));

  // OneSignal v2: target by external_id alias with push channel
  const payload: Record<string, unknown> = {
    app_id: ONESIGNAL_APP_ID,
    target_channel: 'push',
    include_aliases: { external_id: externalIds },
    headings: { en: title },
    contents: { en: body },
  };
  if (url) payload.url = url;

  console.log('[send-push] request body:', JSON.stringify(payload));

  const res = await fetch('https://api.onesignal.com/notifications', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Key ${ONESIGNAL_REST_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json() as Record<string, unknown>;
  console.log('[send-push] response status:', res.status);
  console.log('[send-push] response body:', JSON.stringify(data));

  const recipients = (data.recipients as number) ?? 0;
  const errors = data.errors ?? null;
  const sent = res.status >= 200 && res.status < 300 && recipients > 0 && !errors;

  return new Response(JSON.stringify({
    sent,
    recipients,
    onesignal_id: data.id,
    errors,
    status: res.status,
    onesignal: data,
  }), {
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
});
