# E-GV v8.3 – Nội dung gọn và lời chào theo tài khoản

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

- Trang chủ hiển thị đúng tên thành viên đang đăng nhập; chỉ phiên quản trị viên mới được chào là `thầy Hiển`, còn khi chưa đăng nhập chỉ hiển thị lời chào theo buổi.
- Đổi tên trang và mục điều hướng `Âm lịch` thành `Lịch Việt`, đồng thời lược bỏ các câu hướng dẫn dài theo yêu cầu.
- Rút gọn mô tả Trợ giảng AI, ô chờ kết quả và thông báo khóa chi tiết Nhật ký sửa chữa.
- Thêm hai trường `Số tiết` và `Thời lượng mỗi tiết (phút)` trong phần Thông tin bài học của Trợ giảng AI; mặc định 1 tiết, 35 phút.
- Gửi chính xác hai giá trị đến Gemini, tính tổng thời lượng và yêu cầu AI phân bổ số phút hợp lý cho từng hoạt động; bài nhiều tiết được chia rõ theo từng tiết.
- Chuẩn hóa lại phần đầu kết quả để số tiết và thời lượng luôn khớp với dữ liệu giáo viên đã chọn, kể cả khi Gemini tự trả về giá trị khác.
- Người chưa đăng nhập chỉ nhận và xem tên công việc cùng trạng thái sửa chữa; máy chủ không trả về các trường chi tiết.
- Sau khi đăng nhập thành viên hoặc quản trị viên, website gọi API có xác thực để tải ngày ghi nhận, lớp/phòng, chi phí, đơn vị sửa/mua, bảo hành, thời hạn bảo hành, người báo, ảnh và ghi chú.
- Tổng chi phí được khóa khi chưa đăng nhập; bộ nhớ tạm cũ chứa dữ liệu đầy đủ được tự xóa và dữ liệu riêng tư không còn lưu lâu dài trên trình duyệt.
- Thiết kế lại cửa sổ `Sử dụng Prompt`: nền tảng đã lưu cho Prompt được ưu tiên ở phía trên, các nền tảng còn lại nằm trong nút `Nền tảng khác`.
- Cho phép mở rộng danh sách và sử dụng Prompt với toàn bộ nền tảng đã hỗ trợ; danh sách phụ hiển thị hai cột trên máy tính và một cột trên điện thoại.
- Luôn mở cửa sổ chọn nền tảng khi bấm `Sử dụng`, kể cả khi Prompt chỉ được gán cho một nền tảng.
- Bổ sung NotebookLM, Grok, Microsoft Copilot, DeepSeek, Canva, Perplexity và Gamma vào trường `Nền tảng` của Kho Prompt.
- Sắp xếp danh sách thành hai nhóm `Trợ lý AI` và `Học tập và sáng tạo` để dễ chọn.
- Nút `Sử dụng` nhận đúng từng nền tảng mới, tự sao chép Prompt rồi mở trang tương ứng.
- Thu gọn 19 nội dung tích hợp thành 6 nhóm mở/đóng: Văn hóa–địa phương, Công nghệ–STEM, Đạo đức–kỹ năng, Môi trường–khí hậu, An toàn–sức khỏe và Quốc phòng–an ninh.
- Chỉ mở một nhóm tại một thời điểm; mỗi nhóm hiển thị số lựa chọn đã đánh dấu và các nội dung đang chọn được tổng hợp thành thẻ nhỏ có thể bấm để bỏ chọn.
- Giữ nguyên đủ 19 giá trị chi tiết gửi đến Gemini, không gộp thành nhãn chung nên chất lượng tích hợp trong kế hoạch bài dạy không bị giảm.
- Thiết kế lại tờ lịch thành hai nửa cân đối: Dương lịch bên trái và Âm lịch bên phải, mỗi bên có số ngày lớn.
- Phần Dương lịch hiển thị thứ, tháng và năm; phần Âm lịch hiển thị ngày âm, tháng âm, năm Can Chi cùng Can Chi ngày và tháng.
- Giữ bố cục hai cột trên điện thoại, có đường phân cách rõ ràng và tự giảm cỡ chữ để không mất nội dung.
- Giữ nguyên màu thứ trong tuần, màu Can–Chi–Hành, Hành–Sao–Trực, nút ngày trước/sau, Chọn ngày và Về hôm nay.
- Mở rộng mục `Nội dung cần tích hợp` của Trợ giảng AI thành 19 lựa chọn phù hợp với học sinh tiểu học.
- Cho phép chọn nhiều nội dung, hiển thị số lượng đã chọn và vẫn giữ ô nhập nội dung khác.
- Gộp hai mục AI trùng nhau thành `Trí tuệ nhân tạo và sử dụng AI an toàn, có trách nhiệm`.
- Bổ sung quy tắc để Gemini chỉ lồng ghép nội dung đã chọn vào yêu cầu cần đạt hoặc hoạt động cụ thể, ưu tiên 1–2 nội dung liên quan trực tiếp và tránh tích hợp hình thức.
- Đổi tỷ trọng tính điểm thành ngày 80%, tháng 15% và năm 5% để điểm phản ánh gần hơn chất lượng riêng của ngày đang chọn.
- Đồng bộ công thức mới giữa giao diện, biểu đồ tháng, phần luận giải dự phòng và Apps Script; đổi phiên bản bộ nhớ tạm để không dùng lại kết quả của tỷ trọng cũ.
- Điểm tổng được tính trực tiếp từ ba điểm thành phần đang hiển thị, nên người xem có thể kiểm tra lại đúng công thức `Ngày × 80% + Tháng × 15% + Năm × 5%`.
- Thay biểu đồ tuần bằng biểu đồ cột toàn bộ 28–31 ngày của tháng đang xem, tính tự động theo năm sinh và cùng công thức với phần chi tiết.
- Mỗi cột hiển thị điểm, ngày và thứ; màu cột phân biệt năm mức từ `Cần thận trọng` đến `Thuận`.
- Ngày thường dùng màu chữ thông thường, Thứ Bảy màu xanh dương và Chủ nhật màu đỏ như tờ lịch chính.
- Bấm hoặc chạm vào cột để chuyển tờ lịch và toàn bộ luận giải sang ngày tương ứng; có nút xem tháng trước, tháng này và tháng sau.
- Tự chỉ ra ngày thuận nhất và ngày cần lưu ý nhất trong tháng; trên điện thoại biểu đồ cuộn ngang và tự đưa ngày đang chọn vào vùng dễ xem.
- Biểu đồ không gọi Gemini nên hiển thị ngay.
- Chuyển chín huy hiệu quan hệ của Ngày, Tháng và Năm thành nút có thể bấm hoặc chạm để xem giải thích cụ thể.
- Mỗi giải thích gồm ba phần: `Đối chiếu` nêu đúng nạp âm/Can/Chi của hai bên, `Cơ chế` chỉ rõ sinh – khắc – hợp – xung – hình – hại – phá, và `Ảnh hưởng` diễn giải tác động thực tế thận trọng.
- Bổ sung giải thích riêng khi Kiếm Phong Kim gặp hành Hỏa: vẫn là Hỏa khắc Kim ở tầng ngũ hành nhưng có thể mang tính tôi luyện, không được kết luận hoàn toàn bất lợi.
- Khung giải thích dùng được bằng chuột, bàn phím và cảm ứng; tự đóng khi đổi ngày hoặc đổi năm sinh.
- Thêm ký hiệu `●` trước nạp âm Dương và `○` trước nạp âm Âm; ký hiệu mang cùng màu ngũ hành với tên nạp âm.
- Thêm một chú thích gọn phía trên ba thẻ: `● Sắc đậm: Dương · ○ Sắc nhạt: Âm`, không lặp chữ Âm/Dương sau từng tên.
- Khi rê chuột hoặc dùng công cụ hỗ trợ, nạp âm cho biết rõ thuộc Dương hay Âm mà không làm giao diện dài thêm.
- Tự xác định âm – dương của nạp âm từ Thiên can: Giáp, Bính, Mậu, Canh, Nhâm là Dương; Ất, Đinh, Kỷ, Tân, Quý là Âm.
- Nạp âm Dương dùng sắc độ đậm, nạp âm Âm dùng sắc độ nhạt cho cả năm hành Mộc, Hỏa, Thổ, Kim và Thủy; giao diện không thêm chữ `(Dương)` hoặc `(Âm)`.
- Áp dụng màu nạp âm cho cả mệnh tuổi đang chọn và ba thẻ Ngày, Tháng, Năm; màu huy hiệu quan hệ vẫn độc lập để không nhầm ngũ hành với tốt – xấu.
- Bổ sung cột dữ liệu vào từng thẻ Ngày, Tháng và Năm: nạp âm ở dòng Ngũ hành, tên Can ở dòng Thiên can và tên Chi ở dòng Địa chi.
- Dữ liệu tự thay đổi theo ngày được chọn; nạp âm, Can và Chi được tô màu đúng ngũ hành trước khi hiển thị quan hệ với tuổi.
- Chuyển mỗi dòng thành ba cột rõ ràng theo thứ tự `Yếu tố – Dữ liệu – Quan hệ`.
- Bỏ toàn bộ thẻ `Tra cứu nhanh` để tờ lịch chiếm trọn chiều ngang nội dung.
- Tăng cỡ chữ số ngày, thứ, tháng, âm lịch, Can Chi, Hành, Sao và Trực; cân lại khoảng cách và đường phân cách để tờ lịch rõ, đều hơn.
- Tăng kích thước ba nút điều hướng lịch và tối ưu riêng cho điện thoại, cho phép dòng Hành – Sao – Trực tự xuống khi thiếu chỗ.
- Sửa lỗi phần Địa chi bị cắt giữa chữ do giới hạn ký tự; tăng dung lượng cho cả 7 phần và chỉ rút gọn ở cuối câu hoàn chỉnh khi thật sự cần.
- Bỏ thông báo kỹ thuật `Gemini bỏ sót một phần nội dung` khi E-GV đã tự bổ sung thành công.
- Bỏ đoạn `Cách hiểu điểm` ở cuối khung luận giải vì lặp lại thông tin và không hỗ trợ quyết định.
- Sửa lỗi toàn bộ 7 ô chỉ hiện câu dự phòng chung chung khi giao diện mới kết nối với Web App Apps Script cũ.
- Thêm kiểm tra phiên bản luận giải giữa giao diện và máy chủ; nếu chưa đồng bộ, website báo rõ và tự tạo nội dung cụ thể từ đúng Can Chi, quan hệ và điểm số đang xem.
- Buộc Gemini giải thích tác động thực tế của từng quan hệ, chỉ rõ yếu tố kéo điểm lên hoặc xuống và đưa ba nhóm lời khuyên: `Có thể làm`, `Cần thận trọng`, `Nếu vẫn tiến hành`.
- Mở rộng phần Gemini âm lịch thành 7 mục: Tổng quan, Ngũ hành, Thiên can, Địa chi, Bối cảnh ngày–tháng–năm, Điểm cần lưu ý và Gợi ý thực hiện.
- Yêu cầu Gemini phân tích độc lập từng yếu tố theo đúng dữ kiện E-GV, không tự đổi điểm, thêm quan hệ Can Chi hoặc suy diễn Tam hợp, Tứ hành xung và quý nhân khi dữ liệu không có.
- Bắt buộc giải thích vì sao điểm tổng đạt mức hiện tại theo trọng số ngày 80%, tháng 15% và năm 5%; mọi trường thiếu hoặc quá ngắn đều được thay bằng luận giải dự phòng đầy đủ.
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
- Tự đánh giá Ngũ hành, Thiên can và Địa chi theo ba tầng: ngày 80%, tháng 15% và năm 5%.
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
