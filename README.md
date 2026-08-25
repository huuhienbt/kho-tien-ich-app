# E-GV – Sổ tay tiện ích giáo viên

Website tĩnh triển khai trên `https://e-gv.vercel.app`, kết nối Google Apps Script để quản lý Prompt, nhật ký sửa chữa, tải tệp Drive và soạn kế hoạch bài dạy bằng Gemini.

## Cấu trúc mã nguồn

- `index.html`, `prompts.html`, `repairs.html`, `upload.html`, `ai.html`: các trang giao diện.
- `style.css`: giao diện và responsive.
- `js/config.js`: URL Apps Script, Google Client ID và cấu hình chung.
- `js/app.js`: xác thực quản trị/thành viên, Google Sign-In và API.
- `js/*.js`: logic từng trang.
- `Code.gs`: mã máy chủ Google Apps Script hoàn chỉnh.
- `appsscript.json`: manifest quyền Sheets, Drive và gọi API ngoài.
- `HUONG_DAN_CAI_DAT.md`: trình tự cài đặt chi tiết.

## Chức năng phiên bản này

- Tên Word: `KHBD_MON_LOP_TEN_BAI.docx`, tự loại dấu tiếng Việt và viết hoa.
- Trợ giảng AI xuất `.docx` thật và lưu trực tiếp lên Google Drive.
- Upload Drive công khai không cần đăng nhập, có giới hạn dung lượng và tần suất cơ bản.
- Prompt thường xem công khai; Prompt VIP chỉ được máy chủ trả nội dung khi có token hợp lệ.
- Quản trị đăng nhập một lần để nhận token phiên; mật khẩu không còn lưu trong `sessionStorage`.
- Thành viên đăng ký bằng email/mật khẩu hoặc đăng nhập Google.

## Bảo mật

Không đưa `ADMIN_PASSWORD`, `GEMINI_API_KEY`, `TOKEN_SECRET` hoặc khóa bí mật nào lên GitHub. Các giá trị này phải đặt trong **Apps Script > Project Settings > Script Properties**.

Các khóa hoặc mật khẩu từng bị gửi trong tin nhắn/công khai phải được thu hồi và tạo mới trước khi triển khai.
