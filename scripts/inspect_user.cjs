const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://aiopsadmin:P%40ssw0rdAIOps2026%21Secure@psql-aiops-prod-brsouth.postgres.database.azure.com:5432/gestorfinanceiro_staging?sslmode=require',
  ssl: { rejectUnauthorized: false }
});

async function inspectUser() {
  await client.connect();
  const u = await client.query('SELECT * FROM public.auth_users WHERE email = $1', ['abnerteles77@gmail.com']);
  console.log('--- AUTH_USERS ---');
  console.log(JSON.stringify(u.rows[0], null, 2));

  if (u.rows[0]) {
    const userId = u.rows[0].id;
    const p = await client.query('SELECT * FROM public.profiles WHERE user_id = $1', [userId]);
    console.log('--- PROFILES ---');
    console.log(JSON.stringify(p.rows[0], null, 2));

    const m = await client.query('SELECT * FROM public.org_members WHERE user_id = $1', [userId]);
    console.log('--- ORG_MEMBERS ---');
    console.log(JSON.stringify(m.rows, null, 2));

    if (m.rows[0]) {
      const orgId = m.rows[0].org_id;
      const org = await client.query('SELECT * FROM public.organizations WHERE id = $1', [orgId]);
      console.log('--- ORGANIZATIONS ---');
      console.log(JSON.stringify(org.rows[0], null, 2));

      const orgSub = await client.query('SELECT * FROM public.org_subscriptions WHERE org_id = $1', [orgId]);
      console.log('--- ORG_SUBSCRIPTIONS ---');
      console.log(JSON.stringify(orgSub.rows, null, 2));
    }

    const userSub = await client.query('SELECT * FROM public.user_subscriptions WHERE user_id = $1', [userId]);
    console.log('--- USER_SUBSCRIPTIONS ---');
    console.log(JSON.stringify(userSub.rows, null, 2));
  }

  const plans = await client.query('SELECT * FROM public.plans');
  console.log('--- PLANS ---');
  console.log(JSON.stringify(plans.rows, null, 2));

  await client.end();
}

inspectUser().catch(console.error);
