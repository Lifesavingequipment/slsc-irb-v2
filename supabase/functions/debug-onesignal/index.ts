const ONESIGNAL_APP_ID = 'f625ba7b-3998-43ff-8be4-a4a1fc08ef0b';
const ONESIGNAL_REST_API_KEY = Deno.env.get('ONESIGNAL_REST_API_KEY') ?? '';
const TEST_EXTERNAL_ID = 'faf80d75-3b72-4cdd-a1a1-61c9041ff013';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  const keyPreview = ONESIGNAL_REST_API_KEY
    ? `${ONESIGNAL_REST_API_KEY.slice(0, 6)}...${ONESIGNAL_REST_API_KEY.slice(-4)}`
    : '(empty)';

  console.log('[debug-onesignal] app_id:', ONESIGNAL_APP_ID);
  console.log('[debug-onesignal] key preview:', keyPreview);

  // GET app info
  const appUrl = `https://api.onesignal.com/apps/${ONESIGNAL_APP_ID}`;
  console.log('[debug-onesignal] GET', appUrl);
  const appRes = await fetch(appUrl, {
    headers: { Authorization: `Key ${ONESIGNAL_REST_API_KEY}` },
  });
  let appBody: unknown;
  try { appBody = await appRes.json(); } catch { appBody = await appRes.text(); }
  console.log('[debug-onesignal] app status:', appRes.status);
  console.log('[debug-onesignal] app body:', JSON.stringify(appBody));

  // GET user by external_id
  const userUrl = `https://api.onesignal.com/apps/${ONESIGNAL_APP_ID}/users/by/external_id/${TEST_EXTERNAL_ID}`;
  console.log('[debug-onesignal] GET', userUrl);
  const userRes = await fetch(userUrl, {
    headers: { Authorization: `Key ${ONESIGNAL_REST_API_KEY}` },
  });
  let userBody: unknown;
  try { userBody = await userRes.json(); } catch { userBody = await userRes.text(); }
  console.log('[debug-onesignal] user status:', userRes.status);
  console.log('[debug-onesignal] user body:', JSON.stringify(userBody));

  return new Response(JSON.stringify({
    key_preview: keyPreview,
    app_id: ONESIGNAL_APP_ID,
    external_id_tested: TEST_EXTERNAL_ID,
    app: {
      status: appRes.status,
      body: appBody,
    },
    user: {
      status: userRes.status,
      body: userBody,
    },
  }, null, 2), {
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
});
