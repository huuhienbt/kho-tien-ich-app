# Hướng dẫn cài đặt E-GV

## Bước 1 – Thay khóa đã lộ

Trước khi triển khai, hãy đổi mật khẩu quản trị và thu hồi khóa Gemini cũ. Không tiếp tục dùng lại thông tin đã từng được gửi trong tin nhắn hoặc đưa vào mã nguồn.

## Bước 2 – Cấu hình Google Apps Script

1. Thay nội dung tệp mã máy chủ bằng `Code.gs` trong gói này.
2. Bật hiển thị manifest và thay nội dung bằng `appsscript.json`.
3. Mở **Project Settings > Script Properties** và thêm:

| Thuộc tính | Giá trị |
| --- | --- |
| `ADMIN_PASSWORD` | Mật khẩu quản trị mới |
| `FOLDER_ID` | ID thư mục Drive nhận tệp |
| `GEMINI_API_KEY` | Khóa Gemini mới |
| `GEMINI_API_KEY_2` | Khóa Gemini dự phòng; nên thuộc Project khác |
| `GEMINI_API_KEY_3` | Tùy chọn; khóa dự phòng thứ ba |
| `TOKEN_SECRET` | Có thể bỏ trống; `setupApplication` sẽ tự tạo. Không đổi sau khi đã có người dùng |
| `GOOGLE_CLIENT_ID` | Web Client ID của Google Sign-In; bỏ trống nếu chưa dùng |
| `GEMINI_MODEL` | Tùy chọn; mặc định `gemini-3.6-flash` |
| `GEMINI_AGE_MODEL` | Tùy chọn; model riêng cho phần luận lịch, nếu bỏ trống sẽ dùng `GEMINI_MODEL` |
| `MAX_UPLOAD_MB` | Tùy chọn; mặc định `100` |

4. Chọn hàm `setupApplication` và bấm **Run** một lần.
5. Chấp nhận quyền Google Sheets, Google Drive và kết nối API ngoài.
6. Hàm sẽ tạo/chuẩn hóa các sheet `Prompts`, `Repairs`, `Users`; sheet `Prompts` tự bổ sung cột `access`.

## Bước 3 – Triển khai Web App

1. Chọn **Deploy > Manage deployments > Edit** hoặc **New deployment**.
2. Execute as: **User deploying**.
3. Who has access: **Anyone**.
4. Tạo phiên bản mới và sao chép URL `/exec`.
5. Điền URL này vào `API_URL` trong `js/config.js`.

Nếu gặp lỗi `DriveApp.Folder.createFile`, hãy chạy lại `setupApplication`, chấp nhận quyền Drive rồi tạo deployment phiên bản mới.

## Bước 4 – Cấu hình đăng nhập Google

1. Trong Google Cloud Console, tạo OAuth Client loại **Web application**.
2. Thêm Authorized JavaScript origin: `https://e-gv.vercel.app`.
3. Điền cùng một Client ID vào:
   - `GOOGLE_CLIENT_ID` trong `js/config.js`.
   - Script Property `GOOGLE_CLIENT_ID` trong Apps Script.
4. Không dùng nút Google tự thiết kế; giao diện đã dùng Google Identity Services để tạo nút chính thức.

## Bước 5 – Đưa giao diện lên GitHub/Vercel

1. Tải các tệp HTML, CSS, thư mục `js` lên thư mục gốc của repository.
2. Không bắt buộc tải `Code.gs`, `appsscript.json` và các tệp hướng dẫn lên Vercel; có thể lưu chúng trong thư mục `apps-script/` của repository để quản lý phiên bản.
3. Giữ nguyên cấu trúc thư mục `js`.
4. Vercel sẽ tự triển khai lại sau khi GitHub có commit mới.

## Quy ước dữ liệu Prompt

Sheet `Prompts` sử dụng các cột:

```text
id | title | category | content | platform | access | created_at
```

- `access = normal`: mọi người xem được.
- `access = vip`: khách chỉ thấy thẻ khóa; nội dung chỉ trả về sau khi đăng nhập.

## Quy ước tên tệp kế hoạch bài dạy

Mẫu:

```text
KHBD_MON_<MÔN>_LOP_<LỚP>_<TÊN_BÀI>.docx
```

Ví dụ môn Tiếng Việt, lớp 4, bài Điều kì diệu:

```text
KHBD_MON_TIENG_VIET_LOP_4_DIEU_KI_DIEU.docx
```

Website ưu tiên thông tin đã nhập trong biểu mẫu. Nếu để trống, website tự đọc các dòng `Môn:`, `Lớp:` và `Tên bài:` trong kết quả AI. Nếu vẫn thiếu một trong ba nội dung, hệ thống yêu cầu điền bổ sung trước khi xuất Word để không tạo tên chung chung.
