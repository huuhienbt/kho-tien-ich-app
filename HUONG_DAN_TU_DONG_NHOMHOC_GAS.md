# Tự động cập nhật NhomHoc.gs từ GitHub

Workflow **Sync NhomHoc to Apps Script** chạy khi `NhomHoc.gs` được cập nhật trên `main`, hoặc khi chọn **Actions → Sync NhomHoc to Apps Script → Run workflow**.

Workflow kiểm thử, đọc toàn bộ tệp hiện có trong dự án Apps Script, thay riêng `NhomHoc`, xác minh nội dung, tạo phiên bản rồi cập nhật **deployment Web App hiện tại**. URL dùng trong `js/config.js` được giữ nguyên. `Code.gs`, các tệp tự thêm và manifest được lấy từ dự án Google hiện tại, không lấy bản cũ từ repository để ghi đè. Script Properties và dữ liệu Google Sheets không được truy cập hay thay đổi bởi workflow.

**Trạng thái trước khi cấp quyền:** kiểm thử vẫn chạy, bước đồng bộ được bỏ qua với thông báo “Chưa cấu hình đủ 5 GitHub Secrets”. Màu xanh trong trường hợp này chưa có nghĩa Apps Script đã được cập nhật; đọc phần Summary của lần chạy.

## 1. Bật API cho tài khoản Google

Mở [cài đặt Apps Script](https://script.google.com/home/usersettings) bằng tài khoản sở hữu dự án. Bật **Google Apps Script API**. Đây là cài đặt chung của tài khoản, không phải trang bánh răng trong từng dự án.

## 2. Tạo quyền đồng bộ riêng

1. Mở [Google Cloud Console](https://console.cloud.google.com/). Tạo hoặc chọn project, ví dụ `E-GV-Deploy`.
2. Trong project đó, mở [Apps Script API](https://console.cloud.google.com/apis/library/script.googleapis.com) và chọn **Enable / Bật**. Chọn đúng project ở thanh trên cùng.
3. Mở **Google Auth Platform** và thiết lập ứng dụng OAuth: tên `E-GV Deploy`, email hỗ trợ và liên hệ là email của mình. Nếu dùng tài khoản Gmail cá nhân, chọn **External**.
4. Trong **Audience**, thêm tài khoản sở hữu dự án vào **Test users** nếu đang ở chế độ Testing. Để dùng lâu dài, chuyển **Publishing status** sang **In production** trước khi tạo refresh token. Khi ở Testing, refresh token cho các quyền Apps Script hết hạn sau 7 ngày; nếu đã tạo ở Testing, cần cấp lại token sau khi chuyển trạng thái. Việc xác minh ứng dụng phụ thuộc chính sách của Google và phạm vi sử dụng; chuyển trạng thái không tự làm ứng dụng được xác minh.
5. Vào **Clients → Create client**, chọn **Web application**, đặt tên `E-GV GitHub Deploy`.
6. Trong **Authorized redirect URIs**, thêm chính xác:

   ```text
   https://developers.google.com/oauthplayground
   ```

7. Lưu lại. Giữ **Client ID** và **Client secret** để nhập trực tiếp vào GitHub Secrets ở bước 4.

Không dùng Gemini API key để đồng bộ Apps Script. Client dành cho triển khai được tạo riêng để không cần sửa cấu hình đăng nhập Google của E-GV.

## 3. Lấy refresh token bằng Google OAuth Playground

1. Mở [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/).
2. Bấm bánh răng bên phải. Chọn **Use your own OAuth credentials**, nhập Client ID và Client secret ở bước 2. Để **Access type: Offline**.
3. Tại **Step 1**, nhập hai scope sau (cách nhau bằng một khoảng trắng):

   ```text
   https://www.googleapis.com/auth/script.projects https://www.googleapis.com/auth/script.deployments
   ```

4. Chọn **Authorize APIs**, đăng nhập đúng tài khoản sở hữu dự án và cấp quyền. Chỉ tiếp tục nếu đây là ứng dụng OAuth do mình vừa tạo và tên/quyền hiển thị đúng.
5. Tại **Step 2**, chọn **Exchange authorization code for tokens**.
6. Sao chép **Refresh token** để nhập vào GitHub Secret `GAS_OAUTH_REFRESH_TOKEN`. Không dùng Access token vì nó chỉ có thời hạn ngắn.

Client ID, client secret và refresh token phải thuộc cùng ứng dụng OAuth. Không gửi client secret hoặc token vào tin nhắn, không đưa vào tệp mã nguồn. Dùng credentials của mình trong Playground; credentials mặc định của Playground không phù hợp cho đồng bộ lâu dài.

## 4. Thêm 5 GitHub Secrets

Mở [Secrets của repository](https://github.com/huuhienbt/kho-tien-ich-app/settings/secrets/actions) → **New repository secret**. Tạo từng mục:

| Tên Secret | Giá trị |
| --- | --- |
| `GAS_SCRIPT_ID` | ID tập lệnh trong **Apps Script → Cài đặt dự án → ID tập lệnh** |
| `GAS_DEPLOYMENT_ID` | **Triển khai → Quản lý các triển khai → Web App E-GV đang dùng → Deployment ID / Mã triển khai** |
| `GAS_OAUTH_CLIENT_ID` | Client ID đã tạo ở bước 2 |
| `GAS_OAUTH_CLIENT_SECRET` | Client secret đã tạo ở bước 2 |
| `GAS_OAUTH_REFRESH_TOKEN` | Refresh token đã lấy ở bước 3 |

Script ID và Deployment ID là hai mã khác nhau. Deployment ID phải đúng mã nằm giữa `/s/` và `/exec` trong `API_URL` của `js/config.js`. Workflow sẽ dừng trước khi ghi mã nếu deployment không thuộc dự án hoặc URL không khớp.

## 5. Chạy lần đầu

1. Vào [Actions của repository](https://github.com/huuhienbt/kho-tien-ich-app/actions).
2. Chọn **Sync NhomHoc to Apps Script → Run workflow**, nhánh `main`.
3. Mở lần chạy → **Summary**. Thành công phải có dòng **“Đã cập nhật NhomHoc.gs và triển khai phiên bản…”** hoặc **“NhomHoc.gs đã đồng bộ; phiên bản … đang hoạt động.”**
4. Mở E-GV, đăng nhập quản trị và kiểm tra trang Nhóm học.

Từ các lần sau, cập nhật `NhomHoc.gs` trên `main` sẽ tự chạy quy trình. Các tệp Apps Script khác vẫn được quản lý thủ công. Workflow chưa chạy `setupNhomHoc()`; nếu chưa thiết lập dữ liệu lần đầu, cần đặt Script Property `EGV_NH_DATA_ID` và chạy `setupNhomHoc()` một lần như hướng dẫn nhóm học trước đó.

## Phạm vi và xử lý lỗi

- Không chỉnh mã hoặc triển khai thủ công trong Apps Script trong lúc workflow đang đồng bộ. API không hỗ trợ cập nhật riêng một tệp hoặc khóa nguyên tử; workflow đọc lại trước khi ghi, kiểm tra toàn bộ nội dung và kiểm tra phiên bản trước khi triển khai để phát hiện thay đổi đồng thời.
- Phiên bản mới chứa toàn bộ mã HEAD hiện tại của dự án Google, gồm cả các sửa đổi thủ công đang chờ triển khai ở tệp khác. Hoàn tất những sửa đổi đó trước khi chạy workflow.
- Chỉ nhập credentials do mình tạo vào GitHub Secrets. Không thêm secrets vào pull request hoặc cho workflow chạy trên mã từ người không tin cậy.
- `OAUTH_HTTP_400`: refresh token hết hạn/bị thu hồi hoặc không khớp client. Cấp lại token bằng cùng client và thay Secret.
- `OAUTH_HTTP_401`: kiểm tra Client ID và Client secret.
- `*_HTTP_403`: kiểm tra cả hai chỗ bật API, hai scope và tài khoản đã cấp quyền. Tài khoản Google cần có quyền quản lý dự án/triển khai.
- `READ_DEPLOYMENT_HTTP_404`, `DEPLOYMENT_INVALID`, `WEB_APP_URL_MISMATCH`: kiểm tra Script ID, Deployment ID và URL hiện đang dùng trong `js/config.js`.
- `REMOTE_CHANGED_RETRY`, `REMOTE_DEPLOYMENT_CHANGED`: có thay đổi thủ công đồng thời. Kiểm tra dự án rồi chạy lại workflow.
- Nếu Actions báo nhánh `main` có mã mới hơn, chạy lại workflow trên `main`. Không chạy lại một lần chạy cũ để triển khai mã đã lỗi thời.
- `CONTENT_VERIFICATION_FAILED`, `VERSION_VERIFICATION_FAILED`: nội dung không trùng khớp; workflow chưa triển khai phiên bản mới. Kiểm tra các tệp trên Apps Script trước khi chạy lại.
- Nếu mã đã được tải lên nhưng tạo phiên bản/triển khai thất bại, Web App vẫn dùng phiên bản cũ cho đến khi deployment được cập nhật. Chạy lại sau khi sửa lỗi; workflow kiểm tra cả mã HEAD và phiên bản đang chạy để hoàn tất bước còn thiếu. Nếu lỗi xảy ra lúc cập nhật hoặc xác minh deployment, kiểm tra **Quản lý các triển khai** để biết phiên bản thực tế.
- Summary ghi số phiên bản trước để có thể chọn lại phiên bản đó trong **Quản lý các triển khai** khi cần. Workflow không tự khôi phục hoặc xóa các tệp đã sửa.

## Tài liệu chính thức

- [Bật và cấp quyền Apps Script API](https://developers.google.com/apps-script/api/how-tos/enable)
- [Đọc và cập nhật mã dự án](https://developers.google.com/apps-script/api/how-tos/manage-projects)
- [Cập nhật deployment hiện có](https://developers.google.com/apps-script/api/reference/rest/v1/projects.deployments/update)
- [Refresh token và thời hạn khi OAuth ở Testing](https://developers.google.com/identity/protocols/oauth2#expiration)
