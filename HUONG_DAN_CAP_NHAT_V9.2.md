# E-GV v9.2 — KHBD mẫu Vĩnh Long

Bản bổ sung dựa trên E-GV v9.1. Mẫu Vĩnh Long áp dụng đúng bốn nhóm và màu chữ trong mục I theo quy cách thầy cung cấp.

## Cập nhật website và Apps Script

1. Thay ba tệp giao diện cùng vị trí trên GitHub: `ai.html`, `js/ai.js`, `modern-saas.css`.
2. Trong dự án Google Apps Script đang dùng, thay nội dung `Code.gs` bằng tệp trong gói này.
3. Chọn **Deploy → Manage deployments → Edit → New version → Deploy**, giữ nguyên URL triển khai.
4. Tải lại Trợ giảng AI. Nếu còn bản cũ trong bộ nhớ đệm, tải lại trang hoặc mở lại ứng dụng.

Không phải đổi cấu trúc Sheets hay Script Properties. Cần cập nhật cả frontend và backend. Nếu máy chủ còn bản cũ, giao diện sẽ thông báo cần cập nhật khi chọn mẫu Vĩnh Long.

## Sử dụng

1. Nhập môn, lớp, tên bài, số tiết và số phút mỗi tiết.
2. Tích **KHBD mẫu Vĩnh Long** trong phần Thông tin bài học.
3. Chọn nội dung tích hợp phù hợp. Nếu có mã đã xác định, nhập kèm tên và mã vào ô **Nội dung khác / mã tích hợp**. Prompt không cho phép tự bịa mã.
4. Thêm ảnh SGK rồi bấm **Tạo kế hoạch bài dạy**.
5. Xem hoặc chỉnh sửa kết quả, sau đó chọn **Xuất Word (.docx)** hoặc **Lưu Word lên Drive**.

Bỏ tích mẫu Vĩnh Long để tạo theo mẫu mặc định của v9.1. Thay ô chọn sau khi đã tạo không tự chuyển đổi bản đang hiển thị; cần tạo lại để đổi cấu trúc mục I.

## Quy cách mục I

Trong mỗi tiết, có đủ bốn nhóm theo thứ tự:

1. Qua bài học, học sinh thực hiện được:
2. Học sinh vận dụng bài học trong thực tế cuộc sống:
3. Giúp các em hình thành và phát triển phẩm chất:
4. Giúp các em hình thành và phát triển năng lực:

Bốn câu dẫn đỏ (#FF0000), in đậm. Các yêu cầu bên dưới dùng dấu gạch ngang, chữ đen thường. Mỗi nội dung tích hợp đặt ở một dòng riêng cuối mục I; toàn bộ nhãn gồm dấu *, tên, mã nếu có và dấu hai chấm là xanh dương (#0000FF), in đậm. Phần giải thích chữ đen thường, có một khoảng trắng sau nhãn. Tiết không có tích hợp không thêm dòng tích hợp.

Bộ xuất Word giữ phông Times New Roman, khổ A4 và bảng GV–HS tỷ lệ 60:40 của v9.1. Chế độ mới thêm định dạng màu cho mục I. Cấu trúc II, III, IV tiếp tục theo mẫu hiện có; nội dung từng bài do Gemini soạn từ dữ liệu và ảnh nhận được.

## Prompt

`PROMPT_KHBD_VINH_LONG.txt` chứa toàn bộ prompt mới với các ô [MÔN HỌC], [LỚP], [SỐ TIẾT]… để đọc hoặc thay thông tin. Trong E-GV, hệ thống điền các thông tin này tự động; ảnh được gửi kèm yêu cầu Gemini. Bản TXT mô tả màu chữ, còn màu thực tế được E-GV xử lý khi hiển thị và xuất Word.

Đây là tính năng tạo mới KHBD từ ảnh SGK. Yêu cầu trong prompt tham khảo về việc sửa riêng mục I của một file Word đã có được chuyển thành quy tắc tạo mục I theo mẫu, không phải chức năng nhập và sửa file Word có sẵn.

## Kiểm tra

- Prompt chế độ mặc định khớp nguyên nội dung v9.1.
- Kiểm tra nhánh prompt Vĩnh Long, ảnh đi kèm, số tiết, thời lượng, phản hồi 1/2 tiết và phát hiện thiếu nhóm mục I bằng dữ liệu mô phỏng.
- Kiểm tra DOM và bộ xuất DOCX; đối chiếu các phần II–IV khi áp dụng định dạng mới.
- Render file Word thử nghiệm để kiểm tra màu, khoảng trắng, xuống dòng và bảng.
- Chưa gọi Gemini thật hoặc triển khai lên website/Apps Script của thầy. Trình duyệt kiểm thử từ xa không truy cập localhost nên chưa kiểm tra tương tác trên thiết bị thực tế.
