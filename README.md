# Chi Tiêu App — Next.js

Ứng dụng quản lý chi tiêu cá nhân. Rewrite từ Vanilla JS PWA sang **Next.js 15 + Tailwind CSS**.

---

## Tech Stack

| Thành phần | Công nghệ |
|---|---|
| Framework | Next.js 15 (App Router) |
| Styling | Tailwind CSS + CSS Variables |
| State | Zustand (2-tier cache: memory + localStorage) |
| Backend | Firebase (Firestore + Auth + FCM) |
| Charts | Recharts |
| Forms | React Hook Form + Zod |
| PWA | @ducanh2912/next-pwa |

---

## Setup

### 1. Cài dependencies

```bash
npm install
```

### 2. Cấu hình Firebase

Copy file `.env.example` thành `.env.local` và điền Firebase config:

```bash
cp .env.example .env.local
```

Sau đó điền các giá trị từ **Firebase Console → Project Settings → Your apps**:

```
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_VAPID_KEY=
```

### 3. Cấu hình firebase-messaging-sw.js

Mở `public/firebase-messaging-sw.js` và thêm Firebase config vào đầu file:

```js
self.__FIREBASE_CONFIG = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  // ...
}
```

> ⚠️ File này không đọc được `process.env` nên phải hardcode. Không commit key thật lên git.

### 4. Chạy dev server

```bash
npm run dev
```

Mở [http://localhost:3000](http://localhost:3000).

---

## Cấu trúc thư mục

```
chitieu-app/
├── app/
│   ├── (auth)/          # Login, Signup — public routes
│   ├── (app)/           # Protected routes (auth guard)
│   │   ├── layout.tsx   # Auth guard + AppShell (Phase 3)
│   │   ├── page.tsx     # Dashboard (Phase 3)
│   │   ├── finance/     # Finance 7 tabs (Phase 4)
│   │   ├── analytics/   # Analytics (Phase 5)
│   │   ├── calendar/    # Calendar (Phase 6)
│   │   └── settings/    # Settings (Phase 7)
│   ├── layout.tsx       # Root layout + Providers
│   └── globals.css      # CSS variables, dark mode
│
├── components/          # UI components (Phase 3+)
│
├── lib/
│   ├── firebase/        # Firebase config, auth, firestore helpers
│   ├── engine/
│   │   └── replay.ts    # ⭐ Event sourcing replay engine
│   ├── services/        # Data layer (Firestore calls)
│   ├── store/           # Zustand stores
│   ├── offline/         # Offline queue
│   ├── utils/           # currency, date, budgetCalc, cn, id
│   └── types/           # TypeScript interfaces
│
├── hooks/               # Custom React hooks
└── public/
    ├── manifest.json
    └── firebase-messaging-sw.js  # FCM SW (không cache bởi SW chính)
```

---

## Kiến trúc quan trọng

### Event Sourcing
Mọi thao tác write đều `appendEvent()` vào Firestore. State tính bằng `replay(events)`.

```
User action → appendEvent() → Firestore: expense_events → replay() → UI
```

### Caching 2 tầng
1. **In-memory** (`_eventsCache` trong Zustand): sống trong session
2. **localStorage** (`chitieu_events_cache_{userId}`): persist qua reload

Incremental sync: chỉ fetch events mới hơn `lastSync - 30s`.

### Budget filter
Khi tính budget, **bắt buộc** loại linked expenses:
```ts
expenses.filter(e => !e._debtId && !e._goalId && !e._savingsMonthKey)
```

### Date / Timezone
**KHÔNG** dùng `.toISOString()` — dùng `toLocalDateString()` từ `lib/utils/date.ts`.

---

## Kế hoạch Phase

| Phase | Nội dung | Status |
|---|---|---|
| **0 — Setup** | Types, Firebase, Engine, Store, Utils | ✅ Done |
| **1 — Data Layer** | Services đầy đủ, unit tests | 🔜 |
| **2 — Auth** | Login/Signup UI, Auth guard | 🔜 |
| **3 — Dashboard** | Layout, Nav, Stats, Quick add | 🔜 |
| **4 — Finance** | 7 tabs: Expenses → Debts | 🔜 |
| **5 — Analytics** | Charts, Period selector | 🔜 |
| **6 — Calendar** | 2 modes × 4 views | 🔜 |
| **7 — Settings** | Profile, Prefs, Data | 🔜 |
| **8 — PWA + FCM** | next-pwa, Budget alert | 🔜 |
| **9 — Polish** | Skeleton, Dark mode, Perf | 🔜 |
