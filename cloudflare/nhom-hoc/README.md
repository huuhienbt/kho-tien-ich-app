# Nhóm học E-GV: Workers + D1 + R2

Worker: `https://egv-nhom-hoc.huuhienbte.workers.dev`.
Database: `egv-nhom-hoc`, vùng APAC. Frontend tiếp tục ở Vercel.

Chỉ nhóm học chuyển sang Cloudflare. Đăng nhập, Prompt, Trợ giảng AI và các chức năng Drive hiện có tiếp tục dùng Apps Script. Sau khi chuyển, E-GV ghi nhóm học vào D1; bảng nhóm học trên Drive là bản lưu tại thời điểm chuyển, không tự đồng bộ hai chiều. Không nhập dữ liệu học sinh hoặc bản sao cơ sở dữ liệu vào kho GitHub công khai.

## Xác thực và dữ liệu

Apps Script xác thực chữ ký phiên quản trị qua `nh_auth` mà không đọc bảng tính. Worker lưu **hash** token cùng hạn dùng trong D1, tối đa đến hạn của phiên gốc. Các yêu cầu nhóm học sau đó dùng D1 trực tiếp. Lần xác thực đầu tiên của mỗi phiên vẫn có thể phải chờ Apps Script; màn hình đăng nhập hiện tại cũng vẫn dùng Apps Script.

Mọi API dữ liệu và tệp yêu cầu quản trị. CORS giới hạn nguồn E-GV. Tệp không có URL công khai; tải xuống cần xác thực và trả về `attachment`, `no-store`. Quy tắc kỳ 8 buổi, buổi dự kiến, học phí theo buổi có mặt, miễn thu, khoản đóng tiền và chốt/mở kỳ dùng chung với `NhomHoc.gs`. D1 ghi các thay đổi trong một transaction có kiểm tra phiên bản; phiên lưu sau phải tải lại khi có xung đột. Thử lại cùng mã khoản thu không tạo khoản thu trùng.

`scripts/build-engine.mjs` sinh bộ xử lý từ `NhomHoc.gs`. Sau khi sửa quy tắc, chạy `npm run engine`; CI kiểm tra bộ xử lý đã được sinh lại. Hàm `nhCloudflareActive_()` khóa các API nhóm học cũ sau khi chuyển, nhưng vẫn giữ `nh_auth`. Không chuyển hàm này về `false` sau khi D1 có dữ liệu mới nếu chưa thực hiện quy trình chuyển dữ liệu ngược.

## Giới hạn để ưu tiên miễn phí

Không có nâng cấp gói hoặc dịch vụ AI trả phí trong Worker này. Workers Free: 100.000 yêu cầu/ngày, CPU 10 ms/lần. D1 Free: 5 triệu hàng đọc/ngày, 100.000 hàng ghi/ngày, 5 GB tổng dung lượng. R2 Standard có mức miễn phí 10 GB/tháng, 1 triệu thao tác Class A và 10 triệu Class B/tháng; vượt mức R2 có thể phát sinh phí.

Ứng dụng giới hạn mỗi tệp 5 MB và toàn bộ kho tệp nhóm học 1 GB, tính cả tệp đang tải. Đây là giới hạn dung lượng của ứng dụng, không phải bảo đảm miễn phí cho mọi lưu lượng hoặc toàn bộ tài khoản. Xem mức sử dụng tại dashboard. Tài liệu giá kiểm tra ngày 11/10/2026:

- https://developers.cloudflare.com/workers/platform/pricing/
- https://developers.cloudflare.com/d1/platform/pricing/
- https://developers.cloudflare.com/r2/pricing/

## Kiểm tra và triển khai

```sh
cd cloudflare/nhom-hoc
npm ci
npm run types
npm run engine
npm run check
npm test
```

Kiểm tra chạy trên workerd/Miniflare với D1 và R2 cục bộ: quyền quản trị, token giả, transaction đồng thời, học phí, miễn thu, khoản thu lặp, tệp riêng tư, giới hạn dung lượng và lỗi truyền tệp. DOM test kiểm tra điều hướng API và giao diện; không thay thế kiểm tra bố cục trên trình duyệt thực.

Triển khai mặc định **không** gắn R2:

```sh
npx wrangler d1 migrations apply egv-nhom-hoc --remote --env=""
npm run deploy
```

## Bật R2

Tài khoản hiện cần kích hoạt R2 qua dashboard trước khi tạo bucket:
https://dash.cloudflare.com/1cbb6895e6fe935d9acc42e27809d088/r2/overview

Sau khi kích hoạt, tạo bucket `egv-nhom-hoc-files`, loại **Standard**, giữ riêng tư; không bật public access hoặc `r2.dev`. Bucket được dùng riêng cho tệp nhóm học, không chuyển các tệp Drive khác sang đây.

```sh
npx wrangler r2 bucket create egv-nhom-hoc-files --location apac
npm run deploy:r2
```

Env `r2` triển khai cùng Worker và cùng D1, bổ sung binding `FILES`. Khi binding xuất hiện, API `nh_boot` trả `features.files=true` và tab **Tệp** tự hiện. Giao diện vẫn ẩn tab này khi R2 chưa hoạt động.

## Cập nhật tự động từ GitHub

Workflow `.github/workflows/cloudflare-groups.yml` luôn kiểm tra mã. Để workflow tự triển khai Worker sau khi cập nhật main, thêm Repository Secret **CLOUDFLARE_API_TOKEN**, giới hạn tài khoản này và quyền sửa Workers Scripts, D1; thêm quyền R2 khi dùng tệp. Không dán token vào file mã, `.dev.vars` hoặc commit.

Khi R2 đã bật, thêm Repository Variable **EGV_R2_ENABLED=true** để workflow giữ binding R2. Khi chưa có secret, job báo chưa triển khai từ workflow; Worker đã được triển khai trực tiếp vẫn tiếp tục chạy. Workflow không nhập lại bản chụp Drive và không xóa dữ liệu D1. Nó kiểm tra main trước khi triển khai để tránh ghi đè mã mới bằng một lượt chạy cũ.

Giữ URL Worker ổn định. `js/config.js` dùng `GROUPS_API_URL` riêng; `API_URL` của các chức năng khác được giữ lại.

## Sao lưu và phục hồi

Có thể export D1 bằng `wrangler d1 export egv-nhom-hoc --remote --output=<đường-dẫn-riêng-tư>`. Không đặt file export trong GitHub công khai. Giữ bảng Drive gốc để đối chiếu. Sau khi chuyển, cập nhật trên E-GV/D1; sửa bảng Drive không cập nhật D1.

Không nhập lại snapshot cũ lên D1 đang có thay đổi mới. Khi chuyển ban đầu, khóa API ghi Drive trước, đọc lại nguồn, đối chiếu số hàng và tổng học phí, rồi mới bật URL Worker trên giao diện.
