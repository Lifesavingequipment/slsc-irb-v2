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

  // member_id IS the OneSignal External ID — the client calls OneSignal.login(memberId)
  // once the push subscription is confirmed, so we can target directly without
  // looking up push_subscriptions for a OneSignal-assigned id.
  const externalIds = Array.from(new Set(member_ids as string[]));

  const onesignalReqBody = {
    app_id: ONESIGNAL_APP_ID,
    target_channel: 'push',
    include_aliases: { external_id: externalIds },
    headings: { en: title },
    contents: { en: body },
    ...(url ? { url } : {}),
  };

  const onesignalRes = await fetch('https://api.onesignal.com/notifications', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Key ${ONESIGNAL_REST_API_KEY}`,
    },
    body: JSON.stringify(onesignalReqBody),
  });

  const onesignalResult = await onesignalRes.json();
  console.log('OneSignal request body:', JSON.stringify(onesignalReqBody));
  console.log('OneSignal response status:', onesignalRes.status);
  console.log('OneSignal response body:', JSON.stringify(onesignalResult));

  if (!onesignalRes.ok) {
    return new Response(JSON.stringify({
      error: 'OneSignal API error',
      status: onesignalRes.status,
      details: onesignalResult,
    }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  // OneSignal can return HTTP 200 with zero recipients and an "errors" field
  // (e.g. "All included players are not subscribed") — that is not a delivery.
  const recipients = onesignalResult.recipients ?? 0;
  const onesignalErrors = onesignalResult.errors ?? null;
  const delivered = recipients > 0 && !onesignalErrors;

  return new Response(JSON.stringify({
    sent: delivered,
    reason: delivered ? undefined : (onesignalErrors ? JSON.stringify(onesignalErrors) : 'OneSignal matched 0 recipients'),
    recipients,
    onesignal_id: onesignalResult.id,
    onesignal_errors: onesignalErrors,
    onesignal: onesignalResult,
  }), {
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
});
