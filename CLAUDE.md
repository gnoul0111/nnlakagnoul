# Hướng dẫn cho Claude

## 1. Bắt đầu session mới — đọc trước khi làm

Khi bắt đầu session mới, đọc các file sau để nắm bối cảnh dự án:

- `README.md` — cấu trúc, setup, scripts, kiến trúc tổng quan
- `DESIGN_NOTES.local.md` — ràng buộc kỹ thuật, bẫy đã gặp, quyết định thiết kế
- `NOTIFICATION_SETUP.md` — cấu hình push notifications
- `WORKFLOW.md` — quy trình commit / deploy

## 2. Kết thúc mỗi vấn đề — hỏi rồi mới update

Sau khi hoàn thành một fix hoặc feature, hỏi user:

> **"Vấn đề này done chưa anh?"**

Khi user xác nhận done → cập nhật ngay trong cùng lượt đó:

- **`DESIGN_NOTES.local.md`** — thêm vào đúng mục liên quan:
  - Gotcha / bẫy mới → mục "Các bẫy đã từng dính"
  - Quyết định thiết kế / ràng buộc → mục "Quyết định thiết kế"
  - Tính năng lớn → thêm section mới
- **`README.md`** — chỉ cập nhật nếu có thay đổi cấu trúc thư mục, script mới, hoặc bước setup mới

Không đọc lại toàn bộ 2 file — chỉ append/edit đúng phần liên quan đến những gì vừa làm trong conversation.
