# E-GV Android v1.1 – Cầu nối mở ứng dụng AI

- Kiểu ứng dụng: Trusted Web Activity
- Website: `https://e-gv.vercel.app/`
- Package: `vn.egv.app`
- Version: `1.1` (`versionCode 2`)
- Android tối thiểu: 5.0 (API 21)
- Android mục tiêu: API 36

## Khóa ký thử nghiệm

- Tệp: `android.keystore`
- Alias: `egvtrial`
- Mật khẩu keystore và key: `EGV-Trial-2026!`
- SHA-256: `98:53:BE:75:0B:1A:D5:B0:96:3F:75:9C:22:E4:5A:9B:2E:3F:68:3F:42:E9:55:85:97:F8:DF:DD:E5:16:A7:B0`

Phải giữ nguyên khóa này nếu muốn cài bản cập nhật đè lên APK thử nghiệm. Đây là khóa thử nghiệm có mật khẩu được ghi trong tài liệu, không dùng để phát hành chính thức trên Google Play.

## Cầu nối ứng dụng AI

`ExternalAppLauncherActivity` nhận liên kết `egv://open-ai`, kiểm tra package trong danh sách cho phép rồi mở trực tiếp ứng dụng đã cài. Nếu ứng dụng chưa được cài, activity mở website dự phòng. Tính năng này phải đi cùng mã web E-GV v8.9 trở lên.

## Tạo APK bằng GitHub Actions

Đưa toàn bộ thư mục dự án Android lên một repository GitHub. Workflow `.github/workflows/build-apk.yml` tự biên dịch, căn chỉnh và ký bằng khóa thử nghiệm hiện có. Vào thẻ **Actions**, mở **Build E-GV APK**, chọn **Run workflow** rồi tải artifact `E-GV-v1.1-native-bridge` sau khi hoàn tất.

## Xác thực tên miền

Đưa `.well-known/assetlinks.json` của gói hỗ trợ website lên đúng địa chỉ:

`https://e-gv.vercel.app/.well-known/assetlinks.json`

Khi tên miền xác thực thành công, ứng dụng mở website toàn màn hình. Nếu chưa có tệp này, ứng dụng dùng Custom Tab và có thể còn thanh công cụ Chrome.
