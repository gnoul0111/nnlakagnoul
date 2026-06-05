"use strict";
// ════════════════════════════════════════════════════════════════════════════
// Logic THUẦN cho thông báo nhóm (chi tiêu chung).
//
// File này KHÔNG import firebase-admin/functions → unit-test được độc lập
// (xem functions/__tests__/groupNotify.test.ts). index.ts ráp với I/O Firestore.
// ════════════════════════════════════════════════════════════════════════════
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatVND = formatVND;
exports.getGroupRecipients = getGroupRecipients;
exports.buildGroupNotifBody = buildGroupNotifBody;
/** Định dạng tiền VND. */
function formatVND(n) {
    try {
        return new Intl.NumberFormat('vi-VN', {
            style: 'currency',
            currency: 'VND',
            maximumFractionDigits: 0,
        }).format(n);
    }
    catch (_a) {
        return `${Math.round(n).toLocaleString('vi-VN')}₫`;
    }
}
/**
 * Danh sách uid cần nhận thông báo cho 1 group event (THUẦN, không I/O).
 *
 *  • GROUP_ENTRY_ADDED   → mọi participant trừ người tạo.
 *  • GROUP_ENTRY_UPDATED → mọi participant trừ người sửa, NHƯNG bỏ qua nếu
 *    data.notifyFinancial === false (chỉ sửa note/ngày → không báo). Thiếu field
 *    (client cũ) → coi như có thay đổi → vẫn báo.
 *  • GROUP_ENTRY_DELETED → mọi participant trừ người xoá.
 *  • GROUP_ENTRY_STATUS_SET → báo người trả (payerUid) khi status === 'done' HOẶC
 *    'skipped' và payer ≠ người bấm. Thiếu payerUid (client cũ) → không báo.
 *  • Loại khác → không báo.
 */
function getGroupRecipients(ev) {
    var _a;
    const type = String(ev.eventType).toUpperCase();
    const actor = ev.actorUid;
    const participants = Array.isArray(ev.participants) ? ev.participants : [];
    const data = (_a = ev.data) !== null && _a !== void 0 ? _a : {};
    if (type === 'GROUP_ENTRY_ADDED' || type === 'GROUP_ENTRY_DELETED') {
        return participants.filter(uid => uid !== actor);
    }
    if (type === 'GROUP_ENTRY_UPDATED') {
        if (data.notifyFinancial === false)
            return [];
        return participants.filter(uid => uid !== actor);
    }
    if (type === 'GROUP_ENTRY_STATUS_SET') {
        const status = data.status;
        if (status !== 'done' && status !== 'skipped')
            return [];
        const payer = data.payerUid;
        if (typeof payer !== 'string' || !payer || payer === actor)
            return [];
        return [payer];
    }
    return [];
}
/**
 * Nội dung (title + body) cho 1 người nhận cụ thể (THUẦN, không I/O).
 * Trả về null nếu event không phát sinh thông báo.
 */
function buildGroupNotifBody(ev, recipientUid, names, fmtMoney = formatVND) {
    var _a, _b;
    const type = String(ev.eventType).toUpperCase();
    const data = (_a = ev.data) !== null && _a !== void 0 ? _a : {};
    const rawNote = typeof data.note === 'string' ? data.note.trim() : '';
    const note = rawNote || 'Khoản chung';
    const title = `👥 ${names.groupName}`;
    if (type === 'GROUP_ENTRY_ADDED' || type === 'GROUP_ENTRY_UPDATED') {
        const verb = type === 'GROUP_ENTRY_ADDED' ? 'thêm' : 'sửa';
        const splits = Array.isArray(data.splits) ? data.splits : [];
        const myShare = (_b = splits.find(s => (s === null || s === void 0 ? void 0 : s.uid) === recipientUid)) === null || _b === void 0 ? void 0 : _b.amount;
        const shareStr = typeof myShare === 'number' && myShare > 0
            ? ` · phần của bạn ${fmtMoney(myShare)}`
            : '';
        return { title, body: `${names.actorName} ${verb} khoản «${note}»${shareStr}` };
    }
    if (type === 'GROUP_ENTRY_DELETED') {
        return { title, body: `${names.actorName} đã xoá khoản «${note}»` };
    }
    if (type === 'GROUP_ENTRY_STATUS_SET') {
        const verb = data.status === 'skipped' ? 'bỏ qua' : 'xử lý';
        return { title, body: `${names.actorName} đã ${verb} phần của họ trong «${note}»` };
    }
    return null;
}
//# sourceMappingURL=groupNotify.js.map