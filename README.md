# Hệ thống quản lý quỹ lớp minh bạch

> Dự án này xây dựng một giải pháp chống gian lận hóa đơn và theo dõi quỹ lớp minh bạch bằng IPFS/Pinata, Firebase, và smart contract Web3.

> Mục tiêu: mọi phiếu chi, đề xuất, và trạng thái vote đều được lưu giữ minh bạch, không thể sửa đổi, và có thể kiểm tra lại.

## 1. Giới thiệu

Hệ thống hướng tới:
- ✅ Minh bạch quỹ lớp
- ✅ Chống gian lận hóa đơn
- ✅ Đồng bộ hóa trạng thái vote giữa nhiều thiết bị
- ✅ Lưu metadata đề xuất an toàn lên IPFS qua Pinata

### Vì sao cần dự án này?
- Hóa đơn, đề xuất chi tiền thường bị ghi tay, dễ sửa đổi
- Dùng IPFS/Pinata giúp dữ liệu vote và metadata được lưu trữ bất biến
- Kết hợp với Firebase và Web3 giúp nhiều thiết bị cùng theo dõi trạng thái một cách đồng bộ

## 2. Kiến trúc dự án

```text
frontend/        - giao diện Vanilla JS, gọi API và Firebase
backend/         - Node.js Express proxy chuyển tiếp Pinata + phục vụ frontend
docker-compose.yml - khởi tạo dịch vụ Docker chuyên nghiệp
```

- Frontend: Vanilla JavaScript + Firebase SDK + ethers.js
- Backend: Express server làm proxy Pinata và phục vụ frontend
- Docker: containerize backend cho deploy nhanh, ổn định
- CI: GitHub Actions build Docker image tự động cho `main` và PR

## 3. Cấu trúc thư mục

- `backend/`
  - `server.js` - proxy `/api/pinata/pin-json`, endpoint config Firebase
  - `package.json` - dependencies backend và script dev
- `frontend/`
  - `index.html` - SPA chính
  - `js/` - helper cho Pinata, Firebase, Ethereum, tiện ích
- `tests/` - dữ liệu test mẫu
- `.env.example` - mẫu cấu hình môi trường
- `docker-compose.yml` - khởi tạo Docker service
- `.github/workflows/docker-build.yml` - workflow CI Docker

## 4. Hướng dẫn chạy dự án bằng Docker

### Bước 1: Chuẩn bị cấu hình môi trường

Sao chép file mẫu và điền biến môi trường:

```bash
cp .env.example .env
```

Mở `.env` và điền thông tin:

```env
PINATA_JWT=
# hoặc:
PINATA_API_KEY=
PINATA_API_SECRET=

FIREBASE_API_KEY=
FIREBASE_AUTH_DOMAIN=
FIREBASE_PROJECT_ID=
FIREBASE_STORAGE_BUCKET=
FIREBASE_MESSAGING_SENDER_ID=
FIREBASE_APP_ID=
FIREBASE_MEASUREMENT_ID=

PORT=3000
```

> 🔐 Các thông tin này chỉ cần lưu trong `.env` và không commit vào Git.

### Bước 2: Xây image Docker

```bash
docker compose build
```

### Bước 3: Chạy dịch vụ bằng Docker Compose

```bash
docker compose up -d
```

### Bước 4: Mở ứng dụng

```text
http://localhost:3000
```

### Bước 5: Dừng dịch vụ

```bash
docker compose down
```

## 5. Chạy nhanh khi phát triển

Nếu bạn muốn chạy backend trên máy local:

```bash
cd backend
npm install
npm start
```

Sau đó mở:

```text
http://localhost:3000
```

## 6. Docker chuyên nghiệp

- Dùng `docker-compose.yml` để quản lý dịch vụ
- Định nghĩa image Docker riêng cho backend
- Môi trường cấu hình qua `.env`
- CI build Docker image tự động

## 7. GitHub Actions

Workflow nằm ở `.github/workflows/docker-build.yml`.

> Khi có push lên `main` hoặc PR, GitHub sẽ:
> - checkout mã nguồn
> - cài dependencies backend
> - kiểm tra package backend
> - build image Docker

## 8. Lưu ý an toàn

- Không để `PINATA_API_SECRET` hoặc `FIREBASE_*` lộ trong mã nguồn frontend.
- `.env` đã được thêm vào `.gitignore`.
- Mọi metadata lên IPFS phải đi qua proxy backend, không gửi trực tiếp API key từ client.

## 9. Hướng dẫn dùng nhanh

```bash
docker compose build

docker compose up -d
```

> Truy cập `http://localhost:3000`

---

Nếu bạn muốn, tôi sẽ tiếp tục tách `frontend/` và `backend/` thành 2 repo nhỏ hơn hoặc thêm `Makefile` để chạy nhanh hơn. 