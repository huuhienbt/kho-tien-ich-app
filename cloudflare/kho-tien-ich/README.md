# Kho Prompt và nhật ký sửa chữa – E-GV 9.6

Worker `egv-kho-tien-ich` đọc và xử lý dữ liệu trực tiếp trong D1 `egv-kho-tien-ich`. Nhóm học tiếp tục dùng Worker và database riêng. Đăng nhập quản trị có luồng Cloudflare riêng; đăng nhập thành viên/Google, danh sách tài khoản, đổi quyền VIP, AI và tải Drive vẫn dùng Apps Script.

## Đăng nhập quản trị trên Cloudflare (9.7)

`ADMIN_AUTH_API_URL` tách luồng `verify` khỏi Apps Script. Lần đăng nhập đúng đầu tiên xác minh mật khẩu hiện tại với Google, rồi lưu mã băm PBKDF2-SHA256 với salt ngẫu nhiên 16 byte, 100.000 vòng và HMAC-SHA256 bằng pepper riêng trong Cloudflare Secret. D1 không lưu mật khẩu gốc, pepper hay khóa ký. Sau đó đăng nhập được xử lý trong Worker; nhóm học và kho dữ liệu xác minh chữ ký tại Worker, không cần gọi Google cho phiên quản trị mới.

PBKDF2 dùng giới hạn tương thích Workers và pepper giữ ngoài database. Đây không phải cấu hình FIPS/OWASP PBKDF2 600.000 vòng. Rate limiter theo IP và bộ đếm D1 chung giới hạn số lần thử. Khóa RSA-SHA256 riêng `ADMIN_AUTH_SIGNING_KEY` chỉ cấp quyền admin cho subject cố định `admin`, đúng origin/issuer/key ID, hạn tối đa 8 giờ; không dùng lại khóa ký bản lưu Sheets. `ADMIN_PASSWORD_PEPPER` là secret độc lập. Khóa công khai được cài ở cả hai Worker và Collections.gs; thành viên và Google giữ verifier cũ.

Sau chuyển đổi, Worker thông báo Apps Script bằng phiên admin đã ký để khóa đường đăng nhập mật khẩu cũ. Thông báo chạy nền và có thể thử lại ở lần đăng nhập đúng kế tiếp nếu Google chưa phản hồi. Phiên HMAC cũ tiếp tục dùng đến khi hết hạn. Giao diện vẫn giữ mật khẩu cũ và cách đăng nhập hiện tại; không yêu cầu nhập mật khẩu trong ChatGPT.

Mã nguồn chỉ chứa khóa công khai. Workflow bảo toàn Apps Script chèn thêm hook nhỏ vào `verifyToken` và giữ các hàm khác nguyên vẹn. Chỉ bật `ADMIN_AUTH_API_URL` sau khi schema, hai secrets, hai Worker và verifier Apps Script đã được kiểm tra. Đổi Script Property `ADMIN_PASSWORD` sau chuyển đổi không đổi mật khẩu native. Để khôi phục qua Google: chủ dự án đặt `EGV_NATIVE_ADMIN_AUTH_ACTIVE=0`, cấu hình mật khẩu Google mới rồi xóa dòng `admin_credentials` trong D1; lần đăng nhập đúng sau đó chuyển đổi lại. Không xóa hoặc thay khóa/pepper khi chưa chuẩn bị việc khôi phục tương ứng.

## Phân quyền

| Nội dung | Khách | Thành viên / Google | VIP | Quản trị |
|---|---|---|---|---|
| Prompt thường | Xem và sao chép | Xem, sao chép, sử dụng | Có | Có |
| Nội dung Prompt VIP | Ẩn ở API | Ẩn ở API | Xem | Xem và sửa |
| Prompt yêu thích | Lưu trên thiết bị | Đồng bộ theo tài khoản | Đồng bộ | Đồng bộ |
| Sửa chữa | Chỉ số tổng hợp | Tên công việc, trạng thái | Tên công việc, trạng thái | Đầy đủ và nhập/sửa/xóa |

Worker chỉ tin chứng thực do Apps Script xác minh, không tin vai trò do trình duyệt gửi hoặc giải mã từ token chưa xác minh. D1 chỉ lưu SHA-256 của token. Phiên quản trị được giới hạn theo hạn thật của token; quyền thành viên được kiểm tra lại sau tối đa 5 phút. Đổi VIP qua E-GV xóa phiên D1 của tài khoản ngay, đồng thời tăng epoch để ngăn một yêu cầu xác thực cũ ghi đè quyền mới.

## Google Sheets vẫn nhận bản lưu

Ba tab `Prompts`, `Repairs`, `PromptFavorites` trong Data_App là bản lưu của D1. Worker không chờ Google khi trả kết quả lưu: revision trong D1 ghi nhận phần chưa sao lưu, sau đó `waitUntil()` gửi snapshot. Cron mỗi 10 phút thử lại phần còn thiếu. Không ghi khi không có thay đổi. Lỗi hoặc timeout không xóa dấu đang chờ; request tiếp theo và cron có thể thử lại.

`Collections.gs` chỉ nhận snapshot có chữ ký RSA-SHA256 từ khóa riêng trong Cloudflare Secret `SHEETS_SIGNING_KEY`. Mã nguồn chứa duy nhất khóa công khai và `SHEETS_KEY_ID`. Không cần thêm mật khẩu vào GitHub hoặc gửi token quản trị qua tác vụ cron. Apps Script kiểm tra chữ ký, thời hạn 10 phút, schema, ID trùng và revision; dùng ScriptLock để bỏ qua snapshot cũ; đối chiếu mọi giá trị sau khi ghi và chỉ xác nhận khi checksum khớp. Nội dung bắt đầu bằng `=` được ghi bằng RichText để không trở thành công thức.

Giữ nguyên thứ tự cột, định dạng, cột bổ sung của dòng còn tồn tại và các tab khác (Users, nhóm học). Ngày sửa chữa vốn là Date trong Sheets được giữ Date khi nhận snapshot. Không có đồng bộ ngược tự động: sửa trên E-GV; thay đổi trực tiếp trong ba tab bản lưu sẽ bị snapshot mới từ D1 thay thế.

Snapshot được giới hạn dưới 900 KB; kiểm tra dung lượng trước khi thêm/sửa để bản lưu không vượt giới hạn. Ô nội dung tối đa 45.000 ký tự. Không thêm dịch vụ trả phí, Queues, Durable Objects hay R2 cho hai module dữ liệu này. Database được đặt ở APAC; kế hoạch dùng quota miễn phí hiện có, không tự đổi gói của tài khoản.

## Triển khai và kiểm tra

```sh
cd cloudflare/kho-tien-ich
npm ci
npm run types
npm run check
npm test
```

`Check and deploy Prompt and repairs` kiểm tra Worker thật trong Miniflare + D1: khách/thành viên/VIP/quản trị, thu hồi VIP, yêu thích theo tài khoản, CRUD, chữ ký, lỗi bản lưu và thử lại. `Sync Prompt and repair Sheets bridge` dùng 5 GitHub Secrets OAuth đã cấu hình để cài Collections.gs và chèn một hook nhỏ vào doPost của Code.gs/Mã.gs đang chạy. Giữ nguyên mọi hàm khác, tệp khác, manifest, Script Properties và URL Web App; cùng khóa concurrency với workflow nhóm học. API nội dung Apps Script không có CAS, vì vậy script đối chiếu lại mã và deployment trước mỗi lần cập nhật.

Cần cấu hình khóa ký riêng trong Cloudflare Secret trước khi kích hoạt chuyển đổi; deploy tiếp theo giữ secret hiện có. Health báo riêng `ready` và `sheetsBackupConfigured`, tránh nhầm máy chủ đã tải mã với việc dữ liệu đã được chuyển. Có thể cấu hình GitHub Secret `CLOUDFLARE_API_TOKEN` để CI tự triển khai các lần sửa mã; không có token thì workflow chỉ kiểm tra và thông báo, không giả báo đã deploy. Không đưa khóa riêng, bản xuất dữ liệu hay OAuth token lên repository công khai.

Thứ tự chuyển dữ liệu: cài bridge khi chưa kích hoạt; tạo schema; triển khai Worker và secret; gửi yêu cầu ký `activate_export` để ngăn ghi Apps Script cũ và lấy snapshot cuối; nhập nguyên ID và thứ tự vào D1 trong một batch; đối chiếu; bật `COLLECTIONS_API_URL` ở frontend; xác nhận bản lưu Sheets. Chỉ nhập lần đầu khi `initialized=0`, không ghi đè dữ liệu D1 đang chạy.

`GET /health` chỉ báo trạng thái dịch vụ, không trả dữ liệu riêng. `GET /api?type=prompts` che nội dung VIP; `GET /api?type=repairs` chỉ trả thống kê không có tên hoặc chi phí. `POST /api` giữ hợp đồng API frontend hiện tại. Quản trị có thể đọc `collections_backup_status` hoặc yêu cầu `collections_backup_now`; các API này đều kiểm tra phiên ở máy chủ.
