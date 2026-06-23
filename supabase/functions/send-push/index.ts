import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
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

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data: subs, error } = await supabase
    .from('push_subscriptions')
    .select('onesignal_player_id')
    .in('member_id', member_ids);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  const playerIds = Array.from(new Set((subs ?? []).map((s) => s.onesignal_player_id)));
  if (playerIds.length === 0) {
    return new Response(JSON.stringify({ sent: false, reason: 'No push subscriptions for these members' }), {
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  // api.onesignal.com (new REST API, os_v2_app_ key) targets devices via include_subscription_ids,
  // not the legacy include_player_ids. See https://documentation.onesignal.com/reference/create-notification.
  const onesignalReqBody = {
    app_id: ONESIGNAL_APP_ID,
    include_subscription_ids: playerIds,
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
