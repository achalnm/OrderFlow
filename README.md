# OrderFlow

WhatsApp restaurant order management. Customers place orders through a WhatsApp chatbot, kitchen staff manage and track everything through a web dashboard.

Built as my final year BE project.

## Running locally

```bash
npm run install:all
npm run seed
npm run dev
```

Dashboard: http://localhost:5173  
API: http://localhost:4000  
Login: `owner@demo.test` / `Demo@1234`

No MongoDB needed for dev - the server spins up an in-memory instance automatically.

## Docker

```bash
docker compose up --build
docker compose exec server node dist/seed/index.js
```

## Stack

- Node.js, Express, TypeScript
- MongoDB + Mongoose
- Socket.io (live order updates to dashboard)
- JWT auth with refresh token rotation
- React + Vite + Tailwind CSS
- Chart.js for the analytics page
- Jest + Supertest (23 tests)

## Environment

Server (`server/.env`):

| Variable | Default | Description |
|---|---|---|
| `PORT` | `4000` | Server port |
| `MONGODB_URI` | `mongodb://localhost:27017/orderflow` | Mongo connection |
| `JWT_ACCESS_SECRET` | `orderflow-access-secret-change-in-prod` | Access token key |
| `JWT_REFRESH_SECRET` | `orderflow-refresh-secret-change-in-prod` | Refresh token key |
| `CORS_ORIGIN` | `http://localhost:5173` | CORS origin |
| `CHANNEL` | `simulator` | `simulator`, `whatsapp-webjs` or `whatsapp-cloud` |
| `PAYMENT_PROVIDER` | `mock` | `mock` or `razorpay` |
| `PRINTER_TYPE` | `mock` | `mock` or `network` |
| `PRINTER_HOST` | `192.168.1.100` | Network printer IP |
| `PRINTER_PORT` | `9100` | Network printer port |
| `RAZORPAY_KEY_ID` | - | Razorpay key |
| `RAZORPAY_KEY_SECRET` | - | Razorpay secret |
| `RAZORPAY_WEBHOOK_SECRET` | - | Razorpay webhook secret |
| `WHATSAPP_CLOUD_TOKEN` | - | Meta Graph API token |
| `WHATSAPP_CLOUD_VERIFY_TOKEN` | - | Webhook verify token |
| `WHATSAPP_PHONE_NUMBER_ID` | - | Phone number ID |
| `BASE_URL` | `http://localhost:4000` | Public URL for payment links |

## Demo accounts

| Role | Email | Password |
|---|---|---|
| Owner | `owner@demo.test` | `Demo@1234` |
| Manager | `manager@demo.test` | `Demo@1234` |
| Staff | `staff@demo.test` | `Demo@1234` |

Tenant slug: `spice-garden`

## Trying it out

1. Log in at http://localhost:5173
2. Go to **Bot Simulator** in the sidebar
3. Tenant slug: `spice-garden`, phone: `+919999999999`
4. Type `hi` to start
5. Follow the prompts to browse menu and place an order
6. Open the **Orders** page - the order should appear live via WebSocket

For online payment testing: click the payment link the bot sends, then hit "Pay Now (Test)" on the mock payment page.

## Tests

```bash
cd server
npm test
```

Covers: auth, RBAC, tenant isolation, order state machine, bot FSM, webhook idempotency.

## Switching channels / providers

```bash
# WhatsApp Web.js (unofficial)
CHANNEL=whatsapp-webjs npm run dev --prefix server

# Meta Cloud API
CHANNEL=whatsapp-cloud WHATSAPP_CLOUD_TOKEN=... npm run dev --prefix server

# Razorpay
PAYMENT_PROVIDER=razorpay RAZORPAY_KEY_ID=... RAZORPAY_KEY_SECRET=... RAZORPAY_WEBHOOK_SECRET=... npm run dev --prefix server

# Network printer (ESC/POS)
PRINTER_TYPE=network PRINTER_HOST=192.168.1.100 PRINTER_PORT=9100 npm run dev --prefix server
```

## Structure

```
orderflow/
├── server/
│   ├── src/
│   │   ├── models/       Mongoose schemas
│   │   ├── routes/       REST API
│   │   ├── services/     business logic
│   │   ├── bot/          FSM engine
│   │   ├── channels/     simulator, WA Web.js, Cloud API
│   │   ├── payments/     mock, Razorpay
│   │   ├── printer/      mock, ESC/POS
│   │   ├── middleware/   auth, error handler
│   │   └── __tests__/    Jest suites
│   └── Dockerfile
├── dashboard/
│   ├── src/
│   │   ├── pages/        Login, Dashboard, Orders, Menu, Customers, Simulator, Settings
│   │   ├── context/      Auth, Socket
│   │   └── api/          Axios client
│   └── Dockerfile
└── docker-compose.yml
```
