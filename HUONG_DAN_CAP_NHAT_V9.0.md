# E-GV v9.0 – Phân quyền tài khoản

## Ma trận quyền

| Khu vực | Chưa đăng nhập | Thành viên Thường | Thành viên VIP | Quản trị |
|---|---|---|---|---|
| Prompt thường | Xem và sao chép | Xem, sao chép, sử dụng | Xem, sao chép, sử dụng | Toàn quyền |
| Prompt VIP | Bị khóa | Bị khóa | Xem, sao chép, sử dụng | Toàn quyền |
| Nhật ký sửa chữa | Chỉ số liệu tổng hợp | Tên công việc và trạng thái | Tên công việc và trạng thái | Đầy đủ thông tin |
| Quản lý tài khoản | Không | Không | Không | Phân loại Thường/VIP |

## Cập nhật GitHub/Vercel

Thay các tệp sau trong repository web:

- `index.html`
- `prompts.html`
- `repairs.html`
- `ai.html`
- `calendar.html`
- `upload.html`
- `style.css`
- `js/app.js`
- `js/index.js`
- `js/prompts.js`
- `js/repairs.js`

## Cập nhật Google Apps Script

1. Dán toàn bộ `Code.gs` mới vào dự án Apps Script.
2. Chọn **Deploy → Manage deployments → Edit**.
3. Chọn **New version → Deploy** để giữ nguyên URL Web App.
4. Không cần thay đổi Script Properties.

`Code.gs` tự bổ sung cột `membership` vào sheet `Users`. Tài khoản cũ hoặc tài khoản mới mặc định là `regular`; quản trị có thể chuyển thành `vip` trên giao diện.

## Cấp quyền VIP

1. Đăng nhập **Quản trị viên**.
2. Mở **Kho Prompt**.
3. Bấm **Quản lý tài khoản**.
4. Tìm theo tên hoặc email.
5. Bấm **Cấp quyền VIP** hoặc **Chuyển về Thường**.

Quyền mới được máy chủ áp dụng ngay. Thành viên đang mở trang chỉ cần tải lại Kho Prompt; nếu nhãn tài khoản chưa đổi thì đăng xuất và đăng nhập lại.
