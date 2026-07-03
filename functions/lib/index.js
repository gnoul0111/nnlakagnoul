"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.groupDeletedNotify = exports.groupMemberJoinedNotify = exports.groupEventNotify = exports.cleanupNotifData = exports.sendTestNotification = exports.notifyNewVersion = exports.budgetAlertOnExpense = exports.debtDueReminder = exports.dailyExpenseReminder = void 0;
const admin = __importStar(require("firebase-admin"));
const functions = __importStar(require("firebase-functions"));
const params_1 = require("firebase-functions/params");
const messaging_1 = require("firebase-admin/messaging");
const firestore_1 = require("firebase-admin/firestore");
const groupNotify_1 = require("./groupNotify");
// ─── Secrets ──────────────────────────────────────────────────────────────────
// Thay thế functions.config() (đã deprecated). Set bằng:
//   firebase functions:secrets:set NOTIFY_SECRET
const notifySecret = (0, params_1.defineSecret)('NOTIFY_SECRET');
// ─── Init ─────────────────────────────────────────────────────────────────────
admin.initializeApp();
const db = (0, firestore_1.getFirestore)();
// In-memory rate limit store cho notifyNewVersion endpoint
const ipRateLimitStore = new Map();
// ─── Timezone ─────────────────────────────────────────────────────────────────
const TZ = 'Asia/Ho_Chi_Minh';
/** Lấy giờ địa phương theo múi giờ Việt Nam dạng "HH:mm" */
function nowVN() {
    const now = new Date();
    const vn = new Date(now.toLocaleString('en-US', { timeZone: TZ }));
    const h = vn.getHours();
    const m = vn.getMinutes();
    const time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    const date = `${vn.getFullYear()}-${String(vn.getMonth() + 1).padStart(2, '0')}-${String(vn.getDate()).padStart(2, '0')}`;
    return { time, date, hour: h, minute: m };
}
/** Tính số ngày giữa 2 date string YYYY-MM-DD */
function daysBetween(dateA, dateB) {
    const a = new Date(dateA).getTime();
    const b = new Date(dateB).getTime();
    return Math.round((b - a) / (1000 * 60 * 60 * 24));
}
// ─── Send FCM helper ──────────────────────────────────────────────────────────
//
// Gửi notification tới 1 token đơn lẻ. Trả về:
//   - true: gửi thành công
//   - false: token invalid (đã được cleanup tự động)
//   - throw: lỗi tạm thời khác (FCM down, network) → caller nên throw lại
//           để Cloud Scheduler retry (không mark alert key — vấn đề F).
async function sendNotificationToToken(userId, token, tokenDocRef, // null = legacy field trên user_settings
title, body, data) {
    var _a, _b, _c;
    try {
        await (0, messaging_1.getMessaging)().send({
            token,
            data: Object.assign(Object.assign({}, (data !== null && data !== void 0 ? data : {})), { title,
                body }),
            webpush: {
                notification: {
                    title,
                    body,
                    icon: '/icons/icon-192x192.png',
                    badge: '/icons/icon-72x72.png',
                    requireInteraction: false,
                    tag: (_a = data === null || data === void 0 ? void 0 : data.type) !== null && _a !== void 0 ? _a : 'chitieu-general',
                    renotify: true,
                },
                fcmOptions: { link: (_b = data === null || data === void 0 ? void 0 : data.url) !== null && _b !== void 0 ? _b : '/' },
            },
        });
        // Update lastUsedAt để có thể cleanup token stale sau này
        if (tokenDocRef) {
            try {
                await tokenDocRef.update({ lastUsedAt: firestore_1.Timestamp.now() });
            }
            catch ( /* no-op: token có thể đã bị xoá */_d) { /* no-op: token có thể đã bị xoá */ }
        }
        return true;
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : '';
        const code = (_c = err === null || err === void 0 ? void 0 : err.code) !== null && _c !== void 0 ? _c : '';
        const isInvalidToken = msg.includes('registration-token-not-registered') ||
            msg.includes('invalid-registration-token') ||
            msg.includes('invalid-argument') ||
            code === 'messaging/registration-token-not-registered' ||
            code === 'messaging/invalid-registration-token';
        if (isInvalidToken) {
            functions.logger.warn(`[sendNotification] Invalid token for user ${userId}, removing`);
            try {
                if (tokenDocRef) {
                    // Token mới (subcollection) → xoá doc
                    await tokenDocRef.delete();
                }
                else {
                    // Token cũ (field) → null field
                    await db.collection('user_settings').doc(userId).update({
                        fcmToken: null,
                        tokenType: null,
                        tokenUpdatedAt: null,
                    });
                }
            }
            catch (cleanupErr) {
                functions.logger.error('[sendNotification] Failed to cleanup token:', cleanupErr);
            }
            return false;
        }
        // Lỗi KHÔNG phải invalid token (FCM down, network...) → throw để caller
        // biết là phải retry. KHÔNG mark alert key (vấn đề F).
        functions.logger.error('[sendNotification] FCM send error:', msg);
        throw err;
    }
}
/**
 * Gửi cùng 1 notification tới TẤT CẢ devices của user.
 * Return true nếu có ÍT NHẤT 1 device nhận thành công.
 * Throw nếu TẤT CẢ devices đều fail với lỗi không phải invalid token.
 */
async function sendNotificationToUser(user, title, body, data) {
    if (user.tokens.length === 0)
        return false;
    const results = await Promise.allSettled(user.tokens.map(t => sendNotificationToToken(user.userId, t.token, t.docRef, title, body, data)));
    const anySuccess = results.some(r => r.status === 'fulfilled' && r.value === true);
    if (anySuccess)
        return true;
    // Tất cả fail → check xem có lỗi nào KHÔNG phải invalid không
    const hasTransientFailure = results.some(r => r.status === 'rejected');
    if (hasTransientFailure) {
        // Ít nhất 1 device lỗi tạm thời → throw để caller retry
        const firstErr = results.find(r => r.status === 'rejected');
        throw firstErr.reason;
    }
    // Tất cả fail vì invalid token → không cần retry, user không còn device valid
    return false;
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
async function getNotifUsers() {
    const snap = await db
        .collection('user_settings')
        .where('notifEnabled', '==', true)
        .get();
    // Parallel fetch subcollection tokens cho mỗi user
    const users = await Promise.all(snap.docs.map(async (doc) => {
        var _a, _b;
        const data = doc.data();
        const userId = doc.id;
        const tokens = [];
        const seen = new Set();
        // 1. Legacy field
        if (data.fcmToken && typeof data.fcmToken === 'string') {
            tokens.push({ token: data.fcmToken, docRef: null });
            seen.add(data.fcmToken);
        }
        // 2. Subcollection — multi-device
        try {
            const tokensSnap = await doc.ref.collection('fcm_tokens').get();
            for (const tokenDoc of tokensSnap.docs) {
                const t = (_a = tokenDoc.data()) === null || _a === void 0 ? void 0 : _a.token;
                if (typeof t === 'string' && !seen.has(t)) {
                    tokens.push({ token: t, docRef: tokenDoc.ref });
                    seen.add(t);
                }
            }
        }
        catch ( /* no-op: subcollection chưa tồn tại */_c) { /* no-op: subcollection chưa tồn tại */ }
        return {
            userId,
            tokens,
            notifEnabled: !!data.notifEnabled,
            notifTime: (_b = data.notifTime) !== null && _b !== void 0 ? _b : '21:00',
            eventReminderTypes: Array.isArray(data.eventReminderTypes)
                ? data.eventReminderTypes
                : [1, 6, 24],
        };
    }));
    // Chỉ giữ user có ít nhất 1 token
    return users.filter(u => u.tokens.length > 0);
}
// ─── Alert log helpers (vấn đề B — fix bloat user_settings) ──────────────────
//
// Vì mỗi lần dailyReminder / debtAlert / budgetAlert chạy đều thêm 1 field
// kiểu `daily_reminder_2026-04-24_21:00` vào user_settings, document sẽ phình
// to theo thời gian. Giải pháp: lưu vào subcollection `alert_log/*` với
// auto-cleanup sau 30 ngày.
//
// Doc ID = alertKey trực tiếp → tra cứu O(1).
const ALERT_LOG_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 ngày
async function wasAlertSent(userId, alertKey) {
    const ref = db
        .collection('user_settings').doc(userId)
        .collection('alert_log').doc(alertKey);
    const snap = await ref.get();
    return snap.exists;
}
async function markAlertSent(userId, alertKey) {
    const ref = db
        .collection('user_settings').doc(userId)
        .collection('alert_log').doc(alertKey);
    await ref.set({
        sentAt: firestore_1.Timestamp.now(),
        // expiresAt field để scheduled cleanup function xoá dễ dàng.
        // Firestore TTL policy có thể tự động xoá docs có field này (cần cấu hình GUI)
        expiresAt: firestore_1.Timestamp.fromMillis(Date.now() + ALERT_LOG_TTL_MS),
    });
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
function timeToMinutes(time) {
    const [h, m] = time.split(':').map(Number);
    return (h !== null && h !== void 0 ? h : 0) * 60 + (m !== null && m !== void 0 ? m : 0);
}
/** Round phút trong ngày xuống mốc 15 phút: 17 → 15, 42 → 30, 60 → 60 */
function floorTo15(minutes) {
    return Math.floor(minutes / 15) * 15;
}
exports.dailyExpenseReminder = functions
    .region('asia-southeast1')
    .pubsub.schedule('*/15 * * * *')
    .timeZone(TZ)
    .onRun(async () => {
    const { time, date, minute } = nowVN();
    if (minute % 15 !== 0) {
        functions.logger.info(`[dailyExpenseReminder] Skip off-schedule minute ${minute}`);
        return null;
    }
    functions.logger.info(`[dailyExpenseReminder] Running at ${time} on ${date}`);
    // currentMinutes là phút trong ngày của slot hiện tại (đã là bội số 15)
    const currentMinutes = timeToMinutes(time);
    const users = await getNotifUsers();
    // Match: notifTime floor về 15 phút === currentMinutes
    // VD: currentMinutes=1215 (20:15) → match user có notifTime="20:15", "20:17", "20:29"
    const targets = users.filter(u => {
        const userMinutes = floorTo15(timeToMinutes(u.notifTime));
        return userMinutes === currentMinutes;
    });
    if (targets.length === 0)
        return null;
    functions.logger.info(`[dailyExpenseReminder] Sending to ${targets.length} users`);
    await Promise.allSettled(targets.map(async (user) => {
        // alertKey dùng time đã round (cùng slot với lần chạy này)
        // để tránh gửi trùng cho user set giờ lẻ
        const alertKey = `daily_reminder_${date}_${time}`;
        // Dedup: chống gửi lại trong cùng slot thời gian
        if (await wasAlertSent(user.userId, alertKey)) {
            functions.logger.info(`[dailyExpenseReminder] Đã gửi cho ${user.userId}, skip`);
            return;
        }
        // Đọc events hôm nay để tuỳ chỉnh nội dung
        const eventsSnap = await db
            .collection('expense_events')
            .where('userId', '==', user.userId)
            .where('eventType', 'in', ['EXPENSE_ADDED', 'expense_added'])
            .get();
        const hasExpenseToday = eventsSnap.docs.some(d => {
            var _a, _b;
            const data = d.data();
            const expDate = (_b = (_a = data === null || data === void 0 ? void 0 : data.data) === null || _a === void 0 ? void 0 : _a.date) !== null && _b !== void 0 ? _b : '';
            return expDate === date;
        });
        const title = hasExpenseToday
            ? '✅ Chi Tiêu — Cập nhật tốt!'
            : '📝 Chi Tiêu — Nhắc nhập chi tiêu';
        const body = hasExpenseToday
            ? 'Bạn đã ghi chi tiêu hôm nay rồi. Tiếp tục duy trì nhé!'
            : 'Hôm nay bạn chưa ghi chi tiêu nào. Đừng quên ghi lại nhé!';
        // GỬI TRƯỚC — chỉ mark alertKey khi thực sự gửi thành công (vấn đề F).
        // Nếu sendNotificationToUser throw → KHÔNG mark → lần chạy sau retry.
        const sent = await sendNotificationToUser(user, title, body, {
            type: 'daily_reminder',
            date,
        });
        if (sent) {
            await markAlertSent(user.userId, alertKey);
        }
    }));
    return null;
});
// ─── FUNCTION 2: Nhắc nợ sắp đến hạn ─────────────────────────────────────────
// Chạy mỗi ngày lúc 9:00 sáng
exports.debtDueReminder = functions
    .region('asia-southeast1')
    .pubsub.schedule('0 9 * * *')
    .timeZone(TZ)
    .onRun(async () => {
    const { date } = nowVN();
    functions.logger.info(`[debtDueReminder] Running on ${date}`);
    const users = await getNotifUsers();
    await Promise.allSettled(users.map(async (user) => {
        var _a, _b, _c, _d, _e, _f, _g;
        const alertKey = `debt_alert_${date}`;
        if (await wasAlertSent(user.userId, alertKey)) {
            functions.logger.info(`[debtDueReminder] Đã gửi cho ${user.userId} hôm nay, skip`);
            return;
        }
        // Replay debts — logic GIỐNG client replay.ts để đảm bảo consistency
        const debtMap = {};
        const allEvents = await db
            .collection('expense_events')
            .where('userId', '==', user.userId)
            .orderBy('timestamp', 'asc')
            .get();
        for (const doc of allEvents.docs) {
            const ev = doc.data();
            const t = ev.eventType.toUpperCase();
            const d = (_a = ev.data) !== null && _a !== void 0 ? _a : {};
            if (t === 'DEBT_CREATED' && d.id) {
                debtMap[d.id] = {
                    id: d.id, name: (_b = d.name) !== null && _b !== void 0 ? _b : '', amount: (_c = d.amount) !== null && _c !== void 0 ? _c : 0,
                    dueDate: (_d = d.dueDate) !== null && _d !== void 0 ? _d : '', deleted: false,
                    payments: Array.isArray(d.payments) ? [...d.payments] : [],
                };
            }
            else if (t === 'DEBT_UPDATED' && d.id && debtMap[d.id]) {
                const existing = debtMap[d.id];
                // Schema cũ: payment đơn — thêm nếu chưa có (tránh double)
                if (d.payment && typeof d.payment === 'object' && d.payment.id) {
                    const exists = existing.payments.some(p => p.id === d.payment.id);
                    if (!exists) {
                        existing.payments.push({ id: d.payment.id, amount: (_e = d.payment.amount) !== null && _e !== void 0 ? _e : 0 });
                    }
                }
                else if (d.paymentDelete) {
                    // Schema cũ: xóa payment theo id
                    existing.payments = existing.payments.filter(p => p.id !== d.paymentDelete);
                }
                else {
                    // Schema mới (trước delta events): update field + full payments array
                    if (d.name)
                        existing.name = d.name;
                    if (d.dueDate !== undefined)
                        existing.dueDate = d.dueDate;
                    if (d.amount !== undefined)
                        existing.amount = d.amount;
                    if (Array.isArray(d.payments))
                        existing.payments = [...d.payments];
                }
            }
            else if (t === 'DEBT_PAYMENT_ADDED' && d.debtId && ((_f = d.payment) === null || _f === void 0 ? void 0 : _f.id) && debtMap[d.debtId]) {
                // Delta event — race-safe (từ audit P1)
                const existing = debtMap[d.debtId];
                if (!existing.payments.some(p => p.id === d.payment.id)) {
                    existing.payments.push({ id: d.payment.id, amount: (_g = d.payment.amount) !== null && _g !== void 0 ? _g : 0 });
                }
            }
            else if (t === 'DEBT_PAYMENT_DELETED' && d.debtId && d.paymentId && debtMap[d.debtId]) {
                debtMap[d.debtId].payments = debtMap[d.debtId].payments.filter(p => p.id !== d.paymentId);
            }
            else if (t === 'DEBT_DELETED' && d.id && debtMap[d.id]) {
                debtMap[d.id].deleted = true;
            }
        }
        // Tính paidAmount từ payments array (source of truth)
        const debts = Object.values(debtMap).map(d => (Object.assign(Object.assign({}, d), { paidAmount: d.payments.reduce((s, p) => { var _a; return s + ((_a = p.amount) !== null && _a !== void 0 ? _a : 0); }, 0) })));
        // Tìm khoản nợ sắp đến hạn trong 7 ngày
        const upcoming = debts.filter(debt => {
            if (debt.deleted)
                return false;
            if (!debt.dueDate)
                return false;
            if (debt.paidAmount >= debt.amount)
                return false;
            const daysLeft = daysBetween(date, debt.dueDate);
            return daysLeft >= 0 && daysLeft <= 7;
        });
        if (upcoming.length === 0)
            return;
        let title;
        let body;
        if (upcoming.length === 1) {
            const debt = upcoming[0];
            const daysLeft = daysBetween(date, debt.dueDate);
            title = '⏰ Chi Tiêu — Nhắc nợ';
            body = daysLeft === 0
                ? `Khoản nợ "${debt.name}" đến hạn hôm nay!`
                : `Khoản nợ "${debt.name}" còn ${daysLeft} ngày nữa đến hạn.`;
        }
        else {
            const overdue = upcoming.filter(d => daysBetween(date, d.dueDate) === 0).length;
            title = `⏰ Chi Tiêu — ${upcoming.length} khoản nợ sắp đến hạn`;
            body = overdue > 0
                ? `${overdue} khoản đến hạn hôm nay, ${upcoming.length - overdue} khoản trong 7 ngày tới.`
                : `${upcoming.length} khoản nợ sẽ đến hạn trong 7 ngày tới.`;
        }
        // Send-then-mark (vấn đề F): chỉ ghi log nếu thực sự gửi thành công
        const sent = await sendNotificationToUser(user, title, body, {
            type: 'debt_reminder',
            count: String(upcoming.length),
        });
        if (sent) {
            await markAlertSent(user.userId, alertKey);
        }
    }));
    return null;
});
// ─── FUNCTION 4: Cảnh báo vượt ngân sách (triggered) ─────────────────────────
// Trigger khi có expense_event mới được thêm vào
exports.budgetAlertOnExpense = functions
    .region('asia-southeast1')
    .firestore.document('expense_events/{eventId}')
    .onCreate(async (snap) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    const ev = snap.data();
    if (!ev)
        return;
    const eventType = ev.eventType.toUpperCase();
    if (eventType !== 'EXPENSE_ADDED')
        return;
    const userId = ev.userId;
    const expData = (_a = ev.data) !== null && _a !== void 0 ? _a : {};
    // Bỏ qua nếu là linked expense (nợ/mục tiêu/tiết kiệm)
    if (expData._debtId || expData._goalId || expData._savingsMonthKey)
        return;
    // Lấy user info (gồm multi-device tokens qua getNotifUsers pattern).
    // Vì function này triggered (không batch), gọi trực tiếp cho user này thôi.
    const settingsDoc = await db.collection('user_settings').doc(userId).get();
    if (!settingsDoc.exists)
        return;
    const settingsData = settingsDoc.data();
    if (!settingsData.notifEnabled)
        return;
    // Gộp tokens từ legacy field + subcollection (backward compat)
    const tokens = [];
    const seenTokens = new Set();
    if (settingsData.fcmToken && typeof settingsData.fcmToken === 'string') {
        tokens.push({ token: settingsData.fcmToken, docRef: null });
        seenTokens.add(settingsData.fcmToken);
    }
    try {
        const tokensSnap = await settingsDoc.ref.collection('fcm_tokens').get();
        for (const tokenDoc of tokensSnap.docs) {
            const t = (_b = tokenDoc.data()) === null || _b === void 0 ? void 0 : _b.token;
            if (typeof t === 'string' && !seenTokens.has(t)) {
                tokens.push({ token: t, docRef: tokenDoc.ref });
                seenTokens.add(t);
            }
        }
    }
    catch ( /* no-op */_k) { /* no-op */ }
    if (tokens.length === 0)
        return;
    const user = {
        userId, tokens,
        notifEnabled: true,
        notifTime: '21:00',
        eventReminderTypes: [1, 6, 24],
    };
    // Lấy tháng của expense
    const expDate = (_c = expData.date) !== null && _c !== void 0 ? _c : '';
    if (!expDate)
        return;
    const monthKey = expDate.slice(0, 7);
    // Lấy budget tháng
    const budgetDoc = await db.collection('budgets').doc(`${userId}_${monthKey}`).get();
    if (!budgetDoc.exists)
        return;
    const budget = budgetDoc.data();
    const budgetAmt = (_e = (_d = budget === null || budget === void 0 ? void 0 : budget.spendingAmount) !== null && _d !== void 0 ? _d : budget === null || budget === void 0 ? void 0 : budget.amount) !== null && _e !== void 0 ? _e : 0;
    if (budgetAmt <= 0)
        return;
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
    ]);
    const deletedIds = new Set();
    deletedSnap.docs.forEach(d => {
        var _a, _b;
        const id = (_b = (_a = d.data()) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.id;
        if (id)
            deletedIds.add(id);
    });
    let totalSpent = 0;
    for (const doc of monthEventsSnap.docs) {
        const data = (_g = (_f = doc.data()) === null || _f === void 0 ? void 0 : _f.data) !== null && _g !== void 0 ? _g : {};
        if (!((_h = data.date) === null || _h === void 0 ? void 0 : _h.startsWith(monthKey)))
            continue;
        if (deletedIds.has(data.id))
            continue;
        if (data._debtId || data._goalId || data._savingsMonthKey)
            continue;
        totalSpent += (_j = data.amount) !== null && _j !== void 0 ? _j : 0;
    }
    const pct = Math.round((totalSpent / budgetAmt) * 100);
    let title = '';
    let body = '';
    if (pct >= 100 && pct < 105) {
        title = '🚨 Chi Tiêu — Vượt ngân sách!';
        body = `Bạn đã chi ${pct}% ngân sách tháng này. Hãy kiểm soát chi tiêu!`;
    }
    else if (pct >= 90 && pct < 100) {
        title = '⚠️ Chi Tiêu — Gần vượt ngân sách';
        body = `Bạn đã dùng ${pct}% ngân sách. Chỉ còn ${100 - pct}% nữa thôi!`;
    }
    else if (pct >= 70 && pct < 90) {
        title = '📊 Chi Tiêu — Chú ý ngân sách';
        body = `Bạn đã dùng ${pct}% ngân sách tháng ${monthKey.slice(5)}.`;
    }
    else {
        return;
    }
    // Dedup + send-then-mark (vấn đề F + B)
    const alertKey = `budget_alert_${monthKey}_${Math.floor(pct / 10) * 10}`;
    if (await wasAlertSent(userId, alertKey))
        return;
    const sent = await sendNotificationToUser(user, title, body, {
        type: 'budget_alert', month: monthKey, pct: String(pct),
    });
    if (sent) {
        await markAlertSent(userId, alertKey);
    }
});
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
exports.notifyNewVersion = functions
    .region('asia-southeast1')
    .runWith({ secrets: [notifySecret] })
    .https.onRequest(async (req, res) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o;
    // CORS chỉ cho phép app domain — không dùng wildcard (*)
    const allowedOrigin = (_a = process.env.APP_ORIGIN) !== null && _a !== void 0 ? _a : 'https://expense-app-tau-six.vercel.app';
    res.set('Access-Control-Allow-Origin', allowedOrigin);
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }
    // Rate limit theo IP: tối đa 10 lần/giờ — ngăn brute force secret
    const ip = (_f = (_d = (_c = (_b = req.headers['x-forwarded-for']) === null || _b === void 0 ? void 0 : _b.split(',')[0]) === null || _c === void 0 ? void 0 : _c.trim()) !== null && _d !== void 0 ? _d : (_e = req.socket) === null || _e === void 0 ? void 0 : _e.remoteAddress) !== null && _f !== void 0 ? _f : 'unknown';
    const rateLimitKey = `notifyNewVersion:${ip}`;
    const now = Date.now();
    const WINDOW_MS = 60 * 60 * 1000; // 1 giờ
    const MAX_ATTEMPTS = 10;
    const entry = ipRateLimitStore.get(rateLimitKey);
    if (entry && now < entry.windowEnd) {
        if (entry.count >= MAX_ATTEMPTS) {
            res.status(429).json({ error: 'Too many requests' });
            return;
        }
        entry.count++;
    }
    else {
        ipRateLimitStore.set(rateLimitKey, { count: 1, windowEnd: now + WINDOW_MS });
    }
    // Xác thực qua secret — tránh kẻ lạ gọi API này gửi spam
    const expectedSecret = notifySecret.value();
    if (!expectedSecret) {
        functions.logger.error('[notifyNewVersion] NOTIFY_SECRET chưa được cấu hình');
        res.status(500).json({ error: 'Server not configured' });
        return;
    }
    const providedSecret = (_h = (_g = req.body) === null || _g === void 0 ? void 0 : _g.secret) !== null && _h !== void 0 ? _h : (_j = req.query) === null || _j === void 0 ? void 0 : _j.secret;
    if (providedSecret !== expectedSecret) {
        functions.logger.warn('[notifyNewVersion] Secret không đúng');
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    // Có thể truyền optional version/buildNumber từ CI
    const version = String((_l = (_k = req.body) === null || _k === void 0 ? void 0 : _k.version) !== null && _l !== void 0 ? _l : '').slice(0, 50);
    const buildNumber = String((_o = (_m = req.body) === null || _m === void 0 ? void 0 : _m.buildNumber) !== null && _o !== void 0 ? _o : '').slice(0, 20);
    try {
        const users = await getNotifUsers();
        functions.logger.info(`[notifyNewVersion] Broadcasting to ${users.length} users`);
        const title = '🎉 Chi Tiêu — Có bản cập nhật mới!';
        const body = buildNumber
            ? `Phiên bản ${version || 'mới'} (Build ${buildNumber}) đã sẵn sàng. Mở app để cập nhật.`
            : 'Có phiên bản mới đã sẵn sàng. Mở app để cập nhật.';
        const results = await Promise.allSettled(users.map(user => 
        // Multi-device: sendNotificationToUser gửi tới mọi device
        // catch để không throw ra Promise.allSettled (dù allSettled đã an toàn)
        sendNotificationToUser(user, title, body, {
            type: 'app_update', version, buildNumber, url: '/settings',
        }).catch(err => {
            functions.logger.warn(`[notifyNewVersion] User ${user.userId}:`, err);
            return false;
        })));
        const success = results.filter(r => r.status === 'fulfilled' && r.value).length;
        const failed = results.length - success;
        functions.logger.info(`[notifyNewVersion] Done: ${success} sent, ${failed} failed`);
        res.status(200).json({
            ok: true,
            total: users.length,
            sent: success,
            failed,
        });
    }
    catch (err) {
        functions.logger.error('[notifyNewVersion] Error:', err);
        res.status(500).json({ error: 'Internal error' });
    }
});
// ─── FUNCTION 6: Send test notification (vấn đề I) ───────────────────────────
//
// Endpoint test thật: gửi notification qua pipeline FCM → SW → device.
// Thay thế cho `new Notification()` local ở client (chỉ test browser permission).
//
// Callable function — client gọi qua Firebase SDK, auth tự động (context.auth).
// Không cần secret.
exports.sendTestNotification = functions
    .region('asia-southeast1')
    .https.onCall(async (_data, context) => {
    var _a;
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Bạn cần đăng nhập');
    }
    const userId = context.auth.uid;
    // Fetch user + tokens (gộp legacy + subcollection)
    const settingsDoc = await db.collection('user_settings').doc(userId).get();
    if (!settingsDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Chưa có cài đặt');
    }
    const settingsData = settingsDoc.data();
    const tokens = [];
    const seen = new Set();
    if (settingsData.fcmToken && typeof settingsData.fcmToken === 'string') {
        tokens.push({ token: settingsData.fcmToken, docRef: null });
        seen.add(settingsData.fcmToken);
    }
    try {
        const tokensSnap = await settingsDoc.ref.collection('fcm_tokens').get();
        for (const tokenDoc of tokensSnap.docs) {
            const t = (_a = tokenDoc.data()) === null || _a === void 0 ? void 0 : _a.token;
            if (typeof t === 'string' && !seen.has(t)) {
                tokens.push({ token: t, docRef: tokenDoc.ref });
                seen.add(t);
            }
        }
    }
    catch ( /* no-op */_b) { /* no-op */ }
    if (tokens.length === 0) {
        throw new functions.https.HttpsError('failed-precondition', 'Chưa có thiết bị nào đăng ký nhận thông báo. Hãy bật thông báo ở Cài đặt trước.');
    }
    const user = {
        userId, tokens,
        notifEnabled: true,
        notifTime: '21:00',
        eventReminderTypes: [1, 6, 24],
    };
    try {
        await sendNotificationToUser(user, '✅ Chi Tiêu — Thông báo thử', `Pipeline FCM hoạt động tốt trên ${tokens.length} thiết bị! 🎉`, { type: 'test', url: '/settings' });
        return { ok: true, deviceCount: tokens.length };
    }
    catch (err) {
        functions.logger.error('[sendTestNotification]', err);
        throw new functions.https.HttpsError('internal', 'Không gửi được thông báo. Kiểm tra log hoặc thử lại sau.');
    }
});
// ─── FUNCTION 7: Cleanup (scheduled daily) ───────────────────────────────────
//
// Quét:
//   1. Alert log entries đã hết hạn (sentAt + 30 ngày) → xoá
//   2. FCM tokens không dùng > 60 ngày (lastUsedAt) → xoá
//
// Chạy 1 lần/ngày lúc 3:00 sáng để không ảnh hưởng peak.
exports.cleanupNotifData = functions
    .region('asia-southeast1')
    .runWith({ timeoutSeconds: 540, memory: '256MB' })
    .pubsub.schedule('0 3 * * *')
    .timeZone(TZ)
    .onRun(async () => {
    const now = Date.now();
    const alertCutoff = firestore_1.Timestamp.fromMillis(now - ALERT_LOG_TTL_MS);
    const tokenCutoff = firestore_1.Timestamp.fromMillis(now - 60 * 24 * 60 * 60 * 1000); // 60 ngày
    let alertsDeleted = 0;
    let tokensDeleted = 0;
    // Lấy mọi user có notifEnabled
    const usersSnap = await db.collection('user_settings').get();
    for (const userDoc of usersSnap.docs) {
        // 1. Cleanup alert_log: expiresAt <= now
        try {
            const expiredAlerts = await userDoc.ref
                .collection('alert_log')
                .where('sentAt', '<=', alertCutoff)
                .get();
            if (!expiredAlerts.empty) {
                const batch = db.batch();
                expiredAlerts.docs.forEach(d => batch.delete(d.ref));
                await batch.commit();
                alertsDeleted += expiredAlerts.size;
            }
        }
        catch (err) {
            functions.logger.warn(`[cleanup] alert_log for ${userDoc.id}:`, err);
        }
        // 2. Cleanup FCM tokens stale: lastUsedAt <= cutoff (60 ngày)
        try {
            const staleTokens = await userDoc.ref
                .collection('fcm_tokens')
                .where('lastUsedAt', '<=', tokenCutoff)
                .get();
            if (!staleTokens.empty) {
                const batch = db.batch();
                staleTokens.docs.forEach(d => batch.delete(d.ref));
                await batch.commit();
                tokensDeleted += staleTokens.size;
            }
        }
        catch (err) {
            functions.logger.warn(`[cleanup] fcm_tokens for ${userDoc.id}:`, err);
        }
    }
    functions.logger.info(`[cleanupNotifData] Deleted ${alertsDeleted} alert logs + ${tokensDeleted} stale tokens`);
    return null;
});
// ─── FUNCTION 8, 9, 10: Thông báo nhóm ──────────────────────────────────────
//
//  8. groupEventNotify   — onCreate group_events: thêm/sửa/xoá/status khoản
//  9. groupMemberJoinedNotify — onUpdate groups: thành viên mới vào nhóm
// 10. groupDeletedNotify — onDelete groups: chủ nhóm xoá nhóm
/** Helper: gửi thông báo nhóm cho danh sách uid (tái dùng cho join + delete). */
async function notifyGroupMembers(recipientUids, title, body, alertKeyFn, fcmData) {
    await Promise.allSettled(recipientUids.map(async (uid) => {
        const { tokens, notifEnabled, groupNotifEnabled } = await getTokensForUser(uid);
        if (!notifEnabled || !groupNotifEnabled || tokens.length === 0)
            return;
        const alertKey = alertKeyFn(uid);
        if (await wasAlertSent(uid, alertKey))
            return;
        const user = {
            userId: uid, tokens, notifEnabled: true, notifTime: '21:00', eventReminderTypes: [],
        };
        const sent = await sendNotificationToUser(user, title, body, fcmData);
        if (sent)
            await markAlertSent(uid, alertKey);
    }));
}
// Logic chọn người nhận + soạn nội dung nằm ở ./groupNotify (thuần, unit-test).
// Function này chỉ lo I/O Firestore + gửi FCM (tái dùng sendNotificationToUser).
/** Gom tokens của 1 user (legacy field + subcollection). Trả [] nếu không có. */
async function getTokensForUser(userId) {
    var _a;
    const settingsDoc = await db.collection('user_settings').doc(userId).get();
    if (!settingsDoc.exists)
        return { tokens: [], notifEnabled: false, groupNotifEnabled: false };
    const data = settingsDoc.data();
    const tokens = [];
    const seen = new Set();
    if (data.fcmToken && typeof data.fcmToken === 'string') {
        tokens.push({ token: data.fcmToken, docRef: null });
        seen.add(data.fcmToken);
    }
    try {
        const tokensSnap = await settingsDoc.ref.collection('fcm_tokens').get();
        for (const tokenDoc of tokensSnap.docs) {
            const t = (_a = tokenDoc.data()) === null || _a === void 0 ? void 0 : _a.token;
            if (typeof t === 'string' && !seen.has(t)) {
                tokens.push({ token: t, docRef: tokenDoc.ref });
                seen.add(t);
            }
        }
    }
    catch ( /* no-op: subcollection chưa tồn tại */_b) { /* no-op: subcollection chưa tồn tại */ }
    return {
        tokens,
        notifEnabled: !!data.notifEnabled,
        // Mặc định true: user cũ chưa có field này vẫn nhận thông báo nhóm.
        groupNotifEnabled: data.groupNotifEnabled !== false,
    };
}
exports.groupEventNotify = functions
    .region('asia-southeast1')
    .firestore.document('group_events/{eventId}')
    .onCreate(async (snap, context) => {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const raw = snap.data();
    if (!raw)
        return;
    const ev = {
        eventType: String((_a = raw.eventType) !== null && _a !== void 0 ? _a : ''),
        actorUid: String((_b = raw.actorUid) !== null && _b !== void 0 ? _b : ''),
        participants: Array.isArray(raw.participants) ? raw.participants : [],
        data: ((_c = raw.data) !== null && _c !== void 0 ? _c : {}),
    };
    const recipients = (0, groupNotify_1.getGroupRecipients)(ev);
    // Log chẩn đoán: vì sao có / không có người nhận (đặc biệt STATUS_SET).
    functions.logger.warn(`[groupEventNotify] type=${ev.eventType} actor=${ev.actorUid} ` +
        `status=${String((_e = (_d = ev.data) === null || _d === void 0 ? void 0 : _d.status) !== null && _e !== void 0 ? _e : '-')} hasPayerUid=${!!((_f = ev.data) === null || _f === void 0 ? void 0 : _f.payerUid)} ` +
        `participants=${ev.participants.length} recipients=${recipients.length}`);
    if (recipients.length === 0)
        return;
    const groupId = String((_g = raw.groupId) !== null && _g !== void 0 ? _g : '');
    if (!groupId)
        return;
    // Lấy tên nhóm + tên người thực hiện (1 read). Fallback nếu thiếu.
    let groupName = 'Nhóm';
    let actorName = 'Thành viên';
    try {
        const groupDoc = await db.collection('groups').doc(groupId).get();
        const g = groupDoc.data();
        if (g) {
            if (typeof g.name === 'string' && g.name.trim())
                groupName = g.name.trim();
            const m = (_h = g.members) === null || _h === void 0 ? void 0 : _h[ev.actorUid];
            if (m && typeof m.name === 'string' && m.name.trim())
                actorName = m.name.trim();
        }
    }
    catch (err) {
        functions.logger.warn(`[groupEventNotify] read group ${groupId} failed:`, err);
    }
    const eventId = context.params.eventId;
    const names = { groupName, actorName };
    await Promise.allSettled(recipients.map(async (uid) => {
        const body = (0, groupNotify_1.buildGroupNotifBody)(ev, uid, names);
        if (!body)
            return;
        const { tokens, notifEnabled, groupNotifEnabled } = await getTokensForUser(uid);
        if (!notifEnabled || !groupNotifEnabled || tokens.length === 0) {
            functions.logger.warn(`[groupEventNotify] skip ${uid}: notifEnabled=${notifEnabled} ` +
                `groupNotif=${groupNotifEnabled} tokens=${tokens.length}`);
            return;
        }
        // Dedup: Firestore trigger giao at-least-once → chống gửi 2 lần.
        const alertKey = `group_evt_${eventId}`;
        if (await wasAlertSent(uid, alertKey))
            return;
        const user = {
            userId: uid,
            tokens,
            notifEnabled: true,
            notifTime: '21:00',
            eventReminderTypes: [1, 6, 24],
        };
        const sent = await sendNotificationToUser(user, body.title, body.body, {
            type: 'group_entry',
            groupId,
            url: `/groups/${groupId}`,
        });
        functions.logger.info(`[groupEventNotify] sent=${sent} to ${uid} (${tokens.length} tokens)`);
        if (sent) {
            await markAlertSent(uid, alertKey);
        }
    }));
});
// ─── FUNCTION 9: Thành viên mới vào nhóm ─────────────────────────────────────
exports.groupMemberJoinedNotify = functions
    .region('asia-southeast1')
    .firestore.document('groups/{groupId}')
    .onUpdate(async (change, context) => {
    var _a;
    const before = change.before.data();
    const after = change.after.data();
    if (!before || !after)
        return;
    const beforeUids = Array.isArray(before.memberUids) ? before.memberUids : [];
    const afterUids = Array.isArray(after.memberUids) ? after.memberUids : [];
    // Chỉ xử lý khi có uid mới xuất hiện (bỏ qua đổi tên nhóm, gỡ thành viên...)
    const newUids = afterUids.filter(uid => !beforeUids.includes(uid));
    if (newUids.length === 0)
        return;
    const groupId = context.params.groupId;
    const groupName = typeof after.name === 'string' ? after.name.trim() || 'Nhóm' : 'Nhóm';
    for (const newUid of newUids) {
        const memberInfo = (_a = after.members) === null || _a === void 0 ? void 0 : _a[newUid];
        const newName = typeof (memberInfo === null || memberInfo === void 0 ? void 0 : memberInfo.name) === 'string'
            ? memberInfo.name.trim() || 'Thành viên'
            : 'Thành viên';
        // Báo tất cả thành viên CŨ (không bao gồm người vừa vào)
        const recipients = beforeUids.filter(uid => uid !== newUid);
        if (recipients.length === 0)
            continue;
        functions.logger.warn(`[groupMemberJoinedNotify] groupId=${groupId} newMember=${newUid} recipients=${recipients.length}`);
        await notifyGroupMembers(recipients, `👥 ${groupName}`, `${newName} vừa tham gia nhóm`, _uid => `group_joined_${groupId}_${newUid}`, { type: 'group_member_joined', groupId, url: `/groups/${groupId}` });
    }
});
// ─── FUNCTION 10: Chủ nhóm xoá nhóm ─────────────────────────────────────────
exports.groupDeletedNotify = functions
    .region('asia-southeast1')
    .firestore.document('groups/{groupId}')
    .onDelete(async (snap, context) => {
    var _a, _b;
    const data = snap.data();
    if (!data)
        return;
    const memberUids = Array.isArray(data.memberUids) ? data.memberUids : [];
    if (memberUids.length === 0)
        return;
    const groupId = context.params.groupId;
    const groupName = typeof data.name === 'string' ? data.name.trim() || 'Nhóm' : 'Nhóm';
    const ownerUid = typeof data.ownerUid === 'string' ? data.ownerUid : '';
    const ownerName = typeof ((_b = (_a = data.members) === null || _a === void 0 ? void 0 : _a[ownerUid]) === null || _b === void 0 ? void 0 : _b.name) === 'string'
        ? data.members[ownerUid].name.trim() || 'Chủ nhóm'
        : 'Chủ nhóm';
    functions.logger.warn(`[groupDeletedNotify] groupId=${groupId} groupName=${groupName} members=${memberUids.length}`);
    await notifyGroupMembers(memberUids, `👥 ${groupName}`, `${ownerName} đã xoá nhóm này`, _uid => `group_deleted_${groupId}`, { type: 'group_deleted', groupId, url: '/groups' });
});
//# sourceMappingURL=index.js.map