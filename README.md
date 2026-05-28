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
   - **Authentication** → Sign-in method → **Email/Password** → Enable
   - **Firestore Database** → Create database → Production mode
   - **Cloud Messaging** (FCM) → tự động bật khi tạo project

### 3. Cấu hình environment variables

```bash
cp .env.example .env.local
```

Mở `.env.local` và điền đầy đủ các giá trị sau:

```env
# ── Firebase client (lấy từ: Firebase Console → Project Settings → Your apps → Web app)
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=

# ── FCM (lấy từ: Firebase Console → Project Settings → Cloud Messaging → Web Push certificates)
NEXT_PUBLIC_FIREBASE_VAPID_KEY=

# ── App Check (xem hướng dẫn chi tiết ở phần "Cấu hình App Check" bên dưới)
NEXT_PUBLIC_RECAPTCHA_SITE_KEY=
NEXT_PUBLIC_APPCHECK_DEBUG_TOKEN=   # chỉ dùng local — lấy từ Firebase Console → App Check → Manage debug tokens

# ── Firebase Admin SDK — server-side only, KHÔNG thêm NEXT_PUBLIC_
# Lấy từ: Firebase Console → Project Settings → Service accounts → Generate new private key
# Paste toàn bộ nội dung file JSON vào đây
FIREBASE_ADMIN_CREDENTIALS='{"type":"service_account",...}'

# ── Gemini AI — server-side only
# Lấy từ: https://aistudio.google.com
GEMINI_API_KEY=
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
│   ├── firebase/        # config, auth, appCheck, admin (server-side)
│   ├── auth/            # verifyToken, getIdToken (server/client helpers)
│   ├── services/        # Data layer (Firestore)
│   ├── store/           # Zustand stores
│   ├── types/           # TypeScript interfaces
│   ├── utils/           # currency, date, id, cn...
│   ├── rateLimit.ts     # In-memory rate limiter cho API routes
│   └── logger.ts        # Structured logging (production-safe)
│
├── hooks/               # Custom React hooks
├── __tests__/           # Firestore security rules unit tests
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
4. Thêm env vars vào **Vercel Dashboard → Project → Settings → Environment Variables**:

| Key | Lấy từ đâu | Environment |
|-----|-----------|-------------|
| Tất cả `NEXT_PUBLIC_*` | `.env.local` | Production + Preview |
| `FIREBASE_ADMIN_CREDENTIALS` | Firebase Console → Project Settings → Service accounts → Generate new private key → paste nguyên file JSON | Production + Preview |
| `GEMINI_API_KEY` | [aistudio.google.com](https://aistudio.google.com) | Production + Preview |
| `APP_ORIGIN` | Domain Vercel của app, vd: `https://your-app.vercel.app` | Production |

> ⚠️ `FIREBASE_ADMIN_CREDENTIALS` và `GEMINI_API_KEY` là secret — Vercel sẽ tự encrypt và ẩn sau khi save.

### Deploy thường ngày

```powershell
.\deploy.ps1
```

Script tự động: commit → push GitHub → Vercel build → gửi push notification cho users.

---

## Scripts

```bash
npm run dev              # Dev server
npm run build            # Production build
npm run test             # Unit tests
npm run test:rules       # Firestore security rules tests (cần Firebase Emulator)
npm run security:scan    # Quét secret trong toàn bộ codebase
npm run security:audit   # Kiểm tra dependency vulnerabilities (HIGH+)
```

> `security:scan` và `security:audit` cũng tự động chạy trước mỗi `git commit` qua husky hook.

---

## Checklist bảo mật — trước khi merge PR

- [ ] API route mới có verify Firebase ID token không? (`verifyIdToken` từ `lib/auth/verifyToken.ts`)
- [ ] Input từ user có validate bằng Zod không?
- [ ] Có rate limit nếu route gọi API bên ngoài (Gemini, v.v.) không?
- [ ] Không có secret/key nào hardcode trong code không?
- [ ] Nếu thêm Firestore collection mới → đã update `firestore.rules` và `__tests__/firestore.rules.test.ts` chưa?

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