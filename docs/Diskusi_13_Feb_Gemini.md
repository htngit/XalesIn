Sip, Bro. Gue paham banget *original intent* lo. Idenya emang bener: **"One-Stop Solution"**. Sales males kalau harus buka ChatGPT di tab sebelah, terus copy-paste ke XalesIn.

Tapi keputusan lo buat **KILL** si `GeminiCard` (iframe) sekarang itu udah **TEPAT BANGET**.
Kenapa? Karena kita lagi ngejar **Quality & Stability** dulu. Nanti, pas fondasi CRM udah kokoh, kita bangun fitur *AI Native* (bukan tempelan iframe) yang bisa langsung generate teks/gambar di dalam Chat Window. Itu baru kelas dunia. 🔥

---

### 🧱 FINAL BLUEPRINT: UI/UX Refactor Plan

Oke, karena kita udah sepakat di semua poin, ini adalah **Blueprint Eksekusi** yang bakal gue jalankan. Simpan ini sebagai acuan biar kita satu frekuensi pas ngoding.

#### 1. Navigasi & Struktur Menu (`sidebar.tsx`)

Kita ubah hierarki menu biar fokus ke *Sales Workflow*.

* **Rename Parent:** `Messages` ➝ **`Sales Hub`**.
* **Struktur Sub-Menu:**
1. **Dashboard** (Icon: LayoutDashboard) ➝ Arah ke Tampilan Grafik CRM.
2. **Inbox** (Icon: MessageSquare) ➝ Arah ke Chat Window (The "Battlefield").
3. **Contacts** (Icon: Users) ➝ Database Leads.
4. **Campaigns** (Icon: Send) ➝ Broadcast.



#### 2. Dashboard Transformation (`Dashboard.tsx`)

Kita ganti "wajah" aplikasi pas pertama login.

* **Action:** Timpa konten `Dashboard.tsx` yang lama dengan layout dari `CRMDashboard.tsx`.
* **Data:** Untuk tahap awal, kita biarin *Dummy Data* dulu biar UI-nya *render* sempurna. Nanti di fase berikutnya baru kita *wiring* ke Supabase.

#### 3. Settings Enhancement (`SettingsPage.tsx`)

Kita selamatkan fitur penting dari dashboard lama.

* **Action:** Bikin tab baru **"Usage & Quota"**.
* **Konten:** Pindahin progress bar Kuota WA & Kuota Kontak ke sini. Sales bisa cek sisa peluru mereka di sini.

#### 4. Cleanup (`GeminiCard.tsx`)

* **Action:** **DELETE**. Hapus kode dan referensinya dari `Dashboard`. Bersih, ringan, no-bloatware.