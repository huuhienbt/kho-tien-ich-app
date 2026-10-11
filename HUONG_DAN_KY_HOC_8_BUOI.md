# E-GV v9.4 — Điểm danh và học phí theo kỳ 8 buổi

Kỳ tháng 9 gồm 8 buổi đã xác nhận của từng nhóm, kể cả các ngày học diễn ra trong tháng 10. Buổi thứ 9 bắt đầu kỳ tháng 10; mỗi kỳ sau tiếp tục gồm 8 buổi. Buổi hủy không được tính vào 8 buổi. Buổi dự kiến, kể cả đã qua ngày, chưa làm tăng số buổi đã học hoặc học phí; lưu điểm danh mới xác nhận buổi đã học. Ngày học và ngày đóng tiền luôn giữ đúng ngày thực tế.

Học phí vẫn theo số buổi học sinh có mặt: 62.500 đồng/buổi. Đơn giá riêng bằng 0 vẫn miễn học phí. Các khoản đã đóng cho kỳ tháng 9 vẫn thuộc kỳ tháng 9. Không cần sửa hay nhập lại điểm danh và tiền đã đóng.

Chỉ quản trị được xem, nhập và sửa thông tin nhóm học. Tài khoản thường, Google và VIP đều không được đọc hay ghi dữ liệu nhóm học; quyền được kiểm tra lại ở Apps Script trong từng yêu cầu.

## Cập nhật Apps Script

1. Thay **toàn bộ nội dung tệp `NhomHoc.gs`** bằng bản 9.4 trong repository. Giữ nguyên `Code.gs` và các tệp khác.
2. Mở **Project Settings → Script Properties**, thêm hoặc kiểm tra `EGV_NH_DATA_ID`: giá trị là mã bảng **Data_App** lấy từ URL Google Sheets, phần nằm giữa `/d/` và `/edit`. Không đưa mã bảng dữ liệu học sinh vào repository công khai. Trong Google Sheets, đặt **Chia sẻ → Quyền truy cập chung → Hạn chế**; tài khoản triển khai Apps Script phải có quyền đọc và ghi bảng.
3. Chạy `setupNhomHoc()` một lần. Hàm chỉ bổ sung hai cột cấu hình cuối trang `NhomHoc` nếu còn thiếu; dữ liệu đang có được giữ nguyên.
4. Chọn **Deploy → Manage deployments → Edit → New version → Deploy**, giữ nguyên URL Web App.
5. Tải lại E-GV và mở **Nhóm học**. Khi mở nhóm, ứng dụng chọn kỳ hiện đang học, không tự chuyển kỳ theo tháng dương lịch.

Chỉ cập nhật mã trên GitHub chưa cập nhật được máy chủ Apps Script; cần thực hiện bước triển khai ở trên.

Giao diện kiểm tra khả năng của máy chủ. Nếu vẫn dùng bản Apps Script cũ, ứng dụng thông báo cần cập nhật thay vì cho lưu điểm danh bằng giao thức không tương thích.

## Sử dụng

1. Chọn thẻ nhóm. Mỗi thẻ hiển thị kỳ đang học và tiến độ trên 8 buổi. Dùng hai mũi tên hoặc ô tháng để xem một kỳ khác.
2. **Máy tính:** bảng điểm danh hiển thị 8 buổi, ngày thực tế và học phí của từng học sinh. Bấm ô để đổi Chưa điểm danh → Có mặt → Vắng. Bấm tiêu đề ngày để chuyển sang xem riêng một buổi.
3. **Điện thoại:** chọn buổi trong danh sách, bấm Có mặt/Vắng cho từng học sinh hoặc dùng Có mặt cả lớp. Nút Ghi chú lưu lời nhắc cho đúng học sinh và đúng buổi.
4. Bấm **Lưu điểm danh** để lưu tất cả buổi đã sửa trong một yêu cầu. Học phí trong lúc sửa là bản xem trước; chưa lưu thì dữ liệu máy chủ chưa thay đổi. Khi chuyển nhóm/kỳ, ứng dụng nhắc nếu còn điểm danh chưa lưu.
5. Mở **Học phí** để lọc Chưa đóng, Đóng một phần, Đã đóng, Đóng dư hoặc Miễn học phí. Không phát sinh học phí chưa được ghi là Đã đóng. Tiền đóng dư giữ riêng, không tự chuyển sang kỳ khác.
6. Bấm tên học sinh để xem ngày có mặt/vắng, ghi chú từng buổi, số tiền còn thiếu và lịch sử đóng tiền. Mỗi lần thu có ngày đóng thực tế, số tiền, phương thức và ghi chú riêng. Hủy khoản thu giữ lại dòng lịch sử với trạng thái Đã hủy.
7. Bấm **Xếp lịch còn lại** để xem trước các ngày theo thứ học của nhóm. Lịch có thể kéo sang tháng sau; có thể đổi ngày học bù trước khi lưu. Chỉ lưu buổi Dự kiến, không tự điểm danh học sinh.
8. Khi đủ 8 buổi và điểm danh đầy đủ, chốt kỳ. Mở lại kỳ trước khi sửa buổi, điểm danh hoặc học phí đã chốt. Có thể xuất CSV điểm danh và lịch sử thu của kỳ đang xem.

Ví dụ: học sinh có mặt 6 trong 8 buổi phải đóng **375.000đ**. Nếu đã đóng hai lần 200.000đ và 175.000đ, tổng đã đóng là 375.000đ và không còn thiếu. Học sinh có đơn giá riêng 0 vẫn là Miễn học phí dù có mặt đủ 8 buổi.

## Cấu hình kỳ

Trong **Cài đặt nhóm**, chọn **Đủ 8 buổi mới sang kỳ sau**, đặt **Kỳ bắt đầu: 09/2026**. Hai cột cuối của trang `NhomHoc` tương ứng là:

| Cột | Giá trị |
| --- | --- |
| `so_buoi_moi_ky` | `8` |
| `ky_bat_dau` | `2026-09` |

Nhóm cũ chưa đặt hai cột này vẫn chia theo tháng dương lịch. Không đổi cách chia kỳ khi còn kỳ đã chốt: cần mở lại các kỳ liên quan trước để tránh thay đổi hóa đơn cũ.

Chỉ chốt học phí khi đủ 8 buổi đã xác nhận và đã điểm danh toàn bộ học sinh thuộc mỗi buổi; không còn buổi dự kiến chưa xử lý trong kỳ. Điểm danh để trống vẫn là chưa điểm danh, không tự biến thành vắng. Nếu thêm buổi ngược ngày hoặc hủy buổi làm dịch các buổi sang/ra khỏi kỳ đã chốt, ứng dụng yêu cầu mở lại kỳ liên quan trước.

Trạng thái trong trang `BuoiHoc`: `du_kien` (chưa xác nhận), `da_hoc` (đã học), `da_huy` (đã hủy). Chọn bất kỳ trạng thái Có mặt/Vắng rồi lưu điểm danh sẽ xác nhận buổi dự kiến đã đến ngày; buổi trong tương lai không cho điểm danh.

## Kiểm thử

```sh
node tests/nhom-hoc-cycle.test.cjs
node tests/nhom-hoc-ledger.test.cjs
```

Hai kiểm thử backend dùng dữ liệu giả lập, kiểm tra kỳ vắt tháng, ranh giới buổi 8/9, buổi dự kiến/quá ngày/hủy, đơn giá 0, học sinh vào giữa kỳ, tiền đóng nhiều lần, lưu điểm danh nhiều buổi, dữ liệu thay đổi đồng thời và bảo vệ kỳ đã chốt.

Kiểm thử giao diện dùng DOM giả lập bằng `jsdom` 26.1.0, không kết nối dữ liệu thật. Có thể cài phụ thuộc vào một thư mục tạm rồi chạy:

```sh
npm install --prefix /tmp/egv-dom-qa --no-save jsdom@26.1.0
EGV_QA_DEPENDENCIES=/tmp/egv-dom-qa node tests/nhom-hoc-ui.test.cjs
```

Kiểm thử DOM kiểm tra quyền truy cập, bảng 8 buổi, lưu một lần cho nhiều buổi, ghi chú, chi tiết học sinh, thu tiền, bộ lọc, lịch dự kiến và xóa dữ liệu khi đăng xuất. Kiểm thử này không thay thế việc xem bố cục trực tiếp trên máy tính và điện thoại.
