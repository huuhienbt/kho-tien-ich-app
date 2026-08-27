# E-GV v5.6 – Điều hướng lịch linh hoạt

Website tĩnh triển khai trên `https://e-gv.vercel.app`, kết nối Google Apps Script để quản lý Prompt, nhật ký sửa chữa, tải tệp Drive và soạn kế hoạch bài dạy bằng Gemini.

## Cấu trúc mã nguồn

- `index.html`, `prompts.html`, `repairs.html`, `upload.html`, `ai.html`: các trang giao diện.
- `style.css`: giao diện nền và các thành phần chức năng.
- `modern-saas.css`: lớp giao diện Modern SaaS mới, màu xanh dương chủ đạo và responsive cho điện thoại.
- `js/config.js`: URL Apps Script, Google Client ID và cấu hình chung.
- `js/app.js`: xác thực quản trị/thành viên, Google Sign-In và API.
- `js/*.js`: logic từng trang.
- `Code.gs`: mã máy chủ Google Apps Script hoàn chỉnh.
- `appsscript.json`: manifest quyền Sheets, Drive và gọi API ngoài.
- `HUONG_DAN_CAI_DAT.md`: trình tự cài đặt chi tiết.

## Chức năng phiên bản này

- Xem ngày hôm trước hoặc ngày hôm sau ngay trên thẻ lịch.
- Chọn một ngày bất kỳ bằng lịch chọn ngày của máy tính hoặc điện thoại.
- Nút `Về hôm nay` xuất hiện khi đang xem ngày khác và đưa lịch về ngày hiện tại chỉ với một lần bấm.
- Tự cập nhật đồng bộ ngày dương, ngày âm, Can Chi, Hành, Sao và Trực theo ngày được chọn; giữ múi giờ Việt Nam.
- Hiển thị ngay hộp “Đang xác minh tài khoản Google” sau khi người dùng chọn tài khoản, không còn cảm giác trang bị đứng.
- Ngăn gửi trùng yêu cầu đăng nhập và tự thông báo nếu máy chủ phản hồi quá lâu.
- Dùng `CacheService` để giảm thao tác lặp với token và tài khoản Google đã xác minh.
- Chỉ cập nhật `last_login` tối đa một lần trong 30 phút và rút ngắn thời gian giữ khóa ghi dữ liệu.
- Nhận diện E-GV mới với hệ màu xanh dương, gradient xanh–tím, thẻ trắng và bóng đổ nhẹ.
- Banner và các thẻ thống kê được chuẩn hóa theo phong cách dashboard hiện đại.
- Thanh điều hướng cố định dưới màn hình điện thoại, trong đó nút Trợ giảng AI được làm nổi ở vị trí trung tâm để thao tác nhanh.
- Giữ nguyên toàn bộ API, đăng nhập, Prompt VIP/yêu thích, tải Drive–QR và quy trình xuất KHBD.

- Tên Word tự lấy môn, lớp và tên bài từ biểu mẫu hoặc kết quả AI theo mẫu `KHBD_MON_<MÔN>_LOP_<LỚP>_<TÊN_BÀI>.docx`; tự loại dấu tiếng Việt và viết hoa.
- DOCX tách riêng tiêu đề và từng dòng thông tin, căn bảng ổn định để không còn hiện tượng chữ bị kéo giãn hoặc nhảy vị trí.
- Các đề mục La Mã và đánh số được in đậm; dấu đầu dòng thống nhất bằng dấu `-`.
- Bảng hoạt động GV/HS sử dụng tỉ lệ cột 6:4, tiêu đề cột căn giữa và nội dung tự ngắt dòng trong khung.
- Bộ phân tích tự sửa bảng Markdown thiếu dấu `|`, gom tất cả dòng `GV` vào cột trái và `HS` vào cột phải để không còn nội dung hoạt động rơi ra ngoài bảng.
- Trợ giảng AI xuất `.docx` thật và lưu trực tiếp lên Google Drive.
- Upload Drive công khai không cần đăng nhập, có giới hạn dung lượng và tần suất cơ bản.
- Prompt thường xem công khai; Prompt VIP chỉ được máy chủ trả nội dung khi có token hợp lệ.
- Quản trị đăng nhập một lần để nhận token phiên; mật khẩu không còn lưu trong `sessionStorage`.
- Thành viên đăng ký bằng email/mật khẩu hoặc đăng nhập Google.
- Gemini tự chuyển lần lượt qua `GEMINI_API_KEY`, `GEMINI_API_KEY_2` và `GEMINI_API_KEY_3` khi khóa trước gặp lỗi xác thực, hết hạn mức hoặc dịch vụ tạm thời không sẵn sàng.

## Bảo mật

Không đưa `ADMIN_PASSWORD`, `GEMINI_API_KEY`, `TOKEN_SECRET` hoặc khóa bí mật nào lên GitHub. Các giá trị này phải đặt trong **Apps Script > Project Settings > Script Properties**.

Các khóa hoặc mật khẩu từng bị gửi trong tin nhắn/công khai phải được thu hồi và tạo mới trước khi triển khai.
