import * as admin from 'firebase-admin'
import * as functions from 'firebase-functions'
import { defineSecret } from 'firebase-functions/params'
import { getMessaging } from 'firebase-admin/messaging'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'

// ─── Secrets ──────────────────────────────────────────────────────────────────
// Thay thế functions.config() (đã deprecated). Set bằng:
//   firebase functions:secrets:set NOTIFY_SECRET
const notifySecret = defineSecret('NOTIFY_SECRET')

// ─── Init ─────────────────────────────────────────────────────────────────────

admin.initializeApp()
const db = getFirestore()

// ─── Timezone ─────────────────────────────────────────────────────────────────

const TZ = 'Asia/Ho_Chi_Minh'

/** Lấy giờ địa phương theo múi giờ Việt Nam dạng "HH:mm" */
function nowVN(): { time: string; date: string; hour: number; minute: number } {
  const now = new Date()
  const vn  = new Date(now.toLocaleString('en-US', { timeZone: TZ }))
  const h   = vn.getHours()
  const m   = vn.getMinutes()
  const time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  const date = `${vn.getFullYear()}-${String(vn.getMonth() + 1).padStart(2, '0')}-${String(vn.getDate()).padStart(2, '0')}`
  return { time, date, hour: h, minute: m }
}

/** Tính số ngày giữa 2 date string YYYY-MM-DD */
function daysBetween(dateA: string, dateB: string): number {
  const a = new Date(dateA).getTime()
  const b = new Date(dateB).getTime()
  return Math.round((b - a) / (1000 * 60 * 60 * 24))
}

// ─── Send FCM helper ──────────────────────────────────────────────────────────
//
// Gửi notification tới 1 token đơn lẻ. Trả về:
//   - true: gửi thành công
//   - false: token invalid (đã được cleanup tự động)
//   - throw: lỗi tạm thời khác (FCM down, network) → caller nên throw lại
//           để Cloud Scheduler retry (không mark alert key — vấn đề F).

async function sendNotificationToToken(
  userId: string,
  token: string,
  tokenDocRef: FirebaseFirestore.DocumentReference | null, // null = legacy field trên user_settings
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<boolean> {
  try {
    await getMessaging().send({
      token,
      data: {
        ...(data ?? {}),
        title,
        body,
      },
      webpush: {
        notification: {
          title,
          body,
          icon: '/icons/icon-192x192.png',
          badge: '/icons/icon-72x72.png',
          requireInteraction: false,
          tag: data?.type ?? 'chitieu-general',
          renotify: true,
        },
        fcmOptions: { link: data?.url ?? '/' },
      },
    })

    // Update lastUsedAt để có thể cleanup token stale sau này
    if (tokenDocRef) {
      try {
        await tokenDocRef.update({ lastUsedAt: Timestamp.now() })
      } catch { /* no-op: token có thể đã bị xoá */ }
    }
    return true
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : ''
    const code = (err as any)?.code ?? ''
    const isInvalidToken =
      msg.includes('registration-token-not-registered') ||
      msg.includes('invalid-registration-token') ||
      msg.includes('invalid-argument') ||
      code === 'messaging/registration-token-not-registered' ||
      code === 'messaging/invalid-registration-token'

    if (isInvalidToken) {
      functions.logger.warn(
        `[sendNotification] Invalid token for user ${userId}, removing`,
      )
      try {
        if (tokenDocRef) {
          // Token mới (subcollection) → xoá doc
          await tokenDocRef.delete()
        } else {
          // Token cũ (field) → null field
          await db.collection('user_settings').doc(userId).update({
            fcmToken:       null,
            tokenType:      null,
            tokenUpdatedAt: null,
          })
        }
      } catch (cleanupErr) {
        functions.logger.error('[sendNotification] Failed to cleanup token:', cleanupErr)
      }
      return false
    }

    // Lỗi KHÔNG phải invalid token (FCM down, network...) → throw để caller
    // biết là phải retry. KHÔNG mark alert key (vấn đề F).
    functions.logger.error('[sendNotification] FCM send error:', msg)
    throw err
  }
}

/**
 * Gửi cùng 1 notification tới TẤT CẢ devices của user.
 * Return true nếu có ÍT NHẤT 1 device nhận thành công.
 * Throw nếu TẤT CẢ devices đều fail với lỗi không phải invalid token.
 */
async function sendNotificationToUser(
  user: UserSetting,
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<boolean> {
  if (user.tokens.length === 0) return false

  const results = await Promise.allSettled(
    user.tokens.map(t =>
      sendNotificationToToken(user.userId, t.token, t.docRef, title, body, data),
    ),
  )

  const anySuccess = results.some(r => r.status === 'fulfilled' && r.value === true)
  if (anySuccess) return true

  // Tất cả fail → check xem có lỗi nào KHÔNG phải invalid không
  const hasTransientFailure = results.some(r => r.status === 'rejected')
  if (hasTransientFailure) {
    // Ít nhất 1 device lỗi tạm thời → throw để caller retry
    const firstErr = results.find(r => r.status === 'rejected') as PromiseRejectedResult
    throw firstErr.reason
  }

  // Tất cả fail vì invalid token → không cần retry, user không còn device valid
  return false
}

// ─── User settings + tokens ──────────────────────────────────────────────────

interface UserToken {
  token:  string
  docRef: FirebaseFirestore.DocumentReference | null // null = legacy field
}

interface UserSetting {
  userId:             string
  tokens:             UserToken[]  // tất cả tokens của user (multi-device)
  notifEnabled:       boolean
  notifTime:          string
  eventReminderTypes: number[]
}

/**
 * Lấy tất cả users đã bật notifEnabled + tổng hợp tokens của họ.
 *
 * Sources:
 * 1. Legacy field `user_settings.fcmToken` (1 token, schema cũ)
 * 2. Subcollection `user_settings/{userId}/fcm_tokens/*` (multi-device, schema mới)
 *
 * Backward compat: đọc CẢ 2, dedup theo token string.
 * Sau khi client mới deploy đủ lâu, có thể xoá nhánh legacy.
 */
async function getNotifUsers(): Promise<UserSetting[]> {
  const snap = await db
    .collection('user_settings')
    .where('notifEnabled', '==', true)
    .get()

  // Parallel fetch subcollection tokens cho mỗi user
  const users = await Promise.all(
    snap.docs.map(async doc => {
      const data = doc.data()
      const userId = doc.id
      const tokens: UserToken[] = []
      const seen = new Set<string>()

      // 1. Legacy field
      if (data.fcmToken && typeof data.fcmToken === 'string') {
        tokens.push({ token: data.fcmToken, docRef: null })
        seen.add(data.fcmToken)
      }

      // 2. Subcollection — multi-device
      try {
        const tokensSnap = await doc.ref.collection('fcm_tokens').get()
        for (const tokenDoc of tokensSnap.docs) {
          const t = tokenDoc.data()?.token
          if (typeof t === 'string' && !seen.has(t)) {
            tokens.push({ token: t, docRef: tokenDoc.ref })
            seen.add(t)
          }
        }
      } catch { /* no-op: subcollection chưa tồn tại */ }

      return {
        userId,
        tokens,
        notifEnabled:       !!data.notifEnabled,
        notifTime:          data.notifTime ?? '21:00',
        eventReminderTypes: Array.isArray(data.eventReminderTypes)
          ? data.eventReminderTypes
          : [1, 6, 24],
      } as UserSetting
    }),
  )

  // Chỉ giữ user có ít nhất 1 token
  return users.filter(u => u.tokens.length > 0)
}

// ─── Alert log helpers (vấn đề B — fix bloat user_settings) ──────────────────
//
// Vì mỗi lần dailyReminder / debtAlert / budgetAlert chạy đều thêm 1 field
// kiểu `daily_reminder_2026-04-24_21:00` vào user_settings, document sẽ phình
// to theo thời gian. Giải pháp: lưu vào subcollection `alert_log/*` với
// auto-cleanup sau 30 ngày.
//
// Doc ID = alertKey trực tiếp → tra cứu O(1).

const ALERT_LOG_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 ngày

async function wasAlertSent(
  userId: string,
  alertKey: string,
): Promise<boolean> {
  const ref = db
    .collection('user_settings').doc(userId)
    .collection('alert_log').doc(alertKey)
  const snap = await ref.get()
  return snap.exists
}

async function markAlertSent(
  userId: string,
  alertKey: string,
): Promise<void> {
  const ref = db
    .collection('user_settings').doc(userId)
    .collection('alert_log').doc(alertKey)
  await ref.set({
    sentAt: Timestamp.now(),
    // expiresAt field để scheduled cleanup function xoá dễ dàng.
    // Firestore TTL policy có thể tự động xoá docs có field này (cần cấu hình GUI)
    expiresAt: Timestamp.fromMillis(Date.now() + ALERT_LOG_TTL_MS),
  })
}

// ─── FUNCTION 1: Nhắc nhập chi tiêu hàng ngày ────────────────────────────────
//
// Chạy MỖI 15 PHÚT (vấn đề C — giảm 93% reads so với mỗi phút).
//
// User có thể set notifTime tự do ("20:17", "07:42", ...). CF round XUỐNG
// mốc 15 phút gần nhất để notif tới ≤ thời điểm user set (tránh phiền ngoài
// giờ mong đợi):
//   20:17 → round → 20:15
//   07:42 → round → 07:30
//   21:00 → round → 21:00

/** Chuyển "HH:mm" → phút trong ngày */
function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

/** Round phút trong ngày xuống mốc 15 phút: 17 → 15, 42 → 30, 60 → 60 */
function floorTo15(minutes: number): number {
  return Math.floor(minutes / 15) * 15
}

export const dailyExpenseReminder = functions
  .region('asia-southeast1')
  .pubsub.schedule('*/15 * * * *')
  .timeZone(TZ)
  .onRun(async () => {
    const { time, date, minute } = nowVN()
    if (minute % 15 !== 0) {
      functions.logger.info(`[dailyExpenseReminder] Skip off-schedule minute ${minute}`)
      return null
    }

    functions.logger.info(`[dailyExpenseReminder] Running at ${time} on ${date}`)

    // currentMinutes là phút trong ngày của slot hiện tại (đã là bội số 15)
    const currentMinutes = timeToMinutes(time)

    const users = await getNotifUsers()
    // Match: notifTime floor về 15 phút === currentMinutes
    // VD: currentMinutes=1215 (20:15) → match user có notifTime="20:15", "20:17", "20:29"
    const targets = users.filter(u => {
      const userMinutes = floorTo15(timeToMinutes(u.notifTime))
      return userMinutes === currentMinutes
    })
    if (targets.length === 0) return null

    functions.logger.info(`[dailyExpenseReminder] Sending to ${targets.length} users`)

    await Promise.allSettled(targets.map(async user => {
      // alertKey dùng time đã round (cùng slot với lần chạy này)
      // để tránh gửi trùng cho user set giờ lẻ
      const alertKey = `daily_reminder_${date}_${time}`

      // Dedup: chống gửi lại trong cùng slot thời gian
      if (await wasAlertSent(user.userId, alertKey)) {
        functions.logger.info(`[dailyExpenseReminder] Đã gửi cho ${user.userId}, skip`)
        return
      }

      // Đọc events hôm nay để tuỳ chỉnh nội dung
      const eventsSnap = await db
        .collection('expense_events')
        .where('userId', '==', user.userId)
        .where('eventType', 'in', ['EXPENSE_ADDED', 'expense_added'])
        .get()

      const hasExpenseToday = eventsSnap.docs.some(d => {
        const data = d.data()
        const expDate: string = data?.data?.date ?? ''
        return expDate === date
      })

      const title = hasExpenseToday
        ? '✅ Chi Tiêu — Cập nhật tốt!'
        : '📝 Chi Tiêu — Nhắc nhập chi tiêu'
      const body = hasExpenseToday
        ? 'Bạn đã ghi chi tiêu hôm nay rồi. Tiếp tục duy trì nhé!'
        : 'Hôm nay bạn chưa ghi chi tiêu nào. Đừng quên ghi lại nhé!'

      // GỬI TRƯỚC — chỉ mark alertKey khi thực sự gửi thành công (vấn đề F).
      // Nếu sendNotificationToUser throw → KHÔNG mark → lần chạy sau retry.
      const sent = await sendNotificationToUser(user, title, body, {
        type: 'daily_reminder',
        date,
      })
      if (sent) {
        await markAlertSent(user.userId, alertKey)
      }
    }))

    return null
  })

// ─── FUNCTION 2: Nhắc nợ sắp đến hạn ─────────────────────────────────────────
// Chạy mỗi ngày lúc 9:00 sáng

export const debtDueReminder = functions
  .region('asia-southeast1')
  .pubsub.schedule('0 9 * * *')
  .timeZone(TZ)
  .onRun(async () => {
    const { date } = nowVN()
    functions.logger.info(`[debtDueReminder] Running on ${date}`)

    const users = await getNotifUsers()

    await Promise.allSettled(users.map(async user => {
      const alertKey = `debt_alert_${date}`
      if (await wasAlertSent(user.userId, alertKey)) {
        functions.logger.info(`[debtDueReminder] Đã gửi cho ${user.userId} hôm nay, skip`)
        return
      }

      // Replay debts — logic GIỐNG client replay.ts để đảm bảo consistency
      const debtMap: Record<string, {
        id: string; name: string; amount: number
        dueDate: string; deleted: boolean;
        payments: Array<{ id: string; amount: number }>
      }> = {}

      const allEvents = await db
        .collection('expense_events')
        .where('userId', '==', user.userId)
        .orderBy('timestamp', 'asc')
        .get()

      for (const doc of allEvents.docs) {
        const ev = doc.data()
        const t  = (ev.eventType as string).toUpperCase()
        const d  = ev.data ?? {}

        if (t === 'DEBT_CREATED' && d.id) {
          debtMap[d.id] = {
            id: d.id, name: d.name ?? '', amount: d.amount ?? 0,
            dueDate: d.dueDate ?? '', deleted: false,
            payments: Array.isArray(d.payments) ? [...d.payments] : [],
          }
        } else if (t === 'DEBT_UPDATED' && d.id && debtMap[d.id]) {
          const existing = debtMap[d.id]
          // Schema cũ: payment đơn — thêm nếu chưa có (tránh double)
          if (d.payment && typeof d.payment === 'object' && d.payment.id) {
            const exists = existing.payments.some(p => p.id === d.payment.id)
            if (!exists) {
              existing.payments.push({ id: d.payment.id, amount: d.payment.amount ?? 0 })
            }
          } else if (d.paymentDelete) {
            // Schema cũ: xóa payment theo id
            existing.payments = existing.payments.filter(p => p.id !== d.paymentDelete)
          } else {
            // Schema mới (trước delta events): update field + full payments array
            if (d.name)    existing.name    = d.name
            if (d.dueDate !== undefined) existing.dueDate = d.dueDate
            if (d.amount !== undefined)  existing.amount  = d.amount
            if (Array.isArray(d.payments)) existing.payments = [...d.payments]
          }
        } else if (t === 'DEBT_PAYMENT_ADDED' && d.debtId && d.payment?.id && debtMap[d.debtId]) {
          // Delta event — race-safe (từ audit P1)
          const existing = debtMap[d.debtId]
          if (!existing.payments.some(p => p.id === d.payment.id)) {
            existing.payments.push({ id: d.payment.id, amount: d.payment.amount ?? 0 })
          }
        } else if (t === 'DEBT_PAYMENT_DELETED' && d.debtId && d.paymentId && debtMap[d.debtId]) {
          debtMap[d.debtId].payments = debtMap[d.debtId].payments.filter(p => p.id !== d.paymentId)
        } else if (t === 'DEBT_DELETED' && d.id && debtMap[d.id]) {
          debtMap[d.id].deleted = true
        }
      }

      // Tính paidAmount từ payments array (source of truth)
      const debts = Object.values(debtMap).map(d => ({
        ...d,
        paidAmount: d.payments.reduce((s, p) => s + (p.amount ?? 0), 0),
      }))

      // Tìm khoản nợ sắp đến hạn trong 7 ngày
      const upcoming = debts.filter(debt => {
        if (debt.deleted) return false
        if (!debt.dueDate) return false
        if (debt.paidAmount >= debt.amount) return false
        const daysLeft = daysBetween(date, debt.dueDate)
        return daysLeft >= 0 && daysLeft <= 7
      })

      if (upcoming.length === 0) return

      let title: string
      let body:  string

      if (upcoming.length === 1) {
        const debt = upcoming[0]
        const daysLeft = daysBetween(date, debt.dueDate)
        title = '⏰ Chi Tiêu — Nhắc nợ'
        body  = daysLeft === 0
          ? `Khoản nợ "${debt.name}" đến hạn hôm nay!`
          : `Khoản nợ "${debt.name}" còn ${daysLeft} ngày nữa đến hạn.`
      } else {
        const overdue = upcoming.filter(d => daysBetween(date, d.dueDate) === 0).length
        title = `⏰ Chi Tiêu — ${upcoming.length} khoản nợ sắp đến hạn`
        body  = overdue > 0
          ? `${overdue} khoản đến hạn hôm nay, ${upcoming.length - overdue} khoản trong 7 ngày tới.`
          : `${upcoming.length} khoản nợ sẽ đến hạn trong 7 ngày tới.`
      }

      // Send-then-mark (vấn đề F): chỉ ghi log nếu thực sự gửi thành công
      const sent = await sendNotificationToUser(user, title, body, {
        type: 'debt_reminder',
        count: String(upcoming.length),
      })
      if (sent) {
        await markAlertSent(user.userId, alertKey)
      }
    }))

    return null
  })

// ─── FUNCTION 3: Nhắc sự kiện lịch ───────────────────────────────────────────
// Chạy mỗi giờ, tính xem user nào có event sắp diễn ra theo eventReminderTypes

// ─── FUNCTION 3: Nhắc sự kiện lịch ───────────────────────────────────────────
//
// Chạy MỖI 15 PHÚT (vấn đề D: tolerance ±30 phút của version cũ có thể miss
// events rơi vào window 0.5h-0.75h trước event). Với cron 15 phút + tolerance
// 0.25h (±15 phút) — coverage đầy đủ hơn mà không tốn thêm reads đáng kể.

export const calendarEventReminder = functions
  .region('asia-southeast1')
  .pubsub.schedule('*/15 * * * *')
  .timeZone(TZ)
  .onRun(async () => {
    const { date, hour, minute } = nowVN()
    if (minute % 15 !== 0) {
      functions.logger.info(`[calendarEventReminder] Skip off-schedule minute ${minute}`)
      return null
    }
    functions.logger.info(`[calendarEventReminder] Running at ${hour}:${minute} on ${date}`)

    const users = await getNotifUsers()

    await Promise.allSettled(users.map(async user => {
      const reminderHours: number[] = user.eventReminderTypes ?? [1, 6, 24]

      // Lấy events trong 2 ngày tới
      const tomorrow = new Date(date)
      tomorrow.setDate(tomorrow.getDate() + 2)
      const tomorrowStr = tomorrow.toISOString().slice(0, 10)

      const eventsSnap = await db
        .collection('work_calendar')
        .where('userId', '==', user.userId)
        .where('date', '>=', date)
        .where('date', '<=', tomorrowStr)
        .where('reminder', '==', true)
        .get()

      if (eventsSnap.empty) return

      for (const doc of eventsSnap.docs) {
        const ev = doc.data()
        if (!ev.time) continue

        // Tính số giờ còn lại đến sự kiện
        const eventDateTime = new Date(`${ev.date}T${ev.time}:00`)
        const nowDateTime   = new Date(new Date().toLocaleString('en-US', { timeZone: TZ }))
        const hoursLeft     = (eventDateTime.getTime() - nowDateTime.getTime()) / (1000 * 60 * 60)

        // ±15 phút tolerance (match với cron 15 phút) — vấn đề D
        const shouldNotify = reminderHours.some(h => Math.abs(hoursLeft - h) <= 0.25)
        if (!shouldNotify) continue

        const hoursLeftRounded = Math.round(hoursLeft)

        // Dedup: đã gửi cho mốc này chưa (lưu ngay trên event doc để theo lifecycle event)
        if (ev[`notified_${hoursLeftRounded}h`]) continue

        const body = hoursLeftRounded <= 1
          ? `"${ev.title}" diễn ra trong 1 giờ nữa (${ev.time})`
          : `"${ev.title}" diễn ra sau ${hoursLeftRounded} giờ nữa (${ev.date} ${ev.time})`

        // Send-then-mark (vấn đề F): chỉ đánh dấu notified nếu gửi thành công
        const sent = await sendNotificationToUser(
          user,
          '📅 Chi Tiêu — Nhắc sự kiện',
          body,
          { type: 'calendar_reminder', eventId: doc.id },
        )
        if (sent) {
          await doc.ref.update({
            [`notified_${hoursLeftRounded}h`]: Timestamp.now(),
          })
        }
      }
    }))

    return null
  })

// ─── FUNCTION 4: Cảnh báo vượt ngân sách (triggered) ─────────────────────────
// Trigger khi có expense_event mới được thêm vào

export const budgetAlertOnExpense = functions
  .region('asia-southeast1')
  .firestore.document('expense_events/{eventId}')
  .onCreate(async (snap) => {
    const ev = snap.data()
    if (!ev) return

    const eventType = (ev.eventType as string).toUpperCase()
    if (eventType !== 'EXPENSE_ADDED') return

    const userId  = ev.userId as string
    const expData = ev.data ?? {}

    // Bỏ qua nếu là linked expense (nợ/mục tiêu/tiết kiệm)
    if (expData._debtId || expData._goalId || expData._savingsMonthKey) return

    // Lấy user info (gồm multi-device tokens qua getNotifUsers pattern).
    // Vì function này triggered (không batch), gọi trực tiếp cho user này thôi.
    const settingsDoc = await db.collection('user_settings').doc(userId).get()
    if (!settingsDoc.exists) return

    const settingsData = settingsDoc.data() as {
      fcmToken?: string | null
      notifEnabled: boolean
    }
    if (!settingsData.notifEnabled) return

    // Gộp tokens từ legacy field + subcollection (backward compat)
    const tokens: UserToken[] = []
    const seenTokens = new Set<string>()

    if (settingsData.fcmToken && typeof settingsData.fcmToken === 'string') {
      tokens.push({ token: settingsData.fcmToken, docRef: null })
      seenTokens.add(settingsData.fcmToken)
    }
    try {
      const tokensSnap = await settingsDoc.ref.collection('fcm_tokens').get()
      for (const tokenDoc of tokensSnap.docs) {
        const t = tokenDoc.data()?.token
        if (typeof t === 'string' && !seenTokens.has(t)) {
          tokens.push({ token: t, docRef: tokenDoc.ref })
          seenTokens.add(t)
        }
      }
    } catch { /* no-op */ }

    if (tokens.length === 0) return

    const user: UserSetting = {
      userId, tokens,
      notifEnabled: true,
      notifTime: '21:00',
      eventReminderTypes: [1, 6, 24],
    }

    // Lấy tháng của expense
    const expDate: string = expData.date ?? ''
    if (!expDate) return
    const monthKey = expDate.slice(0, 7)

    // Lấy budget tháng
    const budgetDoc = await db.collection('budgets').doc(`${userId}_${monthKey}`).get()
    if (!budgetDoc.exists) return

    const budget    = budgetDoc.data()
    const budgetAmt = budget?.spendingAmount ?? budget?.amount ?? 0
    if (budgetAmt <= 0) return

    // Tính tổng chi tiêu tháng này. Lưu ý: events không có index trên field
    // data.date → phải scan full rồi filter. Đây là giới hạn thiết kế schema
    // hiện tại (data là generic map, không index được). Cải thiện có thể
    // làm sau bằng cách cache totalSpent ở budget doc + update incrementally.
    const [monthEventsSnap, deletedSnap] = await Promise.all([
      db.collection('expense_events')
        .where('userId', '==', userId)
        .where('eventType', 'in', ['EXPENSE_ADDED', 'expense_added'])
        .get(),
      db.collection('expense_events')
        .where('userId', '==', userId)
        .where('eventType', 'in', ['EXPENSE_DELETED', 'expense_deleted'])
        .get(),
    ])

    const deletedIds = new Set<string>()
    deletedSnap.docs.forEach(d => {
      const id = d.data()?.data?.id
      if (id) deletedIds.add(id)
    })

    let totalSpent = 0
    for (const doc of monthEventsSnap.docs) {
      const data = doc.data()?.data ?? {}
      if (!data.date?.startsWith(monthKey)) continue
      if (deletedIds.has(data.id)) continue
      if (data._debtId || data._goalId || data._savingsMonthKey) continue
      totalSpent += data.amount ?? 0
    }

    const pct = Math.round((totalSpent / budgetAmt) * 100)

    let title = ''
    let body  = ''

    if (pct >= 100 && pct < 105) {
      title = '🚨 Chi Tiêu — Vượt ngân sách!'
      body  = `Bạn đã chi ${pct}% ngân sách tháng này. Hãy kiểm soát chi tiêu!`
    } else if (pct >= 90 && pct < 100) {
      title = '⚠️ Chi Tiêu — Gần vượt ngân sách'
      body  = `Bạn đã dùng ${pct}% ngân sách. Chỉ còn ${100 - pct}% nữa thôi!`
    } else if (pct >= 70 && pct < 90) {
      title = '📊 Chi Tiêu — Chú ý ngân sách'
      body  = `Bạn đã dùng ${pct}% ngân sách tháng ${monthKey.slice(5)}.`
    } else {
      return
    }

    // Dedup + send-then-mark (vấn đề F + B)
    const alertKey = `budget_alert_${monthKey}_${Math.floor(pct / 10) * 10}`
    if (await wasAlertSent(userId, alertKey)) return

    const sent = await sendNotificationToUser(user, title, body, {
      type: 'budget_alert', month: monthKey, pct: String(pct),
    })
    if (sent) {
      await markAlertSent(userId, alertKey)
    }
  })
// ─── FUNCTION 5: Broadcast bản cập nhật mới cho tất cả users ─────────────────
// Được gọi qua Vercel Deploy Hook / GitHub Actions SAU KHI deploy thành công
//
// Endpoint: POST https://asia-southeast1-{PROJECT}.cloudfunctions.net/notifyNewVersion
// Body: { "secret": "<NOTIFY_SECRET>" }
//
// Setup:
//   1. firebase functions:secrets:set NOTIFY_SECRET
//      (paste chuỗi random dài khi được hỏi)
//   2. firebase deploy --only functions:notifyNewVersion
//   3. Trong GitHub repo: thêm secret NOTIFY_SECRET với cùng giá trị
//      → GitHub Actions tự gọi sau mỗi deploy

export const notifyNewVersion = functions
  .region('asia-southeast1')
  .runWith({ secrets: [notifySecret] })
  .https.onRequest(async (req, res) => {
    // CORS cho manual trigger từ browser nếu cần
    res.set('Access-Control-Allow-Origin', '*')
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.set('Access-Control-Allow-Headers', 'Content-Type')

    if (req.method === 'OPTIONS') {
      res.status(204).send('')
      return
    }

    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' })
      return
    }

    // Xác thực qua secret — tránh kẻ lạ gọi API này gửi spam
    const expectedSecret = notifySecret.value()
    if (!expectedSecret) {
      functions.logger.error('[notifyNewVersion] NOTIFY_SECRET chưa được cấu hình')
      res.status(500).json({ error: 'Server not configured' })
      return
    }

    const providedSecret = req.body?.secret ?? req.query?.secret
    if (providedSecret !== expectedSecret) {
      functions.logger.warn('[notifyNewVersion] Secret không đúng')
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    // Có thể truyền optional version/buildNumber từ CI
    const version = String(req.body?.version ?? '').slice(0, 50)
    const buildNumber = String(req.body?.buildNumber ?? '').slice(0, 20)

    try {
      const users = await getNotifUsers()
      functions.logger.info(`[notifyNewVersion] Broadcasting to ${users.length} users`)

      const title = '🎉 Chi Tiêu — Có bản cập nhật mới!'
      const body = buildNumber
        ? `Phiên bản ${version || 'mới'} (Build ${buildNumber}) đã sẵn sàng. Mở app để cập nhật.`
        : 'Có phiên bản mới đã sẵn sàng. Mở app để cập nhật.'

      const results = await Promise.allSettled(
        users.map(user =>
          // Multi-device: sendNotificationToUser gửi tới mọi device
          // catch để không throw ra Promise.allSettled (dù allSettled đã an toàn)
          sendNotificationToUser(user, title, body, {
            type: 'app_update', version, buildNumber, url: '/settings',
          }).catch(err => {
            functions.logger.warn(`[notifyNewVersion] User ${user.userId}:`, err)
            return false
          }),
        ),
      )

      const success = results.filter(r => r.status === 'fulfilled' && r.value).length
      const failed  = results.length - success

      functions.logger.info(
        `[notifyNewVersion] Done: ${success} sent, ${failed} failed`,
      )

      res.status(200).json({
        ok: true,
        total: users.length,
        sent: success,
        failed,
      })
    } catch (err) {
      functions.logger.error('[notifyNewVersion] Error:', err)
      res.status(500).json({ error: 'Internal error' })
    }
  })

// ─── FUNCTION 6: Send test notification (vấn đề I) ───────────────────────────
//
// Endpoint test thật: gửi notification qua pipeline FCM → SW → device.
// Thay thế cho `new Notification()` local ở client (chỉ test browser permission).
//
// Callable function — client gọi qua Firebase SDK, auth tự động (context.auth).
// Không cần secret.

export const sendTestNotification = functions
  .region('asia-southeast1')
  .https.onCall(async (_data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Bạn cần đăng nhập')
    }
    const userId = context.auth.uid

    // Fetch user + tokens (gộp legacy + subcollection)
    const settingsDoc = await db.collection('user_settings').doc(userId).get()
    if (!settingsDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Chưa có cài đặt')
    }

    const settingsData = settingsDoc.data() as { fcmToken?: string | null }

    const tokens: UserToken[] = []
    const seen = new Set<string>()
    if (settingsData.fcmToken && typeof settingsData.fcmToken === 'string') {
      tokens.push({ token: settingsData.fcmToken, docRef: null })
      seen.add(settingsData.fcmToken)
    }
    try {
      const tokensSnap = await settingsDoc.ref.collection('fcm_tokens').get()
      for (const tokenDoc of tokensSnap.docs) {
        const t = tokenDoc.data()?.token
        if (typeof t === 'string' && !seen.has(t)) {
          tokens.push({ token: t, docRef: tokenDoc.ref })
          seen.add(t)
        }
      }
    } catch { /* no-op */ }

    if (tokens.length === 0) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Chưa có thiết bị nào đăng ký nhận thông báo. Hãy bật thông báo ở Cài đặt trước.',
      )
    }

    const user: UserSetting = {
      userId, tokens,
      notifEnabled: true,
      notifTime: '21:00',
      eventReminderTypes: [1, 6, 24],
    }

    try {
      await sendNotificationToUser(
        user,
        '✅ Chi Tiêu — Thông báo thử',
        `Pipeline FCM hoạt động tốt trên ${tokens.length} thiết bị! 🎉`,
        { type: 'test', url: '/settings' },
      )
      return { ok: true, deviceCount: tokens.length }
    } catch (err) {
      functions.logger.error('[sendTestNotification]', err)
      throw new functions.https.HttpsError(
        'internal',
        'Không gửi được thông báo. Kiểm tra log hoặc thử lại sau.',
      )
    }
  })

// ─── FUNCTION 7: Cleanup (scheduled daily) ───────────────────────────────────
//
// Quét:
//   1. Alert log entries đã hết hạn (sentAt + 30 ngày) → xoá
//   2. FCM tokens không dùng > 60 ngày (lastUsedAt) → xoá
//
// Chạy 1 lần/ngày lúc 3:00 sáng để không ảnh hưởng peak.

export const cleanupNotifData = functions
  .region('asia-southeast1')
  .runWith({ timeoutSeconds: 540, memory: '256MB' })
  .pubsub.schedule('0 3 * * *')
  .timeZone(TZ)
  .onRun(async () => {
    const now = Date.now()
    const alertCutoff = Timestamp.fromMillis(now - ALERT_LOG_TTL_MS)
    const tokenCutoff = Timestamp.fromMillis(now - 60 * 24 * 60 * 60 * 1000) // 60 ngày

    let alertsDeleted = 0
    let tokensDeleted = 0

    // Lấy mọi user có notifEnabled
    const usersSnap = await db.collection('user_settings').get()

    for (const userDoc of usersSnap.docs) {
      // 1. Cleanup alert_log: expiresAt <= now
      try {
        const expiredAlerts = await userDoc.ref
          .collection('alert_log')
          .where('sentAt', '<=', alertCutoff)
          .get()

        if (!expiredAlerts.empty) {
          const batch = db.batch()
          expiredAlerts.docs.forEach(d => batch.delete(d.ref))
          await batch.commit()
          alertsDeleted += expiredAlerts.size
        }
      } catch (err) {
        functions.logger.warn(`[cleanup] alert_log for ${userDoc.id}:`, err)
      }

      // 2. Cleanup FCM tokens stale: lastUsedAt <= cutoff (60 ngày)
      try {
        const staleTokens = await userDoc.ref
          .collection('fcm_tokens')
          .where('lastUsedAt', '<=', tokenCutoff)
          .get()

        if (!staleTokens.empty) {
          const batch = db.batch()
          staleTokens.docs.forEach(d => batch.delete(d.ref))
          await batch.commit()
          tokensDeleted += staleTokens.size
        }
      } catch (err) {
        functions.logger.warn(`[cleanup] fcm_tokens for ${userDoc.id}:`, err)
      }
    }

    functions.logger.info(
      `[cleanupNotifData] Deleted ${alertsDeleted} alert logs + ${tokensDeleted} stale tokens`,
    )
    return null
  })