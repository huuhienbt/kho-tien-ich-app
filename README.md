# Tệp hỗ trợ APK E-GV thử nghiệm

Đưa nguyên cấu trúc ba mục sau vào thư mục gốc repository đang triển khai `e-gv.vercel.app`:

- `.well-known/assetlinks.json`
- `manifest.webmanifest`
- `icons/`

Sau khi Vercel triển khai xong, tệp xác thực phải mở được tại:

`https://e-gv.vercel.app/.well-known/assetlinks.json`

Tệp này liên kết tên miền với APK có package `vn.egv.app` và đúng chứng thư ký của bản thử nghiệm. Khi xác thực thành công, Chrome có thể mở E-GV trong Trusted Web Activity toàn màn hình. Nếu chưa tải các tệp này lên, APK vẫn mở website bằng Custom Tab an toàn nhưng có thể còn thanh công cụ trình duyệt.

Không thay nội dung hoặc dấu vân tay trong `assetlinks.json` nếu vẫn sử dụng APK thử nghiệm đã phát hành.
