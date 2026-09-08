const { SignJWT } = require('jose');
const { Client } = require('pg');
const https = require('https');

const client = new Client({
  connectionString: 'postgresql://aiopsadmin:P%40ssw0rdAIOps2026%21Secure@psql-aiops-prod-brsouth.postgres.database.azure.com:5432/gestorfinanceiro_staging?sslmode=require',
  ssl: { rejectUnauthorized: false }
});

const secret = 'gestor_financeiro_azure_jwt_super_secret_key_2026_prod!';

function get(url, token) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      }
    }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body || '{}') });
        } catch (e) {
          resolve({ status: res.statusCode, body });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function run() {
  await client.connect();
  const userId = '36093fbb-6fe2-489b-b4c8-141383cc10cd';
  const jti = 'debug-session-' + Date.now();
  await client.query('DELETE FROM public.auth_sessions WHERE user_id = $1', [userId]);
  await client.query(
    'INSERT INTO public.auth_sessions (user_id, jti, created_at, updated_at, last_seen) VALUES ($1, $2, now(), now(), now())',
    [userId, jti]
  );
  await client.end();

  const token = await new SignJWT({ sub: userId, email: 'abnerteles77@gmail.com', admin: false })
    .setProtectedHeader({ alg: 'HS256' })
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(new TextEncoder().encode(secret));

  const meRes = await get('https://ca-gestor-staging.politewave-3dbe78b6.eastus2.azurecontainerapps.io/api/neon-auth/me', token);
  console.log('--- /api/neon-auth/me ---');
  console.log(meRes.status, JSON.stringify(meRes.body, null, 2));

  const bootRes = await get('https://ca-gestor-staging.politewave-3dbe78b6.eastus2.azurecontainerapps.io/api/bootstrap?userId=' + userId, token);
  console.log('--- /api/bootstrap ---');
  if (typeof bootRes.body === 'object') {
    console.log(bootRes.status, JSON.stringify({
      profile: bootRes.body.profile,
      organization: bootRes.body.organization,
      plan: bootRes.body.plan,
      subscription: bootRes.body.subscription,
      capabilities: bootRes.body.capabilities,
      entitlements: bootRes.body.entitlements,
      business_profile: bootRes.body.business_profile
    }, null, 2));
  } else {
    console.log(bootRes.status, bootRes.body);
  }
}

run().catch(console.error);
