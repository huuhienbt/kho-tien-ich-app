# Cập nhật Prompt yêu thích đồng bộ theo tài khoản

## 1. Cập nhật Google Apps Script

1. Mở dự án Apps Script của E-GV.
2. Thay toàn bộ nội dung `Code.gs` bằng tệp `Code.gs` trong gói cập nhật.
3. Bấm **Lưu**.
4. Có thể chạy hàm `setupApplication()` một lần để tạo ngay sheet `PromptFavorites`.
   Nếu không chạy, hệ thống cũng tự tạo sheet này khi thành viên đăng nhập và mở Kho Prompt lần đầu.
5. Chọn **Triển khai > Quản lý các tùy chọn triển khai**.
6. Chỉnh sửa bản triển khai Web App, chọn **Phiên bản mới** rồi bấm **Triển khai**.

Sheet `PromptFavorites` gồm ba cột:

- `user_id`: mã tài khoản đã đăng nhập.
- `prompt_id`: mã Prompt yêu thích.
- `created_at`: thời điểm thêm vào yêu thích.

Không đổi tên hoặc xóa ba cột này.

## 2. Cập nhật GitHub/Vercel

Thay các tệp sau trên GitHub:

- `prompts.html`
- `js/prompts.js`
- `style.css`

Chờ Vercel triển khai xong rồi tải lại trang bằng `Ctrl + F5`.

## 3. Kiểm tra

1. Đăng nhập tài khoản thành viên trên điện thoại.
2. Nhấn ngôi sao của một Prompt.
3. Mở mục **★ Yêu thích** để kiểm tra.
4. Đăng nhập cùng tài khoản trên máy tính; Prompt đã chọn phải xuất hiện trong mục **★ Yêu thích**.

Khách chưa đăng nhập vẫn có thể đánh dấu tạm trên thiết bị. Khi đăng nhập, hệ thống tự nhập các đánh dấu này vào tài khoản rồi xóa bản lưu tạm.
