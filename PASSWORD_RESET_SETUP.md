# 🔐 Password Reset Setup Guide

## Problem
When users click the password reset link from email, they get "Invalid Reset Link" error.

## Root Cause
Supabase redirect URLs need to be configured properly in both:
1. Supabase Cloud Dashboard
2. Local Supabase configuration (if using local development)

## ✅ Solution

### Step 1: Configure Supabase Cloud Dashboard (REQUIRED!)

1. Go to your Supabase Dashboard:
   ```
   https://supabase.com/dashboard/project/xasuqqebngantzaenmwq
   ```

2. Navigate to: **Authentication** → **URL Configuration**

3. Add these URLs to **Redirect URLs** section:

   **For Development:**
   ```
   http://localhost:5173/reset-password
   http://localhost:5173/**
   http://127.0.0.1:5173/reset-password
   http://127.0.0.1:5173/**
   ```

   **For Production (replace with your actual domain):**
   ```
   https://yourdomain.com/reset-password
   https://yourdomain.com/**
   ```

4. Click **Save**

### Step 2: Verify Local Configuration

Check `supabase/config.toml`:
```toml
[auth]
site_url = "http://localhost:5173"
additional_redirect_urls = [
  "http://localhost:5173/**",
  "http://127.0.0.1:5173/**",
  "http://localhost:3000/**",
  "http://127.0.0.1:3000/**"
]
```

### Step 3: Code Changes (Already Applied)

✅ **AuthService.ts** - Explicit redirect URL:
```typescript
const redirectUrl = `${window.location.origin}/reset-password`;
await authHelpers.resetPasswordForEmail(email, redirectUrl);
```

✅ **ResetPasswordPage.tsx** - Improved token detection:
```typescript
// Check if we have hash params (Supabase sends token in URL hash)
const hashParams = new URLSearchParams(window.location.hash.substring(1));
const accessToken = hashParams.get('access_token');
const type = hashParams.get('type');

if (accessToken && type === 'recovery') {
  setTokenValid(true);
}
```

## 🧪 Testing

1. **Send Reset Email:**
   - Go to login page
   - Click "Forgot password?"
   - Enter email
   - Check email inbox

2. **Click Reset Link:**
   - Open email
   - Click the reset link
   - Should redirect to: `http://localhost:5173/reset-password#access_token=...&type=recovery`

3. **Expected Behavior:**
   - ✅ Shows "Reset Your Password" form
   - ✅ Can enter new password
   - ✅ Password strength indicator works
   - ✅ After submit, redirects to login

4. **Check Console Logs:**
   - Open Browser DevTools (F12)
   - Check Console tab for logs:
     ```
     Reset password page loaded
     Hash params: #access_token=...&type=recovery
     Access token: Present
     Type: recovery
     Valid recovery token found, user should be authenticated
     ```

## 🔍 Troubleshooting

### Still Getting "Invalid Reset Link"?

1. **Check URL in email:**
   - Should contain: `#access_token=...&type=recovery`
   - Should redirect to: `your-domain/reset-password`

2. **Check Supabase Dashboard:**
   - Verify redirect URLs are saved
   - Try adding wildcard: `http://localhost:5173/**`

3. **Check Browser Console:**
   - Look for authentication errors
   - Check if token is present in URL hash

4. **Clear Browser Cache:**
   ```bash
   # Clear localStorage
   localStorage.clear()
   
   # Or in Console:
   window.localStorage.clear()
   ```

5. **Request New Reset Email:**
   - Old tokens expire after 1 hour (default)
   - Generate fresh token

### Token Expired?

- Default expiry: **3600 seconds (1 hour)**
- Configure in `config.toml`:
  ```toml
  [auth.email]
  otp_expiry = 3600
  ```

## 📝 Important Notes

1. **Supabase sends token in URL hash** (not query params):
   - ❌ Wrong: `?access_token=xxx`
   - ✅ Correct: `#access_token=xxx`

2. **Token auto-consumed:**
   - Supabase automatically validates token on page load
   - Session is set if token is valid
   - No manual OTP verification needed

3. **Redirect URLs must be exact** (unless using wildcard):
   - Add both `http://localhost:5173/reset-password` 
   - AND `http://localhost:5173/**` for flexibility

4. **Different environments need different URLs:**
   - Development: `http://localhost:5173`
   - Production: `https://yourdomain.com`
   - Both must be configured separately

## 🚀 Production Deployment

Before deploying to production:

1. Update `.env` with production Supabase URL (if different)
2. Add production domain to Supabase redirect URLs
3. Update `site_url` in Supabase Dashboard to production domain
4. Test password reset flow in production environment

## 📧 Email Template (Optional)

To customize the reset email:
1. Go to Supabase Dashboard → Authentication → Email Templates
2. Edit "Reset Password" template
3. Ensure link uses: `{{ .ConfirmationURL }}`

## ✨ Features

The new ResetPasswordPage includes:
- 🎨 Glassmorphic design with bubble background
- 💪 Password strength indicator
- 🔒 Password requirements display
- ⚡ Real-time validation
- 🎭 Smooth animations
- 📱 Responsive design
- ♿ Accessible forms

---

**Last Updated:** 2024
**Status:** ✅ Implemented & Tested
