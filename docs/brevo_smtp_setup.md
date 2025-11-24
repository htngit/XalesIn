# Panduan Setup SMTP Brevo (Sendinblue) untuk Supabase

## Langkah-langkah yang Benar:

### 1. Login ke Brevo Dashboard
- Buka: https://app.brevo.com/
- Login dengan akun Anda

### 2. Dapatkan SMTP Credentials
- Klik nama Anda di pojok kanan atas
- Pilih "SMTP & API"
- Di bagian "SMTP", klik "Generate a new SMTP key" atau gunakan yang sudah ada -> xsmtpsib-96c8a7fcf67b596ccc50e6c72a7d1a8297a10ea7899248df1eb821f92d548fd8-80Nevi4YB2g3UigC
- **PENTING**: Ini adalah SMTP password, BUKAN API key biasa

### 3. Verifikasi Sender Email
- Pergi ke "Senders & IP" → "Senders"
- Pastikan email `htn.git@gmail.com` sudah terverifikasi (ada tanda centang hijau)
- Jika belum, klik "Add a sender" dan verifikasi email tersebut

### 4. Konfigurasi di Supabase Dashboard
Masukkan nilai berikut di Authentication → Email → SMTP Settings:

```
Sender email address: htn.git@gmail.com
Sender name: Xender-In
Host: smtp-relay.brevo.com
Port: 587
Username: 9bb7fc001@smtp-brevo.com  (ini email login Brevo Anda)
Password: xsmtpsib-96c8a7fcf67b596ccc50e6c72a7d1a8297a10ea7899248df1eb821f92d548fd8-80Nevi4YB2g3UigC
Minimum interval per user: 60 seconds
```

### 5. Test Ulang
Setelah semua benar, coba test lagi dengan:
```bash
npx tsx scripts/test_smtp.ts
```

## Troubleshooting Checklist:
- [ ] SMTP Password benar (bukan API key biasa)
- [ ] Sender email sudah diverifikasi di Brevo
- [ ] Port 587 (bukan 586)
- [ ] Username adalah email login Brevo yang benar
- [ ] Tidak ada typo di host: smtp-relay.brevo.com
