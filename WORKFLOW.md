# Quy trình phát triển & deploy

Tài liệu này mô tả cách đưa code lên production một cách an toàn.

## Vì sao có quy trình này?

**Trước đây:** sửa code → push thẳng `main` → Vercel deploy luôn. Nếu code lỗi → lên thẳng production, user thấy lỗi ngay.

**Bây giờ:** code phải qua "trạm kiểm tra" (GitHub Actions CI) — chạy test + build, **xanh mới được vào `main`**. Lỗi bị chặn trước khi tới user.

Nhánh `main` đã được bật **branch protection**: không thể push thẳng, mọi thay đổi phải qua Pull Request + CI xanh.

---

## Quy trình 4 bước

### 1. Tạo nhánh riêng để làm
```powershell
git checkout -b fix/ten-thay-doi
```
Tạo nhánh tách khỏi `main` để làm việc. Sửa code thoải mái, không ảnh hưởng bản chính.

> Quy ước đặt tên: `fix/...` (sửa lỗi), `feat/...` (tính năng mới), `chore/...` (dọn dẹp/cấu hình).

### 2. Sửa xong → chạy deploy.ps1
```powershell
.\deploy.ps1
```
Script phát hiện đang ở nhánh (không phải `main`) → **SHIP MODE**:
quét secret → commit → push nhánh → tự mở link tạo Pull Request.

### 3. Tạo PR & đợi CI
- Bấm **Create pull request** ở link vừa mở.
- CI tự chạy (~2-3 phút): test + build.
- 🟢 `build-and-test` xanh → bấm **Merge pull request**.
- Merge xong → code vào `main` → **Vercel tự động deploy** bản chính thức.

> `security-audit` có thể đỏ cũng không sao — nó chỉ báo cáo lỗ hổng dependency, không chặn merge. Chỉ cần `build-and-test` xanh.

### 4. Gửi thông báo cho users
```powershell
git checkout main
git pull
.\deploy.ps1
```
Lần này script thấy đang ở `main` cây sạch → **NOTIFY MODE**:
không commit gì, chỉ đợi Vercel build xong rồi gửi push notification cho users.

---

## Sơ đồ

```
Tạo nhánh → Sửa code → deploy.ps1 (tạo PR) → CI xanh → Merge
                                                          ↓
                                                  Vercel tự deploy
                                                          ↓
                              về main + pull + deploy.ps1 (gửi thông báo)
```

`deploy.ps1` làm 2 việc khác nhau tùy vị trí:
| Đang ở | deploy.ps1 làm gì |
|--------|-------------------|
| Nhánh (feature) | commit + push + mở link PR |
| `main` cây sạch | đợi Vercel + gửi notification |
| `main` có thay đổi | ❌ chặn lại, bắt tạo nhánh |

---

## Trường hợp khẩn cấp (hotfix)

Khi cần sửa gấp production, bỏ qua quy trình PR:
```powershell
.\deploy.ps1 -Hotfix
```
Commit + push thẳng `main`, **bỏ qua CI gate**. Chỉ dùng khi thật sự khẩn cấp.

> Lưu ý: nếu branch protection bật "Require a pull request", lệnh `-Hotfix` push thẳng main có thể bị GitHub từ chối. Khi đó vẫn phải đi qua PR như thường.

---

## Nhắc nhở quan trọng

- **Firestore rules deploy RIÊNG** — không đi cùng deploy code. Sửa `firestore.rules` xong phải publish qua Firebase Console hoặc `firebase deploy --only firestore:rules`.
- **Thêm collection mới** → nhớ thêm rule tương ứng trong `firestore.rules`, nếu không sẽ lỗi "Missing or insufficient permissions".
- **Chạy thử local trước khi ship**: `npm run build` + `npm test` để bắt lỗi sớm.
