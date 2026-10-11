# E-GV v9.3.1 — Kỳ học đủ 8 buổi

Kỳ tháng 9 gồm 8 buổi đã học của từng nhóm, kể cả các ngày học diễn ra trong tháng 10. Buổi thứ 9 bắt đầu kỳ tháng 10; mỗi kỳ sau tiếp tục gồm 8 buổi. Buổi hủy không được tính vào 8 buổi; lịch đặt trước chưa đến ngày chưa làm tăng số buổi đã học. Ngày học và ngày đóng tiền luôn giữ đúng ngày thực tế.

Học phí vẫn theo số buổi học sinh có mặt: 62.500 đồng/buổi. Đơn giá riêng bằng 0 vẫn miễn học phí. Các khoản đã đóng cho kỳ tháng 9 vẫn thuộc kỳ tháng 9. Không cần sửa hay nhập lại điểm danh và tiền đã đóng.

Chỉ quản trị được xem, nhập và sửa thông tin nhóm học. Tài khoản thường, Google và VIP đều không được đọc hay ghi dữ liệu nhóm học; quyền được kiểm tra lại ở Apps Script trong từng yêu cầu.

## Cập nhật Apps Script

1. Thay **toàn bộ nội dung tệp `NhomHoc.gs`** bằng bản 9.3.1 trong repository. Giữ nguyên `Code.gs` và các tệp khác.
2. Mở **Project Settings → Script Properties**, thêm hoặc kiểm tra `EGV_NH_DATA_ID`: giá trị là mã bảng **Data_App** lấy từ URL Google Sheets, phần nằm giữa `/d/` và `/edit`. Không đưa mã bảng dữ liệu học sinh vào repository công khai. Trong Google Sheets, đặt **Chia sẻ → Quyền truy cập chung → Hạn chế**; tài khoản triển khai Apps Script phải có quyền đọc và ghi bảng.
3. Chạy `setupNhomHoc()` một lần. Hàm chỉ bổ sung hai cột cấu hình cuối trang `NhomHoc` nếu còn thiếu; dữ liệu đang có được giữ nguyên.
4. Chọn **Deploy → Manage deployments → Edit → New version → Deploy**, giữ nguyên URL Web App.
5. Tải lại E-GV và mở **Nhóm học**. Khi mở nhóm, ứng dụng chọn kỳ hiện đang học, không tự chuyển kỳ theo tháng dương lịch.

Chỉ cập nhật mã trên GitHub chưa cập nhật được máy chủ Apps Script; cần thực hiện bước triển khai ở trên.

## Cấu hình kỳ

Trong **Cài đặt nhóm**, chọn **Đủ 8 buổi mới sang kỳ sau**, đặt **Kỳ bắt đầu: 09/2026**. Hai cột cuối của trang `NhomHoc` tương ứng là:

| Cột | Giá trị |
| --- | --- |
| `so_buoi_moi_ky` | `8` |
| `ky_bat_dau` | `2026-09` |

Nhóm cũ chưa đặt hai cột này vẫn chia theo tháng dương lịch. Không đổi cách chia kỳ khi còn kỳ đã chốt: cần mở lại các kỳ liên quan trước để tránh thay đổi hóa đơn cũ.

Chỉ chốt học phí khi đủ 8 buổi đã đến ngày và đã điểm danh toàn bộ học sinh thuộc mỗi buổi. Điểm danh để trống vẫn là chưa điểm danh, không tự biến thành vắng. Nếu thêm buổi ngược ngày hoặc hủy buổi làm dịch các buổi sang/ra khỏi kỳ đã chốt, ứng dụng yêu cầu mở lại kỳ liên quan trước.

## Kiểm thử

```sh
node tests/nhom-hoc-cycle.test.cjs
```

Kiểm thử kiểm tra kỳ vắt qua tháng dương lịch, ranh giới buổi 8/9, buổi tương lai/hủy, đơn giá 0, học sinh vào giữa kỳ, tiền đã đóng, chốt/mở kỳ và bảo vệ các kỳ đã chốt.
