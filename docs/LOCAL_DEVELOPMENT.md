# Local Development Guide

## Option 1: Local Supabase (Recommended for Full Local Dev)

### Quick Start
```bash
make setup-local    # Start Supabase + create .env files
```

This will:
1. Start local Supabase in Docker
2. Create `.env` files with local credentials
3. Show you the dashboard URL

### Manual Steps

**1. Start Supabase:**
```bash
make supabase-start
# Dashboard: http://127.0.0.1:54323
# API: http://127.0.0.1:54321
```

**2. Add Deepgram Key:**
Edit `server/.env` and add your Deepgram API key:
```env
DEEPGRAM_API_KEY=your-actual-key-here
```

**3. Start Application:**
```bash
# Terminal 1
make dev-server

# Terminal 2
make dev-client
```

**4. Create User:**
Go to http://localhost:5173 and sign up:
- Email: `test@example.com`
- Password: `password123`

### Local Supabase Commands
```bash
make supabase-status   # Check if running
make supabase-stop     # Stop Supabase
make supabase-reset    # Reset database
```

### Local Supabase Dashboard
- URL: http://127.0.0.1:54323
- Email: `test@test.com`
- Password: `test1234`

From dashboard you can:
- View users in Authentication
- Browse database tables
- Check logs
- Test SQL queries

---

## Option 2: Supabase Cloud (Simpler Setup)

### Quick Start
```bash
make setup-env      # Create .env templates
```

**1. Create Supabase Project:**
- Go to https://supabase.com/dashboard
- Create new project
- Wait ~2 minutes for provisioning

**2. Disable Email Confirmation (for testing):**
- Settings → Authentication → Email Auth
- Toggle off "Confirm email"

**3. Get Credentials:**
Settings → API:
- Copy **Project URL**
- Copy **anon public** key

**4. Update .env Files:**

`client/.env`:
```env
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOi...
VITE_WS_URL=ws://localhost:8080/ws
```

`server/.env`:
```env
SUPABASE_URL=https://xxxxx.supabase.co
DEEPGRAM_API_KEY=your-deepgram-key
PORT=8080
```

**5. Start Application:**
```bash
# Terminal 1
make dev-server

# Terminal 2
make dev-client
```

**6. Sign Up:**
- Go to http://localhost:5173
- Email: your-email@example.com
- Password: minimum 6 characters

---

## Getting Deepgram API Key

1. Go to https://deepgram.com
2. Sign up (free tier available)
3. Console → API Keys → Create Key
4. Copy key to `server/.env`

---

## Troubleshooting

### Supabase won't start
```bash
# Check Docker is running
docker ps

# Check ports aren't in use
lsof -i :54321
lsof -i :54323

# Reset everything
make supabase-stop
make supabase-start
```

### Can't create user
- Check Supabase is running: `make supabase-status`
- Check email confirmation is disabled (Settings → Auth → Email Auth)
- Check browser console for errors

### WebSocket won't connect
- Check backend is running with correct SUPABASE_URL
- Check JWT verification logs in server terminal
- Verify `.env` files match (same Supabase URL in both)

### No transcript appearing
- Add Deepgram API key to `server/.env`
- Check browser microphone permissions
- Check backend logs for Deepgram errors
- Verify you're holding the Push-to-Talk button
