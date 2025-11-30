# WhatsApp Connection Status Feature

## Overview
Fitur WhatsApp Connection Status telah ditambahkan ke Dashboard page untuk menampilkan status koneksi WhatsApp backend dan menyediakan tombol untuk connect/disconnect.

## Komponen yang Ditambahkan

### 1. WhatsAppConnectionStatus Component
**Lokasi**: `src/components/ui/WhatsAppConnectionStatus.tsx`

#### Features:
- **Status Badge**: Menampilkan status koneksi real-time dengan warna:
  - 🟢 **Connected** (Green): WhatsApp terhubung dan siap
  - 🟡 **Connecting** (Yellow): Sedang dalam proses koneksi
  - 🔴 **Disconnected** (Gray): Tidak terhubung
  - 🔴 **Error** (Red): Terjadi error saat koneksi

- **Connect/Disconnect Button**:
  - Ketika disconnected: Tombol "Connect to WhatsApp"
  - Ketika connected: Tombol "Disconnect"
  - Ketika connecting: Tombol disabled dengan loading spinner

- **QR Code Modal**:
  - Muncul otomatis saat QR code diterima dari backend
  - Menampilkan QR code yang dapat di-scan menggunakan WhatsApp mobile
  - Instruksi step-by-step cara scan QR code
  - Tombol Cancel untuk membatalkan koneksi

- **Error Display**:
  - Menampilkan pesan error jika terjadi masalah saat koneksi
  - Dapat di-dismiss oleh user

#### Props:
```typescript
interface WhatsAppConnectionStatusProps {
  className?: string; // Optional CSS class
}
```

#### State Management:
- `status`: Status koneksi saat ini (disconnected | connecting | qr | connected | error)
- `qrCode`: QR code string dari backend
- `showQRModal`: Boolean untuk menampilkan/menyembunyikan modal QR
- `error`: Pesan error jika ada

#### Event Listeners:
Komponen ini mendengarkan event dari Electron IPC:
- `onQRCode`: Menerima QR code dari backend
- `onStatusChange`: Menerima perubahan status koneksi
- `onError`: Menerima error dari backend

### 2. Integration di Dashboard
**Lokasi**: `src/components/pages/Dashboard.tsx`

WhatsApp Connection Status ditampilkan di header Dashboard, di pojok kanan bersebrangan dengan "Dashboard Overview" title.

```tsx
<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
  <div>
    <h1 className="text-2xl font-bold tracking-tight">
      <FormattedMessage id="dashboard.overview.title" defaultMessage="Dashboard Overview" />
    </h1>
    <p className="text-muted-foreground">
      <FormattedMessage id="dashboard.overview.subtitle" defaultMessage="Welcome back! Here's what's happening with your campaigns." />
    </p>
  </div>
  
  {/* WhatsApp Connection Status */}
  <div className="flex items-center">
    <WhatsAppConnectionStatus />
  </div>
</div>
```

## Dependencies yang Ditambahkan

### react-qr-code
Library untuk generate QR code di React.

```bash
npm install react-qr-code
```

## Backend Integration

Komponen ini menggunakan Electron IPC API yang sudah tersedia:

### IPC Handlers (src/main/ipcHandlers.ts):
- `whatsapp:connect` - Memulai koneksi WhatsApp
- `whatsapp:disconnect` - Memutuskan koneksi WhatsApp
- `whatsapp:get-status` - Mendapatkan status koneksi saat ini
- `whatsapp:get-client-info` - Mendapatkan info client WhatsApp

### Event Emitters:
- `whatsapp:qr` - Emit QR code untuk di-scan
- `whatsapp:status-change` - Emit perubahan status koneksi
- `whatsapp:error` - Emit error yang terjadi

## Internationalization (i18n)

Semua text di komponen menggunakan react-intl untuk mendukung multi-bahasa:

### Translation Keys:
```
whatsapp.status.connected
whatsapp.status.connecting
whatsapp.status.disconnected
whatsapp.status.error
whatsapp.button.connect
whatsapp.button.disconnect
whatsapp.button.connecting
whatsapp.qr.title
whatsapp.qr.description
whatsapp.qr.steps.title
whatsapp.qr.steps.1
whatsapp.qr.steps.2
whatsapp.qr.steps.3
whatsapp.qr.steps.4
common.button.cancel
common.button.dismiss
```

## Styling

Komponen menggunakan:
- **Tailwind CSS** untuk styling
- **shadcn/ui components**: Button, Badge, Dialog
- **lucide-react icons**: Loader2, Smartphone, CheckCircle2, XCircle, QrCode

## User Flow

1. **Initial State**: User melihat status "Disconnected" dengan tombol "Connect to WhatsApp"
2. **Click Connect**: 
   - Status berubah menjadi "Connecting"
   - Backend mulai inisialisasi WhatsApp client
3. **QR Code Received**:
   - Modal QR code muncul otomatis
   - User scan QR code dengan WhatsApp mobile
4. **Connected**:
   - Modal QR code tertutup
   - Status berubah menjadi "Connected"
   - Tombol berubah menjadi "Disconnect"
5. **Error Handling**:
   - Jika terjadi error, status berubah menjadi "Error"
   - Pesan error ditampilkan
   - User dapat dismiss error dan retry

## Testing Checklist

- [ ] Status badge menampilkan warna yang benar untuk setiap status
- [ ] Tombol Connect memulai proses koneksi
- [ ] QR code modal muncul saat QR diterima
- [ ] QR code dapat di-scan dengan WhatsApp mobile
- [ ] Status berubah menjadi Connected setelah scan berhasil
- [ ] Tombol Disconnect memutuskan koneksi
- [ ] Error message ditampilkan saat terjadi error
- [ ] Event listeners di-cleanup saat component unmount
- [ ] Responsive di mobile dan desktop
- [ ] Internationalization berfungsi dengan baik

## Future Improvements

1. **Connection Info**: Menampilkan info WhatsApp yang terhubung (nomor, nama)
2. **Auto-reconnect**: Otomatis reconnect jika koneksi terputus
3. **Connection History**: Log history koneksi/disconnection
4. **Notification**: Browser notification saat status berubah
5. **QR Code Refresh**: Tombol untuk refresh QR code jika expired
