# Debugging Login Issues

## Quick Fixes

### 1. Restart Everything
```bash
# Stop client (Ctrl+C in terminal)
# Then restart:
make dev-client
```

**Important:** After changing `.env` files, you MUST restart the dev server for changes to take effect!

### 2. Check Browser Console
1. Open http://localhost:5173
2. Press F12 (or Cmd+Option+I on Mac)
3. Go to Console tab
4. Try to sign up again
5. Look for error messages

### 3. Create User via Dashboard (Bypass Frontend)
```bash
# Open Supabase Studio
open http://127.0.0.1:54323
```
- Login: `test@test.com` / `test1234`
- Go to **Authentication** → **Users**
- Click **Add User**
- Email: `test@example.com`
- Password: `password123`
- Auto-confirm: **YES**
- Click **Create user**

Then try signing in with those credentials.

### 4. Check Auth Settings
In Supabase Studio (http://127.0.0.1:54323):
- **Authentication** → **Settings**
- Verify **Email confirmations** is OFF

## Test Page

I created `test-supabase.html` to test the connection directly. Check if it opened in your browser. It should show:
- ✅ Sign up success
- ✅ Sign in success

If the test page works but the app doesn't, the issue is with the React app, not Supabase.

## Common Issues

### Issue: "Invalid login credentials"

**Cause 1: User doesn't exist**
- Solution: Use "Sign Up" tab first, then "Sign In"

**Cause 2: Wrong password**
- Solution: Password must be 6+ characters

**Cause 3: Email confirmation required**
- Solution: Already disabled in config.toml

**Cause 4: Environment variables not loaded**
- Solution: Restart `make dev-client` after changing .env

**Cause 5: JWT verification failing**
- Solution: Check both .env files have same SUPABASE_URL

### Issue: "Failed to fetch" or network error

**Cause: Supabase not running**
```bash
make supabase-status
# If not running:
make supabase-start
```

## Verification Checklist

Run these commands and check results:

```bash
# 1. Supabase running?
make supabase-status
# Should show: "supabase local development setup is running"

# 2. Environment correct?
cat client/.env
# Should have URL: http://127.0.0.1:54321
# Should have KEY (no quotes): eyJhbGci...

# 3. Can access API?
curl http://127.0.0.1:54321/auth/v1/health
# Should return: {"date":...,"description":"GoTrue Health Check"}

# 4. Client dev server running?
# Terminal should show: Local: http://localhost:5173/
```

## Nuclear Option: Full Reset

If nothing works:

```bash
# 1. Stop everything
make supabase-stop
# Ctrl+C on both dev-client and dev-server terminals

# 2. Reset Supabase
make supabase-reset

# 3. Restart Supabase
make supabase-start

# 4. Recreate .env
make setup-local

# 5. Restart app
make dev-client  # Terminal 1
make dev-server  # Terminal 2
```

## Get Help

If still stuck, check:
1. Browser console errors (F12 → Console)
2. Client terminal for errors
3. Server terminal for errors
4. Supabase logs: http://127.0.0.1:54323 → Logs
