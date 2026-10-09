// Voxel1 — Employee login with mobile number only
//
// POST { mobile }  →  { token_hash }   (the app exchanges it with
//                                       supabase.auth.verifyOtp({ token_hash, type: 'magiclink' }))
//
// Employees have no password: the organization enters them with their name and
// mobile number, and the number alone logs them in. Managers and Admins keep
// email + password and are refused here.
//
// Where the employee comes from:
//   1. profiles — anyone added in the app (Team Directory) or earlier.
//   2. employee_roster — rows typed directly into Supabase. On first login the
//      account and profile are created from the row, and the row is deleted.
//
// Anyone who knows an employee's number can log in as them; that is the
// organization's choice. Repeated attempts are rate-limited per network and
// per number so the numbers cannot be swept quickly.
// Deno runtime (Supabase Edge Functions)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const WINDOW_MINUTES = 15;
const MAX_ATTEMPTS_PER_IP = 20;
const MAX_ATTEMPTS_PER_NUMBER = 10;

const NOT_FOUND = 'This mobile number is not registered. Please ask your manager to add you.';

/** A problem the employee's manager must fix; shown as-is. */
class RosterError extends Error {}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function callerIp(req: Request): string {
  return req.headers.get('cf-connecting-ip')
    ?? req.headers.get('x-forwarded-for')?.split(',')[0].trim()
    ?? 'unknown';
}

/** Last 10 digits, the same rule as public.norm_mobile (migration 0042). */
function normMobile(v: string): string | null {
  const digits = v.replace(/\D/g, '');
  return digits.length >= 7 ? digits.slice(-10) : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { message: 'Method not allowed' });

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  try {
    const body = await req.json().catch(() => ({}));
    const mobile = normMobile(String(body?.mobile ?? ''));
    if (!mobile) return json(400, { message: 'Please enter a valid mobile number.' });

    // ── Rate limit ──────────────────────────────────────────────────────────
    const ip = callerIp(req);
    const since = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString();
    const [{ count: ipCount }, { count: numberCount }] = await Promise.all([
      admin.from('mobile_login_attempts').select('id', { count: 'exact', head: true }).eq('ip', ip).gte('created', since),
      admin.from('mobile_login_attempts').select('id', { count: 'exact', head: true }).eq('mobile', mobile).gte('created', since),
    ]);
    if ((ipCount ?? 0) >= MAX_ATTEMPTS_PER_IP || (numberCount ?? 0) >= MAX_ATTEMPTS_PER_NUMBER) {
      return json(429, { message: `Too many attempts. Please wait ${WINDOW_MINUTES} minutes and try again.` });
    }
    await admin.from('mobile_login_attempts').insert({ ip, mobile });

    // ── Find the employee ───────────────────────────────────────────────────
    const { data: profiles, error: lookupErr } = await admin.rpc('profile_by_mobile', { p_mobile: mobile });
    if (lookupErr) throw new Error(`profile lookup: ${lookupErr.message}`);
    let profile = profiles?.[0] ?? null;

    if (!profile) {
      const { data: rows, error: rosterErr } = await admin.rpc('roster_by_mobile', { p_mobile: mobile });
      if (rosterErr) throw new Error(`roster lookup: ${rosterErr.message}`);
      const roster = rows?.[0];
      if (!roster) return json(404, { message: NOT_FOUND });
      profile = await createFromRoster(admin, roster);
    }

    // These employees retain mobile login after switching to manager mode.
    const switchableManager = String(profile.role).toUpperCase() === 'MANAGER'
      && ['9885229887', '7893960331', '7989626574', '7794862595', '8331951390', '9795611931']
        .includes(normMobile(String(profile.mobile ?? '')) ?? '');
    if (String(profile.role).toUpperCase() !== 'EMPLOYEE' && !switchableManager) {
      return json(403, { message: 'Managers and Admins log in with email and password. Choose "Manager" above.' });
    }
    if (profile.status === 'INACTIVE') {
      return json(403, { message: 'Your account has been deactivated. Please contact your administrator.' });
    }

    // ── One-time login token ────────────────────────────────────────────────
    const { data: authUser, error: userErr } = await admin.auth.admin.getUserById(profile.id);
    if (userErr || !authUser?.user?.email) throw new Error(`auth user: ${userErr?.message ?? 'no email'}`);

    // Being added by the organization is the verification; confirm the login
    // email if an older account never clicked its link.
    if (!authUser.user.email_confirmed_at) {
      await admin.auth.admin.updateUserById(profile.id, { email_confirm: true });
    }
    if (!profile.verified) {
      await admin.from('profiles').update({ verified: true }).eq('id', profile.id);
    }

    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: authUser.user.email,
    });
    const tokenHash = link?.properties?.hashed_token;
    if (linkErr || !tokenHash) throw new Error(`generateLink: ${linkErr?.message ?? 'no token'}`);

    return json(200, { token_hash: tokenHash });
  } catch (err) {
    if (err instanceof RosterError) return json(409, { message: err.message });
    console.error('[employee-mobile-login]', (err as Error).message);
    return json(500, { message: 'Could not log in right now. Please try again.' });
  }
});

/** Create the login account and employee profile for a roster row, then remove the row. */
async function createFromRoster(admin: ReturnType<typeof createClient>, roster: Record<string, any>) {
  // Employees have no email; the account needs one, so it gets an address
  // that can never receive mail (.invalid is reserved, RFC 2606).
  const email = `emp-${crypto.randomUUID()}@mobile-login.invalid`;
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: crypto.randomUUID() + crypto.randomUUID(),
    email_confirm: true,
    user_metadata: { name: roster.name },
  });
  if (createErr || !created?.user) throw new Error(`create user: ${createErr?.message}`);
  const userId = created.user.id;

  // The on_auth_user_created trigger inserts a minimal profile; fill it in.
  const { data: profile, error: profileErr } = await admin.from('profiles').upsert({
    id:              userId,
    organization_id: roster.organization_id,
    name:            roster.name,
    email:           null,
    role:            'EMPLOYEE',
    mobile:          roster.mobile,
    employee_id:     roster.employee_id || null,
    department:      roster.department || null,
    designation:     roster.designation || null,
    line_manager_id: roster.line_manager_id || null,
    shift_id:        roster.shift_id || null,
    joining_date:    roster.joining_date || null,
    verified:        true,
  }, { onConflict: 'id' }).select('*').single();

  if (profileErr || !profile) {
    await admin.auth.admin.deleteUser(userId);
    // 23505: another person already has this name or number (migration 0042).
    if (profileErr?.code === '23505') {
      throw new RosterError('Another person already has this name or mobile number. Please ask your manager to correct your entry.');
    }
    throw new Error(`create profile: ${profileErr?.message}`);
  }

  await admin.from('employee_roster').delete().eq('id', roster.id);
  return profile;
}
