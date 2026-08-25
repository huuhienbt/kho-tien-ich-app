# Sổ tay tiện ích Nguyễn Hiển

Bộ giao diện HTML/CSS/JavaScript tĩnh, có thể triển khai trực tiếp trên Vercel.

## Cấu trúc

- `index.html`: Trang chủ và thống kê nhanh.
- `prompts.html`: Kho Prompt thường/VIP, tìm kiếm, lọc, sắp xếp và ghim.
- `repairs.html`: Nhật ký sửa chữa, thống kê, tìm kiếm và lọc trạng thái.
- `upload.html`: Tải tệp công khai không cần đăng nhập, tự chọn chế độ theo dung lượng.
- `ai.html`: Trợ giảng AI, xuất `.docx` thật và lưu tệp Word lên Drive.
- `style.css`: Toàn bộ hệ thống giao diện và responsive.
- `js/config.js`: Địa chỉ Apps Script, Drive và cấu hình dùng chung.
- `js/app.js`: Header, đăng nhập, modal, toast, API và tiện ích an toàn.
- `js/*.js`: Logic riêng của từng trang.

## Triển khai Vercel

Đưa toàn bộ nội dung trong thư mục này lên cùng một repository GitHub, bảo đảm thư mục `js` được giữ nguyên. Vercel có thể phục vụ trực tiếp vì trang chủ là `index.html`.

## Cấu hình mới cần thực hiện

1. Thêm cột `access` vào sheet `Prompts`; giá trị hợp lệ là `normal` hoặc `vip`.
2. Cập nhật các action tài khoản trong Apps Script theo tệp `GAS_REQUIRED_ACTIONS.md`.
3. Điền Web Client ID vào `GOOGLE_CLIENT_ID` trong `js/config.js` nếu dùng đăng nhập Google.
4. Cho phép các action tải tệp chạy công khai: `upload`, `getResumableUrl`, `setPermission`.

## Lưu ý bảo mật Apps Script

Prompt VIP phải được ẩn từ phía Apps Script. Chỉ che nội dung bằng CSS/JavaScript không đủ an toàn vì dữ liệu có thể vẫn xuất hiện trong phản hồi mạng.

Phiên bản giao diện vẫn gửi `adminPassword` để tương thích máy chủ cũ. Nên đổi quản trị sang token ngắn hạn trong lần nâng cấp Apps Script tiếp theo.

Khi nâng cấp Apps Script, nên đổi sang quy trình:

1. `verify` trả về token ngắn hạn.
2. Trình duyệt lưu token thay cho mật khẩu.
3. Các action `generate_lesson_plan`, `create`, `update`, `delete` đều xác minh token quản trị.
4. Nếu dữ liệu là riêng tư, `doGet` cũng phải yêu cầu token.

Upload công khai nên có giới hạn dung lượng, loại tệp, số lượt theo IP/phiên và kiểm tra tên tệp tại máy chủ.

Không xem việc ẩn nút trên giao diện là biện pháp bảo mật máy chủ.
