const ONESIGNAL_APP_ID = 'f625ba7b-3998-43ff-8be4-a4a1fc08ef0b';
const ONESIGNAL_REST_API_KEY = Deno.env.get('ONESIGNAL_REST_API_KEY') ?? '';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function sendToOneSignal(body: Record<string, unknown>): Promise<{ status: number; data: Record<string, unknown> }> {
  console.log('[send-push] OneSignal request body:', JSON.stringify(body));
  const res = await fetch('https://api.onesignal.com/notifications', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Key ${ONESIGNAL_REST_API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  console.log('[send-push] OneSignal response status:', res.status);
  console.log('[send-push] OneSignal response body:', JSON.stringify(data));
  return { status: res.status, data };
}

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
  const urlProp = url ? { url } : {};

  // Attempt 1: include_aliases + target_channel (current documented format)
  const attempt1Body = {
    app_id: ONESIGNAL_APP_ID,
    include_aliases: { external_id: externalIds },
    target_channel: 'push',
    headings: { en: title },
    contents: { en: body },
    ...urlProp,
  };

  console.log('[send-push] Attempt 1: include_aliases + target_channel');
  const attempt1 = await sendToOneSignal(attempt1Body);

  const attempt1Recipients = attempt1.data.recipients ?? 0;
  const attempt1Errors = attempt1.data.errors ?? null;

  if (attempt1.status >= 200 && attempt1.status < 300 && (attempt1Recipients as number) > 0 && !attempt1Errors) {
    console.log('[send-push] Attempt 1 succeeded with', attempt1Recipients, 'recipients');
    return new Response(JSON.stringify({
      sent: true,
      method: 'include_aliases',
      recipients: attempt1Recipients,
      onesignal_id: attempt1.data.id,
      onesignal: attempt1.data,
    }), {
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  console.log('[send-push] Attempt 1 returned', attempt1Recipients, 'recipients — trying legacy include_external_user_ids');

  // Attempt 2: legacy include_external_user_ids + channel_for_external_user_ids
  const attempt2Body = {
    app_id: ONESIGNAL_APP_ID,
    include_external_user_ids: externalIds,
    channel_for_external_user_ids: 'push',
    headings: { en: title },
    contents: { en: body },
    ...urlProp,
  };

  console.log('[send-push] Attempt 2: include_external_user_ids + channel_for_external_user_ids');
  const attempt2 = await sendToOneSignal(attempt2Body);

  const attempt2Recipients = attempt2.data.recipients ?? 0;
  const attempt2Errors = attempt2.data.errors ?? null;
  const attempt2Delivered = attempt2.status >= 200 && attempt2.status < 300 && (attempt2Recipients as number) > 0 && !attempt2Errors;

  return new Response(JSON.stringify({
    sent: attempt2Delivered,
    method: attempt2Delivered ? 'include_external_user_ids' : 'none',
    reason: attempt2Delivered
      ? undefined
      : (attempt2Errors ? JSON.stringify(attempt2Errors) : 'Both attempts matched 0 recipients'),
    attempt1: {
      recipients: attempt1Recipients,
      errors: attempt1Errors,
      status: attempt1.status,
      id: attempt1.data.id,
    },
    attempt2: {
      recipients: attempt2Recipients,
      errors: attempt2Errors,
      status: attempt2.status,
      id: attempt2.data.id,
    },
    recipients: attempt2Delivered ? attempt2Recipients : 0,
    onesignal_id: attempt2Delivered ? attempt2.data.id : undefined,
    onesignal: attempt2.data,
  }), {
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
});
