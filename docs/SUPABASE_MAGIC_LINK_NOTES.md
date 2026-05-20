# Supabase Email Magic Link Notes

We decided to come back to email magic links as the first recommended customer auth path.

## Why Magic Links

- Lower setup friction than phone OTP.
- No password required by default; signed-in users can optionally add a password later.
- Works well for a first production pass.
- Lets us wire `auth.users.id` to `customers.auth_user_id`, which unlocks real RLS.

## Supabase Dashboard Setup

In project:

```text
faizrqajtdttcklflcbz
https://supabase.com/dashboard/project/faizrqajtdttcklflcbz
```

Check:

- [ ] `Authentication -> Providers -> Email` is enabled.
- [ ] `Authentication -> URL Configuration` has the correct Site URL.
- [ ] Local redirect URLs are allowed.
- [ ] Netlify production and preview redirect URLs are allowed.

Likely redirect URLs:

```text
http://localhost:5173/**
http://127.0.0.1:5173/**
https://YOUR-NETLIFY-SITE.netlify.app/**
https://*.netlify.app/**
```

## SMTP Requirement

For real usage, configure custom SMTP. Supabase's built-in email sender is only suitable for testing and has strict delivery/rate limitations.

Recommended easiest provider:

```text
Resend
```

Other options:

```text
Postmark
SendGrid
AWS SES
Brevo
```

Need:

- [ ] SMTP host
- [ ] SMTP port
- [ ] SMTP user
- [ ] SMTP password
- [ ] From email, for example `no-reply@yourdomain.com`
- [ ] Sender name, for example `PawStatus`

## Frontend Flow

The Vite + React app sends magic links with:

```js
await supabase.auth.signInWithOtp({
  email,
  options: {
    emailRedirectTo: `${window.location.origin}/auth/callback`,
  },
});
```

Even though the method is named `signInWithOtp`, it sends a magic link when the email template uses the confirmation URL.

Signed-in users can also set a password from Account:

```js
await supabase.auth.updateUser({ password: 'new_password' });
```

Users who added a password can sign in with:

```js
await supabase.auth.signInWithPassword({ email, password });
```

The app needs:

- [x] Login screen.
- [x] Email submitted state.
- [x] `/auth/callback` route.
- [x] Session loading state.
- [x] Sign out.
- [x] Optional password sign-in mode.
- [ ] Error handling for expired or invalid links.

## Database Linkage

Wire:

```text
auth.users.id -> customers.auth_user_id
auth.users.id -> groomer_accounts.auth_user_id
```

After login:

- [x] Call `supabase.auth.getUser()`.
- [x] Find existing `customers` row by `auth_user_id`.
- [x] Create customer row if missing.
- [x] Store dog/profile data under that customer.
- [x] Store booking request data under that customer and owned dog before confirmed appointments.
- [x] Store groomer account data under `groomer_accounts.auth_user_id`.
- [x] Link groomer accounts to public groomer profiles through `groomer_memberships`.

## RLS Follow-Up

Once magic links work:

- [x] Remove prototype public customer/dog/appointment policies.
- [x] Restore customer policies based on `auth.uid() = customers.auth_user_id`.
- [x] Add dog policies through customer ownership.
- [x] Add appointment policies through dog ownership.
- [x] Add groomer account, membership, booking-channel, calendar-connection, and appointment-request policies for verified groomer memberships.
- [ ] Keep anonymous/public access limited to safe groomer search fields.

## Recommended Implementation Order

1. Configure Supabase redirect URLs.
2. Configure custom SMTP.
3. Build the Vite + React auth shell.
4. Add magic-link login screen.
5. Add `/auth/callback`.
6. Wire `customers.auth_user_id`.
7. Tighten RLS.
