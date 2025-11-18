✅ 1. Umum (Universal Rules)
✅ ESLint & Prettier Compliance: Ikuti gaya konsisten sesuai konfigurasi .eslintrc.cjs dan .prettierrc. Tidak boleh ada warning/error ESLint.
✅ TypeScript Strict: Gunakan TypeScript secara konsisten, dengan strict: true. Hindari any. Jika perlu tipe dinamis, gunakan unknown + type guard.
✅ Modular & Reusable: Pisahkan logika ke dalam hook, util, atau service. Hindari monolitik.
✅ Error Handling: Semua async operation HARUS ditangani error-nya (try/catch atau .catch()). Jangan biarkan Promise unhandled.
✅ Komponen Stateless: Komponen React harus sebisa mungkin pure & tidak memiliki side effect langsung.
✅ Performance Awareness: Gunakan React.memo, useCallback, useMemo saat relevan. Hindari re-render berlebih.
✅ Security First:
Jangan hardcode secret di client-side.
Validasi input user.
Gunakan Supabase Row Level Security (RLS).
Jangan expose logik bisnis kritis di frontend.
🌐 2. Vite-Specific
✅ Gunakan ESM (bukan CommonJS).
✅ File konfigurasi: vite.config.ts
✅ Environment variables: hanya VITE_* (contoh: import.meta.env.VITE_SUPABASE_URL).
✅ Optimize public/ hanya untuk static assets (favicon, robots.txt).
✅ Tidak boleh import file besar secara inline — lazy load jika perlu.
⚛️ 3. React (18+)
✅ Gunakan React Functional Components + Hooks.
✅ Strict Mode enabled → pastikan tidak ada side effect di render.
✅ key props wajib unik & stabil di list rendering.
✅ Gunakan React Query atau SWR untuk data fetching (jika tersedia), bukan useEffect manual untuk API call kecuali benar-benar perlu.
✅ Gunakan Context hanya untuk global state (user, theme, etc), bukan untuk semua state.
✅ Tidak boleh menggunakan index sebagai key kecuali data static & tidak berubah.
🎨 4. Tailwind CSS + shadcn/ui
✅ Class merging: gunakan cn util (import { cn } from '@/lib/utils') untuk conditional class.
✅ Responsive-first: mobile → tablet → desktop.
✅ Dark mode: support class strategy (bukan media).
✅ shadcn/ui:
Hanya install komponen yang dipakai via CLI.
Gunakan komponen asli shadcn (jangan modifikasi struktur internal).
Extend theme via tailwind.config.ts, jangan override dengan !important.
✅ Hindari custom CSS inline kecuali untuk animasi spesifik (gunakan @layer di Tailwind jika perlu).
🗄️ 5. Supabase
✅ MCP Supabase, selalu gunakan MCP supabase untuk tahap development, untuk melakukan migrasi, atau pengembangan apapun langsung ke Supabase, dengan syarat menuliskan semua kode SQL terlebih dahulu ke dalam projek, baru eksekusi.
✅ Inisialisasi client sekali di lib/supabase.ts.
✅ Gunakan RLS (Row Level Security) di semua tabel — jangan matikan RLS.
✅ Auth:
Gunakan useAuth custom hook.
Handle session persistence dengan onAuthStateChange.
✅ Realtime: gunakan channel hanya jika diperlukan, dan unsubscribe saat komponen unmount.
✅ Optimistic update hanya jika UX benar-benar membutuhkan.
✅ Jangan query data besar tanpa pagination (range() + limit()).
💾 6. Dexie.js (IndexedDB)
✅ Schema HARUS didefinisikan eksplisit di db.version().
✅ Gunakan TypeScript interface untuk tabel.
✅ Wrap operasi DB dalam helper function (misal: db.users.add() → addUser()).
✅ Handle dexie error (QuotaExceeded, VersionChange, etc).
✅ Sinkronisasi dengan Supabase hanya jika offline-first dibutuhkan → buat service worker atau background sync logic.
✅ Jangan simpan data sensitif tanpa enkripsi (gunakan library seperti crypto.subtle jika perlu).
🕷️ 7. Puppeteer (Jika digunakan untuk scraping/testing)
✅ Hanya digunakan di Node.js environment (tidak di browser!).
✅ Selalu await browser.close() di akhir.
✅ Gunakan headless: true di production.
✅ Jangan scrape situs tanpa izin — patuhi robots.txt.
✅ Gunakan page.waitForSelector() bukan setTimeout untuk stabilitas.
✅ Simpan hasil scraping ke Supabase/Dexie hanya jika diperlukan.
🧪 8. Testing & Debugging
✅ Setiap fitur baru harus punya minimal:
Unit test (Vitest/Jest) untuk util/logic.
Component test (Vitest + React Testing Library).
✅ Gunakan console.log hanya untuk debugging sementara → hapus sebelum commit.
✅ Gunakan React Developer Tools dan Supabase Dashboard untuk inspeksi.

🧼 10. Clean Code Principle
Nama fungsi/komponen harus self-descriptive.
Max 100 baris per file (kecuali page besar).
Komentar hanya untuk "why", bukan "what".
Jangan duplikasi kode — extract ke fungsi/util.

🚫 LARANGAN MUTLAK
❌ Tidak boleh any tanpa justifikasi kuat.
❌ Tidak boleh hardcode API key / Supabase URL di kode.
❌ Tidak boleh gunakan eval(), new Function(), atau innerHTML.
❌ Tidak boleh bypass RLS Supabase dengan service role di client.