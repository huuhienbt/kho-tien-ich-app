# E-GV v9.1 – Tối ưu tốc độ đăng nhập

## Tệp cần thay

Trên GitHub/Vercel, thay:

- `js/app.js`
- `index.html`
- `prompts.html`
- `upload.html`
- `ai.html`
- `calendar.html`
- `repairs.html`

Các tệp HTML chỉ đổi mã phiên bản `app.js?v=9.1.0` để trình duyệt tải đúng JavaScript mới.

Trong Google Apps Script, thay:

- `Code.gs`

Các tệp giao diện và dữ liệu còn lại được giữ nguyên từ E-GV v9.0.

## Triển khai Apps Script

1. Mở dự án Google Apps Script đang dùng cho E-GV.
2. Thay toàn bộ nội dung `Code.gs` bằng tệp mới.
3. Chọn **Deploy → Manage deployments → Edit**.
4. Chọn **New version → Deploy** để giữ nguyên URL Web App.
5. Không thay đổi Script Properties và không tạo lại Google Sheet.

## Kiểm tra sau cập nhật

1. Mở E-GV ở cửa sổ ẩn danh và thử đăng nhập thành viên bằng email.
2. Đăng xuất, thử đăng nhập Google.
3. Đăng xuất, thử đăng nhập quản trị.
4. Chuyển giữa Kho Prompt, Lịch Việt và Nhật ký sửa chữa để kiểm tra phiên được giữ nguyên.
5. Trong **Kho Prompt → Quản lý tài khoản**, đổi một tài khoản từ Thường sang VIP rồi tải lại bằng tài khoản đó để kiểm tra quyền mới.

## Cách hoạt động

- Website gọi nhẹ endpoint `health` ở chế độ nền để chuẩn bị Apps Script trước khi người dùng gửi thông tin đăng nhập.
- Hồ sơ thành viên được lưu trên trình duyệt để giao diện nhận diện ngay, nhưng mọi API riêng tư vẫn xác minh token ở máy chủ.
- Apps Script lưu đệm tài khoản trong 5 phút; không lưu mật khẩu gốc, API key hoặc mật khẩu quản trị trong bộ nhớ trình duyệt.
- Phiên thành viên có thời hạn 7 ngày. Phiên quản trị có thời hạn 8 giờ và chỉ được giữ trong phiên trình duyệt hiện tại.
- Lần đầu sau thời gian dài không sử dụng vẫn có thể chậm do Apps Script khởi động; các lần sau và thao tác chuyển trang sẽ nhanh hơn.

## Không thay đổi

- Phân quyền Khách, Thường, VIP và Quản trị.
- Google Sign-In và đăng nhập email/mật khẩu.
- Prompt VIP, Prompt yêu thích và quản lý tài khoản.
- Nhật ký sửa chữa, Lịch Việt, Trợ giảng AI, tải Drive và QR.
