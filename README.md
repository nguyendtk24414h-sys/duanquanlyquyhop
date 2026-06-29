# duanquanlyquyhop

## Tổng quan

`duanquanlyquyhop` là một demo web app quản lý quỹ/đề xuất chi tiêu với frontend SPA và một backend proxy server để:

- Phục vụ giao diện web tĩnh từ thư mục `frontend`
- Cung cấp endpoint cấu hình Firebase tại `/config/firebase`
- Proxy upload metadata lên Pinata IPFS qua endpoint `/api/pinata/pin-json`
- Mô phỏng endpoint OCR nội bộ tại `/api/gemini/ocr`
- Hỗ trợ chạy trong Docker hoặc trực tiếp bằng Node.js

## Kiến trúc dự án

Cấu trúc chính của repository:

- `server.js` - server Node.js chính phục vụ SPA và các API backend
- `Dockerfile` - Docker image cho server gốc
- `backend/server.js` - phiên bản backend server tương tự, dùng cho môi trường backend riêng
- `backend/Dockerfile` - Docker image cho backend service
- `frontend/index.html` - SPA shell, tải các script và UI
- `frontend/js/firebase.js` - logic khởi tạo Firebase, đồng bộ Cloud Firestore và load config
- `frontend/js/pinata.js` - helper upload metadata lên Pinata IPFS
- `frontend/js/eth.js` - helper tương tác Ethereum/Blockchain
- `frontend/js/helpers.js` - helper chung cho UI
- `package.json` - config Node.js và dependencies cho server gốc
- `backend/package.json` - config Node.js và dependencies cho backend service

## Chạy project cục bộ (Local)

### Yêu cầu

- Node.js 18+ hoặc LTS
- npm
- Docker (nếu muốn chạy container)
- Trình duyệt để mở `http://localhost:3000`

### Cài đặt dependencies

```bash
cd c:\Users\AD\public
npm install
```

### Chạy trực tiếp bằng Node.js

```bash
cd c:\Users\AD\public
npm start
```

Server mặc định lắng nghe tại `http://localhost:3000`.

### Xây dựng và chạy bằng Docker

```bash
cd c:\Users\AD\public
docker build -t duanquanlyquyhop .
docker run --rm -p 3000:3000 duanquanlyquyhop
```

Khi container chạy, truy cập `http://localhost:3000` để mở SPA.

## Cấu hình môi trường (Environment Variables)

Server hỗ trợ các biến môi trường sau:

- `PORT` - port lắng nghe (mặc định `3000`)
- `PINATA_JWT` - JWT để gọi Pinata API nếu có
- `PINATA_API_KEY` - Pinata API key
- `PINATA_API_SECRET` - Pinata secret key
- `FIREBASE_API_KEY` - Firebase API key
- `FIREBASE_AUTH_DOMAIN` - Firebase auth domain
- `FIREBASE_PROJECT_ID` - Firebase project ID
- `FIREBASE_STORAGE_BUCKET` - Firebase storage bucket
- `FIREBASE_MESSAGING_SENDER_ID` - Firebase messaging sender ID
- `FIREBASE_APP_ID` - Firebase app ID
- `FIREBASE_MEASUREMENT_ID` - Firebase measurement ID
- `ALLOWED_ORIGINS` - danh sách origin được phép (chuẩn bị cho CORS)

> Nếu không đặt biến Firebase, server vẫn trả về cấu hình mặc định đã tích hợp sẵn cho demo.

## Đường dẫn API chính

### `/config/firebase`

Endpoint này trả về JSON cấu hình Firebase để frontend khởi tạo Firestore/Auth.

- Phương thức: `GET`
- Response: `application/json`

Nội dung trả về có dạng:

```json
{
  "apiKey": "...",
  "authDomain": "...",
  "projectId": "...",
  "storageBucket": "...",
  "messagingSenderId": "...",
  "appId": "...",
  "measurementId": "..."
}
```

#### Lưu ý quan trọng

- Route `/config/firebase` phải được định nghĩa trước khi `express.static()` phục vụ file tĩnh.
- Nếu không, SPA fallback có thể trả về HTML thay vì JSON.
- Với Docker, `localhost:3000/config/firebase` phải trả đúng JSON, không phải trang HTML.

### `/api/pinata/pin-json`

Endpoint proxy upload metadata lên Pinata IPFS.

- Phương thức: `POST`
- Request body: JSON với `voteData`

Ví dụ body:

```json
{
  "voteData": {
    "id": "vote-123",
    "proposer": "0x123...",
    "proposerRole": "admin",
    "status": "pending",
    "title": "Đề xuất chi tiêu",
    "amount": 1000000
  }
}
```

#### Trả về

- `200` với `cid` và `ipfsUri`
- `400` nếu payload sai định dạng
- `413` nếu payload quá lớn
- `502` nếu phản hồi Pinata không hợp lệ
- `500` nếu có lỗi server

### `/api/gemini/ocr`

Endpoint mô phỏng OCR cho môi trường local.

- Phương thức: `POST`
- Response trả về JSON mô phỏng kết quả OCR:

```json
{
  "ocr": {
    "amount": 150000,
    "reason": "Mua van phong pham",
    "confidence": 95
  }
}
```

## Frontend

### `frontend/index.html`

- Là SPA chính
- Tích hợp các script frontend để hiển thị UI, quản lý form và đồng bộ dữ liệu

### `frontend/js/firebase.js`

Đây là module quan trọng nhất cho Firebase:

- Tải config từ `/config/firebase`
- Khởi tạo Firebase app và Firestore
- Kết nối Auth (anonymous hoặc custom token nếu có)
- Đồng bộ dữ liệu lên Firestore
- Cập nhật trạng thái đồng bộ cho UI

### `frontend/js/pinata.js`

Chứa helper gọi `/api/pinata/pin-json` để upload dữ liệu metadata lên Pinata IPFS.

### `frontend/js/eth.js`

Chứa helper và logic tương tác blockchain/ethers.

### `frontend/js/helpers.js`

Chứa các hàm tiện ích dùng chung cho frontend.

## Cơ chế chuyển hướng SPA

Server sử dụng `app.get('*')` để trả về `frontend/index.html` cho các đường dẫn không phải API, giúp SPA xử lý routing phía client.

## Mô tả Docker

### Docker file chính (`Dockerfile`)

- Dùng image `node:lts-slim`
- Sao chép `package*.json`
- Cài đặt dependencies production
- Sao chép toàn bộ mã nguồn
- Expose port `3000`
- Chạy `npm start`

### Docker file backend (`backend/Dockerfile`)

- Tương tự Docker file chính nhưng dùng thư mục backend.
- Phù hợp nếu bạn muốn chạy backend service độc lập.

## Kiểm tra nhanh

### Kiểm tra endpoint Firebase

```bash
curl http://localhost:3000/config/firebase
```

Kết quả mong đợi: JSON cấu hình Firebase.

### Kiểm tra API Pinata

```bash
curl -X POST http://localhost:3000/api/pinata/pin-json \
  -H "Content-Type: application/json" \
  -d '{"voteData":{"id":"vote-1","proposer":"admin","status":"pending"}}'
```

### Nếu gặp lỗi port

- Đảm bảo `localhost:3000` chưa bị chiếm bởi process khác
- Docker container phải chạy trên port `3000`
- Nếu dùng Windows, kiểm tra với `netstat` hoặc `Get-NetTCPConnection`

## Gợi ý phát triển

- Thêm `docker-compose.yml` nếu cần chạy đồng thời nhiều service
- Cấu hình `ALLOWED_ORIGINS` rõ ràng cho môi trường production
- Thêm xác thực Pinata JWT hoặc Firebase token an toàn
- Không lưu Firebase config nhạy cảm trong source code khi deploy production

## Lịch sử sửa đổi chủ yếu

- Đã sửa `/config/firebase` để trả JSON trước khi phục vụ file tĩnh
- Cập nhật Docker server entry để container thực sự phục vụ `localhost:3000`
- Bổ sung kiểm tra cache và CORS cho endpoint config
- `frontend/js/firebase.js` đã được cải thiện để tải config từ `window.location.origin`

## Hỗ trợ

Nếu cần hỗ trợ, mở issue hoặc gửi pull request kèm nội dung:

- Môi trường đang dùng
- Lệnh đã chạy
- Lỗi hoặc HTTP response cụ thể

