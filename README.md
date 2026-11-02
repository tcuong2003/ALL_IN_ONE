# All In One Suite (all_in_one)

Nền tảng tích hợp đa công cụ & đa dự án cá nhân trong một mã nguồn duy nhất. Ban đầu phát triển từ dự án `calculator` (máy tính phân bổ chi tiêu 100%), nay được nâng cấp thành **All In One Suite** với kiến trúc module hóa linh hoạt, sẵn sàng mở rộng và cắm thêm nhiều dự án tiếp theo.

---

## 🧭 Cấu Trúc Hệ Sinh Thái Dự Án (Projects Ecosystem)

1. **⚡ SmartBudget 100% (Máy Tính Phân Bổ Chi Tiêu Tự Động)**:
   - Tự động tính tiền siêu tốc từ mức lương theo quy tắc 100%.
   - Nhập tiền tự động phân cách bằng dấu chấm (`8.000.000 ₫`).
   - Hỗ trợ đầy đủ CRUD các ô chi tiêu (thêm, sửa, xóa, slider điều chỉnh %, biểu tượng, màu sắc).
   - Tích hợp 4 công thức tài chính chuẩn: 50/30/20, 6 Chiếc Lọ (JARS), 70/20/10, 80/20.
   - Thanh trạng thái phân mảnh và huy hiệu chuẩn 100%, nút cân bằng tự động về 100%, nút phân bổ nốt phần trăm còn lại.
   - Biểu đồ Donut SVG và bảng định mức chi tiêu 30 ngày.

2. **📈 Compound Interest & Wealth Growth (Máy Tính Lãi Kép & Tích Lũy)**:
   - Dự phóng khối tài sản tương lai từ vốn ban đầu và tiền tích lũy hàng tháng.
   - Nút **"⚡ Lấy số tiền từ SmartBudget"**: Tự động liên kết và trích xuất số tiền từ khoản Tiết kiệm/Đầu tư của SmartBudget sang để tính lãi kép.
   - Điều chỉnh lãi suất kỳ vọng (6% - 15%+) và số năm đầu tư (5 - 40 năm).
   - So sánh trực quan tỷ trọng tiền gốc đã nộp vs. tiền lãi sinh sôi từ lãi kép.
   - Bảng theo dõi cột mốc tài sản chi tiết qua các năm.

3. **📝 Apple Notes Pro (Sổ Ghi Chú & Kế Hoạch Chuẩn macOS/iOS)**:
   - Giao diện và phong cách thiết kế bám sát Apple Notes (tông vàng ấm đặc trưng, thẻ ghi chú bo góc, nền kính đen).
   - Danh sách việc cần làm (Checklist) với nút tròn bấm tích chọn gạch ngang tương tác mượt mà.
   - Phân loại ghi chú theo từng dự án: SmartBudget ⚡, Lãi kép 📈, Ý tưởng & Kế hoạch 💡, Chung 📁.
   - Tìm kiếm ghi chú tức thì, Ghim lên đầu (Pin 📌), tự động lưu thời gian thực vào LocalStorage.
   - Nút bấm nhanh trích xuất trực tiếp bảng tóm tắt chi tiêu từ SmartBudget chèn thẳng vào ghi chú.
   - Tối ưu 100% trên cả Desktop 3 cột và Mobile 1 cột (nút Back "‹ Ghi chú" chuẩn iOS).

4. **🚀 All In One Projects Hub (Trung Tâm Quản Lý Dự Án)**:
   - Nơi hiển thị danh sách các dự án đang hoạt động và các dự án sắp được tích hợp (Thuế TNCN, Lập kế hoạch vay mua nhà/xe, Quản lý tác vụ...).
   - Hướng dẫn chuẩn hóa quy trình tích hợp thêm dự án mới vào source.

---

## 🛠️ Hướng Dẫn Tích Hợp Dự Án Mới Vào Source `all_in_one`

Để thêm một dự án hoặc công cụ mới vào source, bạn chỉ cần thực hiện 3 bước đơn giản:

### Bước 1: Thêm nút Tab điều hướng vào Header (`index.html`)
Trong thẻ `<nav class="aio-nav-tabs">`:
```html
<button type="button" class="aio-tab-btn" data-module="ten_du_an">
  <span class="tab-icon">🧮</span>
  <span class="tab-text">Tên Dự Án Mới</span>
</button>
```

### Bước 2: Tạo Khung Giao Diện Cho Module Trong `<main>` (`index.html`)
```html
<div id="module-ten_du_an" class="aio-module" style="display: none;">
  <!-- Nội dung giao diện của dự án mới -->
</div>
```

### Bước 3: Đăng Ký Module Trong `app.js`
Trong danh sách `modules` của hàm `switchModule`:
```javascript
const modules = ['budget', 'compound', 'hub', 'ten_du_an'];
```
Sau đó viết logic tương tác hoặc import file JS riêng cho module đó.

---

## 🚀 Khởi Chạy Ứng Dụng

Bạn có thể mở trực tiếp file `index.html` bằng trình duyệt hoặc khởi chạy máy chủ nội bộ:

```bash
cd /Users/mac/Desktop/all_in_one
python3 -m http.server 8080
```

Sau đó truy cập: **[http://localhost:8080](http://localhost:8080)**
