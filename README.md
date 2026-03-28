# MediRelay

JavaScript monorepo scaffold for the MediRelay hackathon build.

## Apps

- `apps/api`: Express API for auth, transfer creation, share links, acknowledgements, timeline, and sync.
- `apps/web`: React PWA for receiver view, acknowledgement, and offline payload decoding.
- `apps/mobile`: Expo Prebuild React Native sender app with local SQLite persistence and sync queue.
- `packages/shared`: shared validators, demo data, QR payload encoding, and drug interaction rules.

## Quick start

1. Copy `.env.example` to `.env`.
2. Optional for web deployments: copy `apps/web/.env.example` to `apps/web/.env` and set `VITE_API_URL`.
3. Install dependencies with `npm.cmd install`.
4. Run the services:
   - `npm.cmd run dev:api`
   - `npm.cmd run dev:web`
   - `npm.cmd run dev:mobile`

## Demo runbook

### Option 1: Fast demo without MongoDB

The API automatically falls back to in-memory demo storage if MongoDB is unavailable.

1. Start the API:
   - `npm.cmd run dev:api`
2. Start the receiver web app:
   - `npm.cmd run dev:web`
3. Start the mobile app:
   - `npm.cmd run dev:mobile`
4. Use the demo sender account:
   - `doctor@medirelay.demo`
   - `medirelay123`
5. In mobile or web sender workspace:
   - create a transfer
   - save locally
   - sync queue
   - generate share link / QR
6. Open the generated link in the web receiver workspace or paste/scan it in the mobile receiver workspace.
7. Submit acknowledgement and confirm timeline visibility.

### Option 2: Run with MongoDB

This repo includes [docker-compose.yml](C:\Users\LENOVO\OneDrive\Documents\New project\docker-compose.yml) for local MongoDB.

1. Install Docker Desktop.
2. Start MongoDB:
   - `docker compose up -d`
3. Create `.env` from `.env.example`.
4. Optional: create `apps/web/.env` from `apps/web/.env.example` if the web app should call a non-default API URL.
5. Ensure `MONGODB_URI=mongodb://localhost:27017/medirelay`.
6. Start the API:
   - `npm.cmd run dev:api`
7. Start web and mobile as usual.

## Manual verification checklist

- Sender login works in both web and mobile.
- Structured transfer form validates required fields.
- Drug/allergy warning appears for dangerous combinations.
- Draft saves locally in mobile and web sender workspaces.
- Sync queue pushes draft to API after login.
- Share action returns a short URL and QR payload.
- Receiver web opens secure short link and shows the Big Three first.
- Receiver mobile can paste or scan the QR/share link and open the same record.
- Acknowledgement submits once and token reuse is rejected.
- Timeline shows records grouped by `transferChainId`.
- Offline QR payload decodes in web `/offline` and mobile receiver workspace.

## Current implementation notes

- The API keeps working demo data in memory so the repo is runnable without a live Mongo instance.
- Mongoose-ready schemas are included so Mongo-backed persistence can be added without changing contracts.
- The web app supports offline payload decoding through the shared QR payload helpers.
- The mobile app stores transfers and sync queue entries in SQLite and only uses MMKV-sized storage concerns for small flags later.
