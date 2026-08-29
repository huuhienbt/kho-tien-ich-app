# E-GV v6.4 – Luận giải Gemini âm lịch có tác dụng thực tế

Website tĩnh triển khai trên `https://e-gv.vercel.app`, kết nối Google Apps Script để quản lý Prompt, nhật ký sửa chữa, tải tệp Drive và soạn kế hoạch bài dạy bằng Gemini.

## Cấu trúc mã nguồn

- `index.html`, `prompts.html`, `upload.html`, `ai.html`, `calendar.html`, `repairs.html`: các trang giao diện.
- `style.css`: giao diện nền và các thành phần chức năng.
- `modern-saas.css`: lớp giao diện Modern SaaS mới, màu xanh dương chủ đạo và responsive cho điện thoại.
- `js/config.js`: URL Apps Script, Google Client ID và cấu hình chung.
- `js/app.js`: xác thực quản trị/thành viên, Google Sign-In và API.
- `js/*.js`: logic từng trang.
- `Code.gs`: mã máy chủ Google Apps Script hoàn chỉnh.
- `appsscript.json`: manifest quyền Sheets, Drive và gọi API ngoài.
- `HUONG_DAN_CAI_DAT.md`: trình tự cài đặt chi tiết.

## Chức năng phiên bản này

- Sửa lỗi toàn bộ 7 ô chỉ hiện câu dự phòng chung chung khi giao diện mới kết nối với Web App Apps Script cũ.
- Thêm kiểm tra phiên bản luận giải giữa giao diện và máy chủ; nếu chưa đồng bộ, website báo rõ và tự tạo nội dung cụ thể từ đúng Can Chi, quan hệ và điểm số đang xem.
- Buộc Gemini giải thích tác động thực tế của từng quan hệ, chỉ rõ yếu tố kéo điểm lên hoặc xuống và đưa ba nhóm lời khuyên: `Có thể làm`, `Cần thận trọng`, `Nếu vẫn tiến hành`.
- Mở rộng phần Gemini âm lịch thành 7 mục: Tổng quan, Ngũ hành, Thiên can, Địa chi, Bối cảnh ngày–tháng–năm, Điểm cần lưu ý và Gợi ý thực hiện.
- Yêu cầu Gemini phân tích độc lập từng yếu tố theo đúng dữ kiện E-GV, không tự đổi điểm, thêm quan hệ Can Chi hoặc suy diễn Tam hợp, Tứ hành xung và quý nhân khi dữ liệu không có.
- Bắt buộc giải thích vì sao điểm tổng đạt mức hiện tại theo trọng số ngày 50%, tháng 30% và năm 20%; mọi trường thiếu hoặc quá ngắn đều được thay bằng luận giải dự phòng đầy đủ.
- Đồng bộ một phiên bản công thức cho phần điểm phía trên và phần Gemini; máy chủ trả lại điểm tổng cùng điểm ngày, tháng, năm để giao diện đối chiếu ngay sau khi phân tích.
- Thêm mã phiên bản vào CSS/JavaScript của trang lịch để trình duyệt không tiếp tục dùng `calendar.js` cũ sau khi triển khai.
- Tự thay nội dung Gemini quá ngắn hoặc chỉ có dấu `–` bằng phần luận giải dự phòng đầy đủ.
- Đổi vùng nhớ tạm của luận lịch để loại bỏ kết quả cũ chưa đồng bộ.
- Thêm trang `Âm lịch` riêng và đặt đúng giữa `Trợ giảng AI` với `Nhật ký sửa chữa` trên thanh điều hướng.
- Chuyển toàn bộ tờ lịch, nút ngày trước/ngày sau, chọn ngày, xem tuổi và Gemini khỏi Trang chủ sang trang Âm lịch.
- Trang chủ chỉ giữ thẻ mở nhanh `Âm lịch & xem ngày theo tuổi` và thêm thẻ Âm lịch trong Không gian làm việc.
- Tách `js/calendar.js` để toàn bộ phép tính lịch chỉ chạy trên trang Âm lịch; `js/index.js` chỉ xử lý Trang chủ.
- Trình bày 7 phần luận giải bằng các thẻ màu riêng, tự chuyển từ ba cột trên máy tính sang hai cột trên máy tính bảng và một cột trên điện thoại.
- Sửa lỗi chuỗi JSON như `{"overview":...}` lọt ra giao diện khi phản hồi Gemini bị cắt hoặc thiếu dấu đóng.
- Bộ đọc dự phòng nhận JSON hoàn chỉnh, JSON trong khối mã, tên trường tiếng Việt, JSON bị cắt và phản hồi thiếu trường.
- Mục `Xem ngày theo tuổi` chỉ mở sau khi thành viên hoặc quản trị viên đăng nhập.
- Chọn một năm sinh dạng `1992 – Nhâm Thân`; không cần tạo hoặc thêm tuổi thủ công.
- Tự đánh giá Ngũ hành, Thiên can và Địa chi theo ba tầng: ngày 50%, tháng 30% và năm 20%.
- Đổi phần trăm thành điểm tương hợp trên thang 100, lấy 50 làm mốc cân bằng; đây không phải xác suất may mắn.
- Hiệu chỉnh thang điểm để Sinh xuất/Khắc xuất thể hiện sự hao công thay vì bị xem là quá xấu; các mức mới là Nên thận trọng, Cần cân nhắc, Cân bằng, Khá thuận, Thuận và Rất thuận.
- Thêm nút `Phân tích bằng Gemini`; website tính dữ kiện trước, Gemini chỉ tổng hợp và diễn giải.
- Endpoint Gemini được bảo vệ bằng token đăng nhập, giới hạn số lượt và lưu kết quả tạm để giảm thời gian chờ.
- API key chỉ nằm trong Script Properties và tự chuyển qua `GEMINI_API_KEY`, `_2`, `_3` khi cần.
- Kết quả tự cập nhật khi bấm ngày trước, ngày sau hoặc chọn ngày bất kỳ; năm sinh được ghi nhớ trên thiết bị.
- Hiển thị nạp âm theo vòng Lục thập hoa giáp, đồng thời nhắc chọn năm âm lịch tương ứng nếu sinh trước Tết.
- Tự đổi màu tên thứ: Thứ Hai–Thứ Sáu màu đen, Thứ Bảy màu xanh dương và Chủ nhật màu đỏ.
- Tự tô màu từng Thiên Can, Địa Chi và giá trị Hành theo ngũ hành: Mộc xanh lá, Hỏa đỏ, Thổ vàng đất, Kim xám bạc, Thủy xanh dương.
- Giữ Sao và Trực ở màu trung tính để thẻ lịch rõ ràng, không lạm dụng màu sắc.
- Gộp thông tin thành một dòng cố định: `Hành Hỏa · Sao Ngưu · Trực Mãn`.
- Nút `Chọn ngày` gọi trực tiếp lịch hệ thống bằng `showPicker()` và tự chuyển sang phương án dự phòng trên trình duyệt chưa hỗ trợ.
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
