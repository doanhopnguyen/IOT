# Demo Smart Door AI trên laptop

## Luồng sử dụng

Laptop chạy **Smart Door AI**, đăng nhập cùng tài khoản **chủ cửa** trên mobile, rồi chọn cửa hoặc nhập mã `SD-000007` hiển thị trong app. Bấm **Kết nối cửa và bật AI** một lần. Laptop có thể được ghép ngay khi cửa vừa nhận vào tài khoản; camera chờ đến khi cửa online và hoàn tất PIN, cảm ứng, cảm biến, servo.

Khi cửa sẵn sàng, AI tự mở webcam và cửa sổ nhận diện. Những lần sau, nếu đã chọn **Tự chạy lại**, chỉ cần mở Smart Door AI trên laptop; không nhập lại mật khẩu hay chép secret. Không tự khởi chạy một laptop chưa được mở ứng dụng và cấp quyền camera.

Mã `SD-…` chỉ giúp chọn đúng cửa, không phải mật khẩu. Mã nhận cửa trên QR là mã kích hoạt dùng một lần; không dùng lại mã đó để đăng nhập AI. Máy chủ vẫn kiểm tra tài khoản có quản lý cửa trước khi cấp camera.

## Chạy trên máy này

Mobile chạy bằng **Expo Go**, không cần cài APK riêng. Xem [cách mở app bằng Expo Go](CHAY_EXPO_GO.md). Việc ghép laptop và tự chạy AI hoạt động với app mở trong Expo Go.

1. Khởi động broker, backend và dịch vụ trích xuất khuôn mặt theo [hướng dẫn hệ thống](CHAY_TU_DAU_TAILSCALE.md). Khi kiểm tra hôm nay, các model nhận diện và xác minh người thật đã có trên laptop.
2. Nhấp đúp **`Smart Door AI.cmd`** ở `D:\DEV\IOT`. Hoặc chạy:

   ```powershell
   cd D:\DEV\IOT
   powershell -ExecutionPolicy Bypass -File scripts/start-edge-ai.ps1
   ```

3. Trình duyệt mở `http://127.0.0.1:8092`. Đăng nhập email/số điện thoại và mật khẩu của tài khoản đang **quản lý cửa trên app**.
4. Chọn cửa trong danh sách, hoặc nhập mã `SD-…` ở **Cài đặt cửa → Nhận diện bằng laptop**. Cửa đang hiệu chỉnh vẫn có thể được chọn để chờ tự chạy.
5. Bấm **Kết nối cửa và bật AI**. Nếu cửa đã có camera được cấp từ trước, ứng dụng yêu cầu chọn **Thay camera cũ** trước khi chuyển sang laptop này; camera cũ sẽ bị vô hiệu hóa. Ghép lại trên cùng laptop sẽ tái sử dụng thông tin đã lưu.
6. Nếu chưa hoàn tất cửa, tiếp tục các bước trên điện thoại/ESP32. Khi cửa sẵn sàng, webcam và cửa sổ **Smart Door – Face Check** tự mở. Nếu Windows chặn camera, cho phép ứng dụng desktop dùng camera trong Cài đặt quyền riêng tư.
7. Dùng **Dừng nhận diện** trong trang laptop để dừng. Nhấn `Q` trong cửa sổ camera cũng dừng; ứng dụng không tự mở lại ngay sau khi bạn đã dừng. Đóng tab trình duyệt vẫn giữ AI đang chạy.

Không phải chạy `node.py --camera` riêng khi dùng launcher này; tránh hai tiến trình tranh cùng webcam.

## Kịch bản trình diễn với thầy

1. Mobile và laptop dùng cùng tài khoản chủ cửa. Nhận cửa bằng QR, đặt tên; mã `SD-…` của cửa có trong phần Nhận diện bằng laptop.
2. Trên laptop ghép cửa và bật AI. Cho thấy trạng thái **Đang chờ cửa** khi chưa hiệu chỉnh xong.
3. Hoàn tất PIN → cảm ứng → đóng/mở cánh cửa → căn khóa/mở servo. Khi cửa báo sẵn sàng, laptop tự chuyển sang mở camera.
4. Trên app, đăng ký khuôn mặt của người được demo và cấp quyền khuôn mặt tại cửa. Đứng trước webcam, giữ mặt rõ, đủ sáng; chỉ một người trong khung.
5. Quan sát kết quả nhận diện, lệnh mở được cửa xác nhận và lịch sử truy cập. Nhận diện thành công chưa thay thế ACK hay quan sát chốt thực tế.
6. Có thể thử người chưa được cấp quyền hoặc tắt quyền khuôn mặt của thành viên: hệ thống phải từ chối. Giữ bật xác minh người thật khi trình diễn.

## Laptop khác mạng qua Tailscale

- Máy chủ và laptop AI đăng nhập cùng tailnet. Trong trang đăng nhập laptop, mở **Kết nối máy chủ Smart Door**, nhập `http://<IP-Tailscale-máy-chủ>:8080` hoặc địa chỉ HTTPS đã triển khai. Không nhập IP `127.0.0.1` của máy chủ vào laptop khác.
- Launcher gửi sự kiện nhận diện qua API với danh tính camera riêng. Backend dùng cùng quy tắc nhận diện/quyền/người thật và vẫn gửi lệnh đến ESP32 qua MQTT. Laptop không phải chép mật khẩu broker. Luồng MQTT cũ vẫn được giữ cho các node đang dùng cấu hình cũ.
- Tailscale trên laptop không tự đưa ESP32 vào tailnet; đường mạng ESP32 → broker vẫn phải được cấu hình theo hướng dẫn gateway/Tailscale của dự án.

## Chuẩn bị laptop mới một lần

Máy hiện tại đã kiểm tra bằng Python 3.11.9. Cài Python 3.11 và các gói trong `face-node/requirements.txt`, sau đó:

```powershell
cd D:\DEV\IOT
python -m venv .local\venv
.local\venv\Scripts\python.exe -m pip install -r face-node\requirements.txt
cd face-node
..\.local\venv\Scripts\python.exe node.py --download-models --accept-model-license
cd ..
powershell -ExecutionPolicy Bypass -File scripts/start-edge-ai.ps1
```

Lệnh tải model dùng điều khoản model hiện có của dự án. Không tải lại nếu model đã được chuẩn bị và kiểm tra thành công.

## Dữ liệu và xử lý lỗi

- Tải ảnh từ thư viện: app tối ưu ảnh trước khi gửi; tệp nguồn tối đa 20 MiB. Nếu gặp 422, đọc lý do cụ thể như không tìm thấy mặt, nhiều người, ảnh mờ hoặc mặt quá nhỏ rồi chọn ảnh phù hợp. Sau cập nhật, reload Expo Go và đăng nhập lại nếu backend vừa được khởi động lại. Chi tiết sửa luồng QR và ảnh (ghi ch? n?i b?, ch? gi? c?c b? t?i `KIEM_THU_QR_FACE_2026-11-07.md`).
- Mật khẩu tài khoản chỉ ở bộ nhớ cho lần cấp camera, không lưu ra file hoặc gửi vào worker. Thông tin camera riêng được lưu cục bộ tại `.local/edge-ai/connections.json`; không chia sẻ hay đưa thư mục này vào Git.
- Gỡ camera hoặc đổi quyền trên hệ thống làm khóa camera hết hiệu lực. Launcher dừng thay vì phát lại các sự kiện cũ.
- Mất mạng hoặc cửa chưa sẵn sàng: launcher chờ và tự tiếp tục khi kết nối phục hồi. Nếu ứng dụng camera lỗi/model thiếu, giao diện báo lỗi và dừng vòng khởi động; kiểm tra `.local/edge-ai/worker.log` rồi kết nối lại.
- Danh sách cửa trống: kiểm tra đúng tài khoản **chủ cửa**. Quyền admin hệ thống hoặc thành viên được chia sẻ không tự cho phép ghép laptop vào mọi cửa. Có thể đăng nhập chủ cửa đồng thời trên mobile và laptop.
- Khi nâng cấp backend, cần khởi động lại backend để có `/api/face-node/connection` và `/api/face-node/events`. Đừng để tiến trình cũ vẫn giữ cổng 8080.
