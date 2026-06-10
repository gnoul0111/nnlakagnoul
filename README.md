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

> Repo có sẵn `.npmrc` với `legacy-peer-deps=true`. Đây là chủ ý: `@firebase/rules-unit-testing`
> yêu cầu `firebase@^12` nhưng app dùng `firebase@11` — flag này cho phép cài chung mà không lỗi
> peer-dependency. Đừng xóa, nếu không `npm install` (kể cả trên Vercel) sẽ fail.

### 2. Tạo Firebase project

1. Vào [Firebase Console](https://console.firebase.google.com) → **Add project**
2. Tạo xong → vào **Project Settings → Your apps → Add app → Web**
3. Copy Firebase config (sẽ dùng ở bước tiếp theo)
4. Bật các services cần thiết:
   - **Authentication** → Sign-in method → bật **Email/Password** VÀ **Google**
   - **Authentication** → Settings → **Authorized domains** → thêm domain deploy của anh (vd: `your-app.vercel.app`). Thiếu bước này → Google sign-in báo lỗi "unauthorized domain".
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

### 6. Bật Cloud Text-to-Speech API (cho tính năng đọc phân tích AI)

Phần "đọc to" bản phân tích tài chính dùng Google Cloud TTS (giọng Neural2 tiếng Việt).
Nếu không bật, app tự fallback về giọng đọc mặc định của trình duyệt (chất lượng thấp hơn).

```
Google Cloud Console → APIs & Services → Library
  → tìm "Cloud Text-to-Speech API" → Enable
  → chọn project trùng với Firebase project
```

> Dùng chung credentials với `FIREBASE_ADMIN_CREDENTIALS` (service account) — không cần key riêng.
> Free tier: 1 triệu ký tự/tháng (Neural2). Quá ngưỡng tính ~$16/triệu ký tự.

### 7. Deploy Firestore Rules

```bash
npm install -g firebase-tools
firebase login
firebase deploy --only firestore:rules
```

> ⚠️ Firestore Rules deploy **riêng**, KHÔNG đi cùng deploy code lên Vercel.
> Mỗi khi thêm collection mới vào `lib/firebase/firestore.ts`, nhớ thêm rule tương ứng
> rồi chạy lại lệnh này — thiếu rule → lỗi "Missing or insufficient permissions".

### 7b. Deploy Cloud Functions (khi sửa `functions/src/`)

```bash
cd functions
npm run build          # BẮT BUỘC — functions/lib/ được track trong git
cd ..
firebase deploy --only functions
```

> `functions/lib/` (compiled JS) được track trong git để Vercel preview vẫn chạy được.
> Mỗi khi sửa `functions/src/`, PHẢI build lại trước khi commit/deploy — thiếu bước này →
> Firebase deploy code cũ.

### 8. Chạy dev server

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
├── __tests__/           # Firestore security rules + Cloud Functions unit tests
├── functions/           # Firebase Cloud Functions (Node.js)
│   ├── src/
│   │   ├── index.ts     # Entry point — export tất cả functions
│   │   └── groupNotify.ts  # Push notification helpers cho chi tiêu chung
│   └── lib/             # Compiled output (tracked in git — build trước khi deploy)
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

### Deploy thường ngày (quy trình PR)

Code đi qua CI (test + build) trước khi vào `main` — nhánh `main` đã bật branch protection.

```powershell
git checkout -b fix/ten-thay-doi   # 1. tạo nhánh
# ... sửa code ...
.\deploy.ps1                        # 2. commit + push + mở link tạo PR
# → tạo PR, đợi CI xanh, bấm Merge → Vercel tự deploy
git checkout main; git pull
.\deploy.ps1                        # 3. gửi push notification cho users
```

📖 Xem chi tiết từng bước trong [WORKFLOW.md](WORKFLOW.md).

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

### Đồng bộ realtime đa thiết bị
Dữ liệu tự đồng bộ giữa các thiết bị (desktop ↔ PWA) theo cơ chế lai:

- **Realtime push** — `onSnapshot` listener trên `expense_events` (sổ cá nhân) và `group_events` (nhóm đang mở). Thiết bị khác ghi event → Firestore đẩy về ngay → merge qua đúng pipeline delta cũ (`pruneReplacedOptimistic → mergeEvents → replay`), bọc trong `_syncChain` để không đua với write local.
- **Re-sync khi quay lại app** — `useVisibilitySync` kéo delta khi tab `focus`/`visible` trở lại (lưới an toàn khi listener rớt; throttle 10s, không polling).

> ⚠️ **Service Worker KHÔNG được cache kênh streaming của Firestore.** `onSnapshot` chạy qua
> `firestore.googleapis.com/.../Firestore/Listen/channel` (kết nối dài). Nếu SW cache bằng
> `NetworkFirst` → cắt stream → realtime chết trong PWA. Trong `sw.ts`, các kênh `Listen/Write/channel`
> được bypass hoàn toàn (`stopImmediatePropagation`); `getDocs` một-phát vẫn cache bình thường.

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