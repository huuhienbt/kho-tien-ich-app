# Các thay đổi bắt buộc trong Google Apps Script

Giao diện đã sẵn sàng, nhưng các chức năng dưới đây chỉ hoạt động đầy đủ sau khi Apps Script hỗ trợ đúng hợp đồng API này.

## 1. Sheet Prompts

Thêm cột `access` vào hàng tiêu đề:

- `normal`: mọi người được xem nội dung.
- `vip`: chỉ quản trị viên hoặc thành viên có `userToken` hợp lệ được xem.

Khi khách chưa đăng nhập gọi `GET ?type=prompts`, máy chủ chỉ nên trả Prompt thường. Với Prompt VIP, có thể trả metadata nhưng phải bỏ hoàn toàn trường `content`.

## 2. Tài khoản thành viên

Apps Script cần hỗ trợ các action POST:

### `user_register`

Dữ liệu vào: `name`, `email`, `password`.

Dữ liệu ra:

```json
{"status":"success","userToken":"TOKEN_NGAN_HAN","user":{"name":"Nguyễn Văn A","email":"a@example.com"}}
```

Không lưu mật khẩu dạng văn bản thường. Phải lưu mật khẩu đã băm kèm salt hoặc sử dụng một dịch vụ xác thực chuyên dụng.

### `user_login`

Dữ liệu vào: `email`, `password`. Khi hợp lệ, trả `userToken` và `user` giống cấu trúc trên.

### `google_login`

Dữ liệu vào: `credential` là Google ID token. Máy chủ phải xác minh chữ ký/token, `aud` đúng Web Client ID, `iss`, `exp` và trạng thái email trước khi tạo phiên thành viên. Không được chỉ giải mã JWT ở trình duyệt rồi tin kết quả.

Token thành viên nên có thời hạn và được lưu trong `CacheService` hoặc sheet phiên đăng nhập. Các API VIP phải xác minh token ở máy chủ.

## 3. Đăng nhập Google

1. Tạo OAuth Client loại **Web application** trong Google Cloud Console.
2. Thêm `https://sotaytienich.vercel.app` vào Authorized JavaScript origins.
3. Điền Client ID vào `GOOGLE_CLIENT_ID` trong `js/config.js`.
4. Triển khai lại Apps Script sau khi thêm action `google_login`.

## 4. Upload Drive không cần đăng nhập

Cho phép ba action chạy không cần `adminPassword`:

- `upload`
- `getResumableUrl`
- `setPermission`

Máy chủ vẫn phải kiểm tra:

- Danh sách MIME/type được phép.
- Dung lượng tối đa mỗi tệp.
- Tên tệp đã được làm sạch.
- Số lượt tải trong một khoảng thời gian.
- `fileId` thuộc đúng thư mục Drive trước khi đổi quyền.

Trợ giảng AI dùng lại action `upload` để lưu tệp `.docx` vừa tạo lên Drive.

## 5. Phạm vi quyền Drive

Apps Script cần được chủ sở hữu cấp quyền Drive và triển khai Web App ở chế độ thực thi bằng tài khoản chủ sở hữu. Nếu vẫn xuất hiện lỗi `DriveApp.Folder.createFile`, hãy chạy một hàm cấp quyền trực tiếp trong trình soạn thảo rồi chấp nhận phạm vi Drive trước khi tạo deployment mới.
