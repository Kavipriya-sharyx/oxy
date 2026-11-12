# Oxxy WhatsApp AI Chatbot & Sales Console

3-day pilot implementation for Oxxy Health: WhatsApp Cloud API bot (NestJS + Claude + Rule Validator + PostgreSQL/PostGIS + Redis/BullMQ), in-house CRM outbox/webhook sync, and React Sales Console.

## 1. Local Setup

1. Copy env files:
   - Root: `.env.example` -> `.env`
   - Backend: `backend/.env.example` -> `backend/.env` (set `ANTHROPIC_API_KEY`, Meta `WHATSAPP_*`, `CRM_*`, `JWT_*`)
   - Frontend: `frontend/.env.example` -> `frontend/.env` (`VITE_API_URL=http://localhost:8000`)
2. Install dependencies:
   ```bash
   npm run install:all
   ```
3. Start Postgres (PostGIS) + Redis, run migrations & seed:
   ```bash
   npm run db:up
   npm --prefix backend run migration:run
   npm --prefix backend run seed
   ```
4. Start API + Sales Console:
   ```bash
   npm run dev
   ```
   - API + Swagger: `http://localhost:8000/swagger`
   - Sales Console: `http://localhost:5173`

## 2. Tests

```bash
npm --prefix backend test
npm run build
```

## 3. Staging Deploy (AWS `ap-south-1`)

1. Provision an EC2 instance in `ap-south-1` (or RDS PostGIS + ElastiCache Redis + SSM Parameter Store).
2. Configure `backend/.env` and root `.env` (`VITE_API_URL=https://<staging-domain>`).
3. Build and start:
   ```bash
   docker compose -f docker-compose.staging.yml up -d --build
   docker compose -f docker-compose.staging.yml exec api npm run migration:run
   docker compose -f docker-compose.staging.yml exec api npm run seed
   ```
4. Put Nginx/Caddy with Let's Encrypt HTTPS in front of `:8080` (console) and `:8000/api` (webhooks).
5. Register `https://<staging-domain>/api/v1/Whatsapp/Webhook` in Meta and `https://<staging-domain>/api/v1/Crm/Webhook` with the CRM team.

## 4. Operations Runbook

- **Restart services:** `docker compose -f docker-compose.staging.yml restart api web`
- **Replay dead-letter CRM outbox rows:**
  - In Sales Console: **CRM sync -> Outbox queue -> Retry now**
  - Via API: `PUT /api/v1/CrmAdmin/Retry/:Id` (JWT required)
- **Rotate secrets:**
  - Update `WHATSAPP_APP_SECRET`, `WHATSAPP_ACCESS_TOKEN`, `CRM_API_KEY`, `CRM_WEBHOOK_SECRET`, or `JWT_SECRET` in `backend/.env` (or AWS SSM) and restart `api`.

## 5. Known Gaps & Phase-2 Items

- **Pilot verification:** Local `npm run install:all`, `backend` unit tests, and staging `TC-01..TC-14` real-phone checks need to be run once dependencies & `.env` credentials (`PRE-01..PRE-09`) are supplied.
- **Live Chat transport:** Uses 4–5s polling via React Query; Socket.IO WebSocket gateway can replace polling in Phase 2.
- **12 `[CONFIRM]` business values:** Currently seeded in `plan_catalog` & `FixedReplies.ts` from Full Plan 1.1; confirm before production go-live.
- **Phase 2 scope:** Full Trigger Engine A–R, payment/activation webhooks (`activation.paid` / `failed`), automated `FOLLOW_UP` / rescue scheduler, reports, template/trigger editors, DPDP data-request portal, and load/DR hardening.

