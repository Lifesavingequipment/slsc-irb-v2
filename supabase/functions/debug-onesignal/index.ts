const ONESIGNAL_APP_ID = 'f625ba7b-3998-43ff-8be4-a4a1fc08ef0b';
const ONESIGNAL_REST_API_KEY = Deno.env.get('ONESIGNAL_REST_API_KEY') ?? '';
const TEST_EXTERNAL_ID = 'faf80d75-3b72-4cdd-a1a1-61c9041ff013';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function onesignalGet(url: string) {
  console.log('[debug-onesignal] GET', url);
  const res = await fetch(url, {
    headers: { Authorization: `Key ${ONESIGNAL_REST_API_KEY}` },
  });
  let body: unknown;
  try { body = await res.json(); } catch { body = await res.text(); }
  console.log('[debug-onesignal] GET status:', res.status);
  console.log('[debug-onesignal] GET body:', JSON.stringify(body));
  return { status: res.status, body };
}

async function onesignalPost(label: string, payload: unknown) {
  console.log(`[debug-onesignal] POST attempt ${label}:`, JSON.stringify(payload));
  const res = await fetch('https://api.onesignal.com/notifications', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Key ${ONESIGNAL_REST_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });
  let body: unknown;
  try { body = await res.json(); } catch { body = await res.text(); }
  console.log(`[debug-onesignal] POST attempt ${label} status:`, res.status);
  console.log(`[debug-onesignal] POST attempt ${label} body:`, JSON.stringify(body));
  return { status: res.status, body };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  const keyPreview = ONESIGNAL_REST_API_KEY
    ? `${ONESIGNAL_REST_API_KEY.slice(0, 6)}...${ONESIGNAL_REST_API_KEY.slice(-4)}`
    : '(empty)';

  // GET full user data to inspect subscription types
  const userResult = await onesignalGet(
    `https://api.onesignal.com/apps/${ONESIGNAL_APP_ID}/users/by/external_id/${TEST_EXTERNAL_ID}`
  );

  const userBody = userResult.body as Record<string, unknown>;
  const identity = (userBody?.identity ?? {}) as Record<string, string>;
  const subscriptions = (userBody?.subscriptions ?? []) as Array<Record<string, unknown>>;
  const onesignalId: string = identity?.onesignal_id ?? '';

  // Find first push subscription (type contains "Push")
  const pushSub = subscriptions.find(s => String(s.type ?? '').toLowerCase().includes('push'));
  const targetSub = pushSub ?? subscriptions[0];
  const subscriptionId: string = (targetSub?.id as string) ?? '';
  const subscriptionType: string = (targetSub?.type as string) ?? '';

  console.log('[debug-onesignal] onesignal_id:', onesignalId);
  console.log('[debug-onesignal] subscriptions:', JSON.stringify(subscriptions));
  console.log('[debug-onesignal] target subscription id:', subscriptionId);
  console.log('[debug-onesignal] target subscription type:', subscriptionType);

  // Attempt A — include_aliases with external_id + target_channel
  const attemptA = await onesignalPost('A', {
    app_id: ONESIGNAL_APP_ID,
    target_channel: 'push',
    include_aliases: { external_id: [TEST_EXTERNAL_ID] },
    headings: { en: 'Test A' },
    contents: { en: 'Test A' },
  });

  // Attempt B — include_aliases with onesignal_id + target_channel
  const attemptB = await onesignalPost('B', {
    app_id: ONESIGNAL_APP_ID,
    target_channel: 'push',
    include_aliases: { onesignal_id: [onesignalId] },
    headings: { en: 'Test B' },
    contents: { en: 'Test B' },
  });

  // Attempt C — include_subscription_ids directly (using first push subscription)
  const attemptC = await onesignalPost('C', {
    app_id: ONESIGNAL_APP_ID,
    include_subscription_ids: [subscriptionId],
    headings: { en: 'Test C' },
    contents: { en: 'Test C' },
  });

  const recipientsA = (attemptA.body as Record<string, unknown>)?.recipients ?? 0;
  const recipientsB = (attemptB.body as Record<string, unknown>)?.recipients ?? 0;
  const recipientsC = (attemptC.body as Record<string, unknown>)?.recipients ?? 0;

  const winner = (recipientsA as number) > 0 ? 'A'
    : (recipientsB as number) > 0 ? 'B'
    : (recipientsC as number) > 0 ? 'C'
    : 'none';

  return new Response(JSON.stringify({
    key_preview: keyPreview,
    app_id: ONESIGNAL_APP_ID,
    external_id_tested: TEST_EXTERNAL_ID,
    live_onesignal_id: onesignalId,
    live_subscription_id: subscriptionId,
    live_subscription_type: subscriptionType,
    all_subscriptions: subscriptions,
    user_fetch: { status: userResult.status },
    winner,
    attempt_A: { status: attemptA.status, body: attemptA.body, recipients: recipientsA },
    attempt_B: { status: attemptB.status, body: attemptB.body, recipients: recipientsB },
    attempt_C: { status: attemptC.status, body: attemptC.body, recipients: recipientsC },
  }, null, 2), {
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
});
