# E-GV v9.3 — Quản lý nhóm học

Bản cập nhật bổ sung trang **Nhóm học** để quản lý danh sách học sinh, điểm danh theo buổi và theo dõi học phí theo tháng. Dữ liệu được lưu trong cùng Google Sheets **Data_App** đang dùng cho E-GV.

Nếu dùng mã trực tiếp từ repository `huuhienbt/kho-tien-ich-app`, các tệp website, `Code.gs` và `NhomHoc.gs` đã nằm ở thư mục gốc. Bước 1 dưới đây dành cho gói ZIP; thầy tiếp tục cập nhật Apps Script ở bước 2. Tệp `NhomHoc.gs` và `Code.gs` tại gốc repository tương ứng với các tệp trong thư mục `apps-script` của ZIP.

## 1. Cập nhật website trên GitHub

Giải nén ZIP. Đưa **nội dung thư mục `website`** vào thư mục gốc của repository `kho-tien-ich-app`, ngang hàng với `index.html` hiện có. Không đặt nguyên thư mục `website` vào repository.

Các tệp gồm:

- `groups.html`, `groups.css`, `js/groups.js`: chức năng nhóm học mới.
- `js/app.js`, `modern-saas.css`: bổ sung điều hướng và giao diện.
- `index.html`, `prompts.html`, `upload.html`, `ai.html`, `calendar.html`, `repairs.html`: cập nhật liên kết phiên bản giao diện; trang chủ có thêm thẻ Nhóm học.
- `js/ai.js`: kèm bản v9.2.1 đã sửa bảng KHBD để đồng bộ với `ai.html`.

Gói cập nhật không có `js/config.js`; tiếp tục dùng URL Apps Script và Google Client ID của website hiện tại. `style.css` và các tệp chức năng khác tiếp tục dùng bản đang có. Mã nguồn dựa trên E-GV v9.2 và bản sửa bảng KHBD v9.2.1; nếu thầy đã sửa thêm các tệp này sau đó, đối chiếu trước khi thay.

Sau khi commit, Vercel sẽ triển khai lại nếu repository vẫn được liên kết với dự án Vercel.

## 2. Cập nhật Google Apps Script

Mở dự án Apps Script đang phục vụ E-GV, thực hiện:

1. Bấm **+ → Script**, tạo tệp tên `NhomHoc` và dán toàn bộ nội dung `apps-script/NhomHoc.gs`.
2. Trong tệp `Code.gs` hiện có, tìm hàm `doPost(e)`. Sau dòng xử lý `google_login` và trước các hành động khác, thêm:

```javascript
// E-GV v9.3: API nhóm học.
if (action.indexOf('nh_') === 0) return handleNhomHoc(payload);
```

Ví dụ vị trí:

```javascript
if (action === 'google_login') return handleGoogleLogin(data, payload.clientId);

if (action.indexOf('nh_') === 0) return handleNhomHoc(payload);

if (action === 'age_reading') {
  // Phần xử lý có sẵn của E-GV.
}
```

Chỉ thêm dòng chuyển tiếp một lần. Giữ các biến `payload`, `action` và hàm xử lý khác đang có. Tệp `apps-script/Code.gs` trong ZIP là bản đầy đủ đã thêm dòng này, dành cho trường hợp dự án vẫn ở đúng bản v9.2.1; thêm dòng chuyển tiếp vào bản hiện tại sẽ giữ được những thay đổi thầy đã làm thêm.

3. Lưu dự án. Chọn hàm **`setupNhomHoc`** ở thanh trên, bấm **Run**. Chấp nhận quyền truy cập Sheets nếu Google hỏi.
4. Hàm khởi tạo kiểm tra các bảng đang có và tạo bảng còn thiếu. Nếu thấy lỗi cấu trúc tiêu đề, dừng để kiểm tra hàng đầu của bảng được nêu trong lỗi; không xóa dữ liệu để chạy lại.
5. Chọn **Deploy → Manage deployments → Edit → New version → Deploy**. Giữ nguyên URL Web App, chế độ thực thi và quyền truy cập đang dùng.
6. Tải lại website, đăng nhập quản trị và mở **Nhóm học**. Trên điện thoại, mục này nằm trong nút **Thêm** ở thanh dưới.

## 3. Dữ liệu lưu ở đâu?

Mã được cấu hình sẵn dùng spreadsheet:

`1KPw-UYew83KygpFNe4vMd4VeO1xmkKbHBTLIr61l-L8`

Trong file này có bảy bảng phục vụ nhóm học:

| Bảng | Nội dung |
|---|---|
| NhomHoc | Nhóm, lịch học, giáo viên, cách tính và đơn giá |
| HocSinh | Hồ sơ học sinh |
| ThanhVienNhom | Học sinh thuộc nhóm nào, ngày tham gia/nghỉ, đơn giá riêng |
| BuoiHoc | Các buổi học theo ngày |
| DiemDanh | Có mặt, vắng, chưa điểm danh và ghi chú |
| ThuHocPhi | Các lần thu tiền, kỳ thu, phương thức, trạng thái |
| HocPhiKy | Số tiền phải thu đã chốt để giữ lịch sử |

Sáu bảng đầu đã được thiết lập trong Data_App. Lần tạo `HocPhiKy` qua kết nối chưa có kết quả xác nhận; chạy `setupNhomHoc` sẽ bổ sung nếu còn thiếu và giữ bảng đã tồn tại. Hàm này không xóa hay thay dữ liệu Prompts, Repairs, Users và PromptFavorites.

Không cần công khai spreadsheet, tạo API key mới hay thay Script Properties hiện tại. Tài khoản chạy Apps Script phải có quyền chỉnh sửa Data_App. Nếu sau này chuyển sang file khác, đặt Script Property `EGV_NH_DATA_ID` bằng ID file mới rồi chạy lại hàm khởi tạo.

## 4. Phân quyền

| Tài khoản | Quyền sử dụng |
|---|---|
| Chưa đăng nhập | Chỉ thấy yêu cầu đăng nhập, không nhận dữ liệu nhóm học |
| Thành viên thường, VIP hoặc Google | Quản lý các nhóm được quản trị giao cho đúng tài khoản |
| Quản trị | Xem toàn bộ nhóm, tạo nhóm và giao giáo viên |

Giáo viên được giao nhóm có thể cập nhật cài đặt nhóm, học sinh, điểm danh, thu tiền và chốt/mở lại kỳ của nhóm đó. Chỉ quản trị được tạo nhóm và đổi giáo viên phụ trách. VIP không tự động có quyền xem nhóm của người khác. Quyền được kiểm tra ở Apps Script trên mỗi yêu cầu.

## 5. Tạo nhóm và thêm học sinh

1. Quản trị bấm **Tạo nhóm**.
2. Điền tên, năm học, thứ học (ví dụ `2,4`), giờ bắt đầu/kết thúc, cách tính học phí và đơn giá bằng **đồng**.
3. Chọn giáo viên phụ trách. Tài khoản giáo viên phải đăng ký hoặc đăng nhập Google trên E-GV trước để xuất hiện trong danh sách. Có thể chọn Quản trị nếu thầy trực tiếp quản lý.
4. Vào thẻ **Học sinh**, bấm thêm học sinh. Sao chép cột họ tên từ Excel, dán mỗi tên một dòng; nhập lớp và ngày tham gia. Mỗi lần tối đa 100 học sinh.
5. Có thể chọn học sinh đã có trong những nhóm tài khoản được quyền truy cập. Hồ sơ dùng chung giữa các nhóm; nếu cần sửa tên/lớp ảnh hưởng đến nhóm ngoài quyền của giáo viên, quản trị thực hiện.

Chức năng này nhận danh sách tên được dán, chưa tự nhập toàn bộ file Excel. Lịch sử điểm danh và số tiền trong file cũ chưa được chuyển vào do năm/ngày và đơn vị tiền chưa được xác nhận.

## 6. Điểm danh

Chọn nhóm và tháng, bấm **Thêm buổi học**, nhập ngày và giờ. Mỗi nhóm có một buổi trong một ngày. Thứ học trong cài đặt chỉ dùng làm thông tin lịch, chưa tự tạo các buổi.

Chọn buổi, đánh dấu **Có mặt**, **Vắng** hoặc **Chưa điểm danh**, thêm ghi chú nếu cần, rồi bấm **Lưu điểm danh**. Nút **Tất cả có mặt** vẫn cần bấm Lưu để ghi dữ liệu. Ngày tham gia/nghỉ quyết định học sinh thuộc buổi nào.

Buổi tương lai có thể tạo trước nhưng chưa được điểm danh. Buổi bị hủy không tính học phí theo buổi. Nếu người khác vừa sửa dữ liệu, hệ thống yêu cầu tải lại trước khi ghi đè. Có nhắc khi chuyển nhóm/ngày hoặc rời trang mà còn thay đổi chưa lưu.

## 7. Học phí và chốt tháng

- **Theo buổi có mặt:** số buổi được đánh dấu Có mặt × đơn giá. Vắng, chưa điểm danh và buổi hủy không tính tiền theo buổi.
- **Theo tháng:** tính trọn đơn giá tháng cho học sinh có thời gian tham gia giao với tháng đang xem, kể cả chưa có buổi học. Không tự chia theo số ngày; điều chỉnh đơn giá riêng nếu học sinh học nửa tháng hoặc được giảm phí.
- **Đơn giá riêng:** để trống để theo giá nhóm; nhập `0` để miễn học phí. Nhập tiền bằng đồng, ví dụ `500000` là 500.000 đồng, không nhập `500` nếu muốn chỉ 500.000 đồng.
- **Ghi nhận tiền:** một học sinh có thể đóng nhiều lần cho cùng kỳ. Số còn thiếu = phải thu − tổng tiền đã thu còn hiệu lực. Đóng dư hiển thị riêng; chưa tự chuyển tiền dư sang tháng sau.
- **Hủy khoản thu:** phải ghi lý do; khoản cũ được giữ lại trong lịch sử và không cộng vào tổng đã thu.
- **Chốt tháng:** thực hiện sau khi đã tạo đủ buổi và điểm danh đủ. Số tiền phải thu được lưu trong HocPhiKy; thay đơn giá nhóm sau đó không làm đổi kỳ đã chốt. Kỳ đã chốt khóa sửa buổi và điểm danh.
- **Mở lại kỳ:** cho phép sửa, đồng thời tính lại tiền phải thu theo dữ liệu/đơn giá hiện tại. Những lần đóng tiền vẫn được giữ.

Thẻ **Học phí** hiển thị từng học sinh và lịch sử khoản thu. **Xuất CSV (Excel)** tải bảng điểm danh/học phí có dấu tiếng Việt, mở được bằng Excel; đây là tệp `.csv`.

## 8. Kiểm tra nhanh sau cài đặt

Dùng một nhóm thử riêng, ghi rõ tên **Nhóm thử**, với học sinh thử. Đơn giá theo buổi `10000`, tạo một buổi đã qua, đánh dấu Có mặt và Lưu: phải thu là 10.000 đồng. Ghi nhận thu 4.000 đồng: còn thiếu 6.000 đồng. Chốt tháng, đổi giá nhóm và kiểm tra kỳ đã chốt vẫn giữ tiền cũ. Nếu để Chưa điểm danh, hệ thống phải từ chối chốt.

Đăng nhập tài khoản giáo viên được giao nhóm để kiểm tra quyền. Đăng nhập tài khoản khác không được giao: không thấy dữ liệu nhóm thử. Đăng xuất: bảng học sinh và học phí phải biến mất.

Nếu lỗi chờ mạng, bấm **Tải lại** để kiểm tra dữ liệu đã lưu trước khi tạo khoản thu mới. Không cần chờ kết nối ChatGPT hoàn thành để làm phép thử nhỏ này trực tiếp trên E-GV.

## 9. Kết quả kiểm thử bản mã

Đã kiểm tra cú pháp JavaScript/Apps Script; kiểm thử backend với dữ liệu mô phỏng để kiểm tra phân quyền, chống ghi lặp, xung đột điểm danh, điều kiện chốt kỳ và tính học phí. Đã chạy giao diện thật trong trình duyệt cục bộ ở khổ máy tính và điện thoại 390 px, kiểm tra lưu điểm danh, thêm học sinh, thu tiền, tải CSV, điều hướng và xóa dữ liệu hiển thị khi đăng xuất. Bản kiểm thử không gửi yêu cầu vào API sản xuất.

Chưa triển khai mã lên GitHub/Vercel hay Apps Script của thầy; tốc độ và quyền truy cập thực tế trên Google vẫn cần phép thử ngắn sau khi cập nhật.
