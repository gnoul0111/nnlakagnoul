# Chi Tiêu — Ứng dụng quản lý chi tiêu cá nhân

PWA quản lý chi tiêu cá nhân xây dựng bằng **Next.js 15 + Firebase + Tailwind CSS**.

---

## Yêu cầu

- **Node.js** >= 20.0.0 — [tải tại nodejs.org](https://nodejs.org)
- **npm** >= 10 (đi kèm Node.js)
- Tài khoản **Firebase** (miễn phí) — [console.firebase.google.com](https://console.firebase.google.com)
- Tài khoản **Vercel** (miễn phí) — [vercel.com](https://vercel.com) *(chỉ cần nếu muốn deploy)*

---

## Cài đặt & Chạy local

### 1. Clone repo

```bash
git clone https://github.com/<your-repo>/chitieu-app.git
cd chitieu-app
npm install
```

### 2. Tạo Firebase project

1. Vào [Firebase Console](https://console.firebase.google.com) → **Add project**
2. Tạo xong → vào **Project Settings → Your apps → Add app → Web**
3. Copy Firebase config (sẽ dùng ở bước tiếp theo)
4. Bật các services cần thiết:
   - **Authentication** → Sign-in method → **Google**
   - **Firestore Database** → Create database → Production mode
   - **Cloud Messaging** (FCM) → tự động bật khi tạo project

### 3. Cấu hình environment variables

```bash
cp .env.example .env.local
```

Mở `.env.local` và điền giá trị từ Firebase config của anh:

```env
# Lấy từ: Firebase Console → Project Settings → Your apps → Web app → SDK setup
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=

# Lấy từ: Firebase Console → Project Settings → Cloud Messaging → Web Push certificates → Key pair
NEXT_PUBLIC_FIREBASE_VAPID_KEY=

# Lấy từ: Google Cloud Console → reCAPTCHA Enterprise → Create key → Website (Score)
# Xem hướng dẫn chi tiết ở phần "Cấu hình App Check" bên dưới
NEXT_PUBLIC_RECAPTCHA_SITE_KEY=

# Chỉ dùng khi chạy local — KHÔNG commit giá trị thật lên git
# Lấy từ: Firebase Console → App Check → Apps → Manage debug tokens → Add token
NEXT_PUBLIC_APPCHECK_DEBUG_TOKEN=
```

> ⚠️ File `.env.local` đã có trong `.gitignore`, sẽ không bị commit lên git.

### 4. Cấu hình firebase-messaging-sw.js

Mở `public/firebase-messaging-sw.js`, tìm đoạn `firebase.initializeApp({...})` và thay bằng config Firebase của anh:

```js
firebase.initializeApp({
  apiKey:            "AIzaSy...",
  authDomain:        "your-project.firebaseapp.com",
  projectId:         "your-project",
  storageBucket:     "your-project.firebasestorage.app",
  messagingSenderId: "123456789",
  appId:             "1:123456789:web:abc123",
})
```

> File này chạy trong Service Worker — không đọc được `process.env` nên phải hardcode.  
> Config Firebase client-side **không phải secret** — đây là [thiết kế của Firebase](https://firebase.google.com/docs/projects/api-keys).  
> Bảo mật thực sự đến từ Firestore Rules + App Check, không phải từ việc ẩn key.

### 5. Cấu hình App Check (reCAPTCHA Enterprise)

App Check bảo vệ Firestore khỏi bị gọi từ bên ngoài app. Cần setup 1 lần:

**Bước 1** — Tạo reCAPTCHA Enterprise site key:
```
Google Cloud Console → Security → reCAPTCHA Enterprise → Create key
  → Platform: Website
  → Domains: localhost, your-domain.vercel.app
  → Copy Site Key → paste vào NEXT_PUBLIC_RECAPTCHA_SITE_KEY
```

**Bước 2** — Đăng ký app với App Check:
```
Firebase Console → App Check → Apps → Register your web app
  → Provider: reCAPTCHA Enterprise
  → Site key: (paste Site Key từ bước 1)
```

**Bước 3** — Lấy debug token cho local dev:
```
Firebase Console → App Check → Apps → Manage debug tokens → Add token
  → Copy token → paste vào NEXT_PUBLIC_APPCHECK_DEBUG_TOKEN trong .env.local
```

### 6. Deploy Firestore Rules

```bash
npm install -g firebase-tools
firebase login
firebase deploy --only firestore:rules
```

### 7. Chạy dev server

```bash
npm run dev
```

Mở [http://localhost:3000](http://localhost:3000).

---

## Cấu trúc thư mục

```
├── app/
│   ├── (auth)/          # Login — public routes
│   ├── (app)/           # Protected routes (auth guard)
│   │   ├── page.tsx     # Dashboard
│   │   ├── finance/     # Chi tiêu, Thu nhập, Ngân sách, Mục tiêu...
│   │   ├── analytics/   # Biểu đồ phân tích
│   │   ├── calendar/    # Lịch giao dịch
│   │   └── settings/    # Cài đặt
│   ├── layout.tsx       # Root layout + Providers
│   └── globals.css
│
├── components/
│   ├── layout/          # AppShell, Topbar, Sidebar, BottomNav
│   ├── dashboard/       # Dashboard widgets, QuickAdd
│   ├── finance/         # Các tab tài chính
│   └── ui/              # Design system (Button, Modal, Input...)
│
├── lib/
│   ├── engine/
│   │   └── replay.ts    # ⭐ Event sourcing engine
│   ├── firebase/        # config, auth, appCheck
│   ├── services/        # Data layer (Firestore)
│   ├── store/           # Zustand stores
│   ├── types/           # TypeScript interfaces
│   └── utils/           # currency, date, id, cn...
│
├── hooks/               # Custom React hooks
├── sw.ts                # Service Worker (Serwist)
└── public/
    ├── manifest.json
    └── firebase-messaging-sw.js
```

---

## Deploy lên Vercel

### Lần đầu setup

1. Push code lên GitHub
2. Vào [vercel.com](https://vercel.com) → **Add New Project** → Import repo GitHub
3. Vercel tự detect Next.js, không cần config gì thêm
4. Thêm toàn bộ env vars vào **Vercel Dashboard → Project → Settings → Environment Variables**:
   - Tất cả `NEXT_PUBLIC_*` từ `.env.local`
   - Thêm `FIREBASE_SERVICE_ACCOUNT_KEY` — xem bên dưới

**Lấy Service Account Key:**
```
Firebase Console → Project Settings → Service Accounts → Generate new private key
→ Tải file JSON về
→ Minify thành 1 dòng: node -e "console.log(JSON.stringify(require('./key.json')))"
→ Paste vào Vercel env var FIREBASE_SERVICE_ACCOUNT_KEY
```

### Deploy thường ngày

```powershell
.\deploy.ps1
```

Script tự động: commit → push GitHub → Vercel build → gửi push notification cho users.

---

## Kiến trúc quan trọng

### Event Sourcing
Mọi thao tác write đều `appendEvent()` vào Firestore. State tính lại bằng `replay(events)`.

```
User action → appendEvent() → Firestore: expense_events → replay() → UI
```

### Lưu ý khi phát triển

**Date / Timezone** — không dùng `.toISOString()`, dùng `toLocalDateString()` từ `lib/utils/date.ts`:
```ts
// ❌ Sai — trả về UTC, lệch ngày với user ở GMT+7
new Date().toISOString().slice(0, 10)

// ✅ Đúng
import { today } from '@/lib/utils/date'
today()
```

**userId trong event data** — bắt buộc phải có:
```ts
await append(EVENT_TYPES.EXPENSE_ADDED, {
  id: newExpenseId(),
  userId: user.uid,  // ← bắt buộc, thiếu → delete/edit không hoạt động
  amount,
  ...
})
```

**Budget filter** — loại linked expenses khi tính ngân sách:
```ts
expenses.filter(e => !e._debtId && !e._goalId && !e._savingsMonthKey)
```