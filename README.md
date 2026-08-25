# Sổ tay tiện ích Nguyễn Hiển

Bộ giao diện HTML/CSS/JavaScript tĩnh, có thể triển khai trực tiếp trên Vercel.

## Cấu trúc

- `index.html`: Trang chủ và thống kê nhanh.
- `prompts.html`: Kho Prompt, tìm kiếm, lọc, sắp xếp và ghim.
- `repairs.html`: Nhật ký sửa chữa, thống kê, tìm kiếm và lọc trạng thái.
- `upload.html`: Một vùng tải tệp, tự chọn chế độ theo dung lượng.
- `ai.html`: Trợ giảng AI theo quy trình 4 bước.
- `style.css`: Toàn bộ hệ thống giao diện và responsive.
- `js/config.js`: Địa chỉ Apps Script, Drive và cấu hình dùng chung.
- `js/app.js`: Header, đăng nhập, modal, toast, API và tiện ích an toàn.
- `js/*.js`: Logic riêng của từng trang.

## Triển khai Vercel

Đưa toàn bộ nội dung trong thư mục này lên cùng một repository GitHub, bảo đảm thư mục `js` được giữ nguyên. Vercel có thể phục vụ trực tiếp vì trang chủ là `index.html`.

## Lưu ý bảo mật Apps Script

Giao diện đã yêu cầu đăng nhập trước khi tải tệp, gọi AI, thêm, sửa hoặc xóa. Tuy nhiên, bảo mật thực sự phải được kiểm tra trong Google Apps Script ở mọi action. Phiên bản hiện tại vẫn gửi `adminPassword` để tương thích máy chủ cũ.

Khi nâng cấp Apps Script, nên đổi sang quy trình:

1. `verify` trả về token ngắn hạn.
2. Trình duyệt lưu token thay cho mật khẩu.
3. Các action `upload`, `getResumableUrl`, `setPermission`, `generate_lesson_plan`, `create`, `update`, `delete` đều xác minh token.
4. Nếu dữ liệu là riêng tư, `doGet` cũng phải yêu cầu token.

Không xem việc ẩn nút trên giao diện là biện pháp bảo mật máy chủ.
