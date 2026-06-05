# Setup Push Notification khi Deploy Version Mới

## 1. Tạo secret và lưu vào Firebase Secret Manager

Tạo chuỗi random dài (PowerShell):
```powershell
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 48 | ForEach-Object {[char]$_})
```
→ Copy chuỗi kết quả (48 ký tự).

Lưu vào Firebase Secret Manager:
```powershell
cd functions
firebase functions:secrets:set NOTIFY_SECRET
```
Khi được hỏi, **paste chuỗi** đã tạo ở trên và Enter.

## 2. Build và Deploy Cloud Functions

```powershell
cd functions
npm run build
cd ..
firebase deploy --only functions:notifyNewVersion
```

URL endpoint sau khi deploy:
```
https://asia-southeast1-nnlakagnoul.cloudfunctions.net/notifyNewVersion
```

Lần đầu deploy, Firebase sẽ tự động:
- Bật Secret Manager API
- Grant quyền truy cập secret cho function

## 3. Cấu hình Vercel Environment Variables

Vercel Dashboard → Project → Settings → **Environment Variables**:

| Key | Value | Environments |
|---|---|---|
| `NEXT_PUBLIC_BUILD_VERSION` | `0.1.0` | Production, Preview |
| `NEXT_PUBLIC_BUILD_NUMBER` | `$VERCEL_GIT_COMMIT_SHA` | Production, Preview |

Vercel tự replace `$VERCEL_GIT_COMMIT_SHA` thành commit SHA đầy đủ. Muốn ngắn 7 ký tự, sửa `package.json`:
```json
{
  "scripts": {
    "build": "next build"
  }
}
```
Rồi trong Vercel env, đặt thêm script `prebuild`:
```json
"prebuild": "node -e \"console.log('NEXT_PUBLIC_BUILD_NUMBER=' + (process.env.VERCEL_GIT_COMMIT_SHA || 'dev').slice(0,7))\" >> .env.production"
```
(Hoặc giữ nguyên commit SHA đầy đủ cũng không sao)

## 4. GitHub Actions tự gọi sau mỗi deploy

Tạo file `.github/workflows/notify-deploy.yml`:

```yaml
name: Notify on Vercel Deploy

on:
  deployment_status:

jobs:
  notify:
    if: github.event.deployment_status.state == 'success' && github.event.deployment_status.environment == 'Production'
    runs-on: ubuntu-latest
    steps:
      - name: Send push notification
        run: |
          curl -X POST https://asia-southeast1-nnlakagnoul.cloudfunctions.net/notifyNewVersion \
            -H "Content-Type: application/json" \
            -d '{
              "secret": "${{ secrets.NOTIFY_SECRET }}",
              "version": "${{ github.ref_name }}",
              "buildNumber": "${{ github.sha }}"
            }'
```

GitHub repo → **Settings → Secrets and variables → Actions** → New repository secret:
- Name: `NOTIFY_SECRET`
- Value: chuỗi secret y hệt ở bước 1

## 5. Gọi thủ công (nếu chưa setup GitHub Actions)

```powershell
$SECRET = "CHUOI_SECRET_CUA_BAN"
curl -X POST `
  https://asia-southeast1-nnlakagnoul.cloudfunctions.net/notifyNewVersion `
  -H "Content-Type: application/json" `
  -d "{`"secret`":`"$SECRET`",`"version`":`"0.1.1`",`"buildNumber`":`"abc1234`"}"
```

## 6. Test

1. Cài PWA trên điện thoại (Add to Home Screen — bắt buộc với iOS)
2. Bật thông báo trong Settings của app
3. Deploy 1 commit mới lên Vercel
4. Chờ ~1-2 phút → nhận thông báo "🎉 Chi Tiêu — Có bản cập nhật mới!"
5. Bấm vào thông báo → mở app → thấy nút "Cập nhật" trong Settings

## 6b. Thông báo nhóm (chi tiêu chung)

Function `groupEventNotify` tự gửi thông báo cho thành viên nhóm khi có khoản
chung mới / bị sửa (đổi tiền hoặc cách chia) / hoặc ai đó bấm "Đã xử lý" (báo
riêng người trả). Trigger Firestore `onCreate` trên `group_events` — KHÔNG cần
secret, KHÔNG cần env mới.

Deploy (lần đầu hoặc khi sửa logic):
```powershell
cd functions
npm run build
cd ..
firebase deploy --only functions:groupEventNotify
```

Bật/tắt: trong app → Cài đặt → Thông báo → "Thông báo nhóm" (mặc định bật khi
đã bật thông báo). Gửi cho mọi thiết bị của thành viên, dùng chung pipeline FCM.

## 7. Debug

Xem log Cloud Function realtime:
```powershell
firebase functions:log --only notifyNewVersion
```

Xem danh sách secrets:
```powershell
firebase functions:secrets:access NOTIFY_SECRET
```

Update secret (tạo phiên bản mới):
```powershell
firebase functions:secrets:set NOTIFY_SECRET
firebase deploy --only functions:notifyNewVersion
```

### Lỗi thường gặp

| Lỗi | Nguyên nhân | Fix |
|---|---|---|
| `401 Unauthorized` | Secret không khớp | Kiểm tra GitHub secret = Firebase secret |
| `500 Server not configured` | Chưa set `NOTIFY_SECRET` | Chạy `firebase functions:secrets:set` |
| `0 sent` | User chưa có `fcmToken` hoặc `notifEnabled=false` | User phải bật thông báo trong Settings |
| Function không có quyền đọc secret | Deploy chưa update IAM | Chạy `firebase deploy --only functions:notifyNewVersion` |
