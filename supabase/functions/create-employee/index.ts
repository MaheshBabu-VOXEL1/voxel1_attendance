// Voxel1 — Create Employee Edge Function
// Requires ADMIN caller. Uses service role to create auth.users + profile.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── No duplicate people ──────────────────────────────────────────────────────
// No two people in the app may share an email, phone number or full name
// (migration 0042, which also enforces it with unique indexes). Asked before
// anything is created, so a clash never leaves a half-made account behind.
// Inlined per function, like the other helpers here (see register/index.ts).
const DUPLICATE_MESSAGE: Record<string, string> = {
  email:  'This email is already used by another person. Please use a different email.',
  mobile: 'This phone number is already used by another person. Please use a different number.',
  name:   'Someone with this name already exists. Please add a surname or an initial to make it different.',
};

async function duplicateMessage(
  client: any,
  fields: { email?: string | null; mobile?: string | null; name?: string | null },
): Promise<string | null> {
  const { data, error } = await client.rpc('person_conflict', {
    p_email: fields.email || null,
    p_mobile: fields.mobile || null,
    p_name: fields.name || null,
  });
  if (error) {
    // The unique indexes still block the write; this only loses the friendly message.
    console.error('[person_conflict] check failed:', error.message);
    return null;
  }
  return data ? DUPLICATE_MESSAGE[data] ?? null : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonError(405, 'Method not allowed');
  }

  // Verify caller JWT
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return jsonError(401, 'Missing Authorization header');

  const anonClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user: caller }, error: authErr } = await anonClient.auth.getUser();
  if (authErr || !caller) return jsonError(401, 'Invalid token');

  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Fetch caller's profile to verify role + org
  const { data: callerProfile, error: profileErr } = await adminClient
    .from('profiles')
    .select('role, organization_id')
    .eq('id', caller.id)
    .single();

  if (profileErr || !callerProfile) return jsonError(403, 'Caller profile not found');
  if (!['ADMIN', 'SUPER_ADMIN'].includes(callerProfile.role)) {
    return jsonError(403, 'Only ADMIN or HR can create employees');
  }

  try {
    const formData = await req.formData();
    const email       = formData.get('email')?.toString()?.trim().toLowerCase() ?? '';
    const password    = formData.get('password')?.toString() ?? '';
    const name        = formData.get('name')?.toString()?.trim() ?? '';
    const role        = (formData.get('role')?.toString() ?? 'EMPLOYEE').toUpperCase();
    const department  = formData.get('department')?.toString()?.trim() ?? '';
    const designation = formData.get('designation')?.toString()?.trim() ?? '';
    const employeeId  = formData.get('employeeId')?.toString()?.trim() ?? '';
    const lineManagerId = formData.get('lineManagerId')?.toString()?.trim() || null;
    const teamId      = formData.get('teamId')?.toString()?.trim() || null;
    const shiftId     = formData.get('shiftId')?.toString()?.trim() || null;
    const mobile      = formData.get('mobile')?.toString()?.trim() ?? '';
    const joiningDate = formData.get('joiningDate')?.toString()?.trim() || null;
    const avatarFile  = formData.get('avatar') instanceof File ? formData.get('avatar') as File : null;

    if (!['ADMIN', 'MANAGER', 'EMPLOYEE'].includes(role)) {
      return jsonError(400, 'Role must be ADMIN, MANAGER or EMPLOYEE');
    }
    // Employees log in with their mobile number only (employee-mobile-login);
    // Managers and Admins log in with email + password.
    const mobileOnly = role === 'EMPLOYEE';
    if (!name) return jsonError(400, 'Missing required field: name');
    if (mobileOnly) {
      if (mobile.replace(/\D/g, '').length < 7) {
        return jsonError(400, 'Employees log in with their mobile number, so a valid mobile number is required.');
      }
    } else {
      if (!email || !password) {
        return jsonError(400, 'Managers and Admins need an email and password to log in.');
      }
      if (password.length < 8) {
        return jsonError(400, 'Password must be at least 8 characters');
      }
    }

    const duplicate = await duplicateMessage(adminClient, { email: email || null, mobile, name });
    if (duplicate) return jsonError(409, duplicate);

    const orgId = callerProfile.organization_id;

    // Create auth user
    // An employee without an email still needs one for the login account; it
    // gets an address that can never receive mail (.invalid is reserved).
    const loginEmail = email || `emp-${crypto.randomUUID()}@mobile-login.invalid`;
    const { data: authData, error: createErr } = await adminClient.auth.admin.createUser({
      email: loginEmail,
      password: password || crypto.randomUUID() + crypto.randomUUID(),
      email_confirm: mobileOnly,
      user_metadata: { name },
    });

    if (createErr || !authData.user) {
      return jsonError(400, 'Failed to create user: ' + createErr?.message);
    }

    // admin.createUser does NOT auto-send verification email — trigger it explicitly.
    // Employees are verified by being added here, so they get none.
    if (!mobileOnly) await adminClient.auth.resend({ type: 'signup', email });

    const userId = authData.user.id;

    // Upload avatar if provided
    let avatarPath: string | null = null;
    if (avatarFile && avatarFile.size > 0) {
      try {
        const path = `${userId}/avatar.webp`;
        const { error: uploadErr } = await adminClient.storage
          .from('avatars')
          .upload(path, avatarFile, { upsert: true, contentType: 'image/webp' });
        if (!uploadErr) avatarPath = path;
      } catch (e) {
        console.warn('[CREATE-EMPLOYEE] Avatar upload failed (non-fatal):', e);
      }
    }

    // Create profile.
    // NOTE: the `on_auth_user_created` trigger (handle_new_user) already inserts a
    // minimal profile row when the auth user is created above, so a plain insert
    // here collides on profiles_pkey. Upsert on `id` to fill in the full details.
    const { error: profileInsertErr } = await adminClient.from('profiles').upsert({
      id:              userId,
      organization_id: orgId,
      name,
      email:           email || null,
      role,
      employee_id:     employeeId || null,
      department:      department || null,
      designation:     designation || null,
      line_manager_id: lineManagerId,
      team_id:         teamId,
      shift_id:        shiftId,
      mobile:          mobile || null,
      joining_date:    joiningDate,
      avatar:          avatarPath,
      verified:        mobileOnly,
    }, { onConflict: 'id' });

    if (profileInsertErr) {
      // Rollback auth user
      await adminClient.auth.admin.deleteUser(userId);
      return jsonError(400, 'Failed to create profile: ' + profileInsertErr.message);
    }

    return new Response(
      JSON.stringify({ success: true, userId }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (err) {
    console.error('[CREATE-EMPLOYEE] Unhandled error:', err);
    return jsonError(500, 'Internal Server Error: ' + (err as Error).message);
  }
});

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
