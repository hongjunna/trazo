# TopoRider deployment

Copy `.env.example` to `.env`, replace all example values, and run `docker compose up --build -d`. The frontend uses `/api`; Nginx forwards it to the backend. The build uses Node 22. Database, backend and GraphHopper host ports bind to localhost.

## Firebase Google login

1. Create/select a project in Firebase Console, register a Web app, and copy its `apiKey`, `authDomain`, `projectId`, and `appId` into the corresponding `VITE_FIREBASE_*` values in `.env`.
2. In Authentication > Sign-in method, enable Google and set a support email. In Authentication > Settings > Authorized domains, add your deployment hostname and `localhost` for local development.
3. Run `docker compose up --build -d`. Firebase configuration is compiled into the frontend, so rebuild after changing it. These web configuration values are public; no service-account private key is needed.
4. For local Vite development, copy `frontend/.env.example` to `frontend/.env.local` and fill in the same values. Set `VITE_API_URL` to your backend API URL and set backend `FIREBASE_PROJECT_ID` to the same project ID.

Google login persists across refreshes. Course requests obtain a current Firebase ID token, and the backend verifies its signature, expiry, audience, issuer and Google provider using Google's public keys. Only the signed-in owner's courses can be listed, updated or deleted. Routing and TCX export remain public. The backend adds a nullable `firebase_uid` column to existing databases on startup; legacy courses are not automatically assigned to a new Google account. An administrator must explicitly assign verified owners by updating that column to their Firebase UID. The old token mapping remains available only for standalone legacy deployments without `FIREBASE_PROJECT_ID`; Docker deployments use Firebase exclusively.

## Existing database password rotation

The previously committed password must be treated as exposed. Changing `POSTGRES_PASSWORD` does not change a password in an existing Postgres volume. Before public deployment, back up the database, connect locally with `docker compose exec db psql -U admin -d toporider_db`, and run `\password admin` to enter a newly generated password without putting it in command history. Set that same new password in `.env` and its URL-encoded form in `DATABASE_URL`, then recreate the backend and DB containers. Keep the existing volume. Verify access with the new credentials; never use `docker compose down -v` for rotation. This repository change does not rotate an already-running database or remove secrets from Git history.

## Checks

Run `npm ci --prefix frontend && npm run build --prefix frontend`. With backend dependencies installed, run `python -m unittest discover -s backend/tests` for authentication, ownership and soft-delete checks.

## Dev and live execution

Run `./deploy.sh dev` for local development at http://localhost:3001, or `./deploy.sh live` (also the default with no arguments) for a production build at port 3000. Both require the root `.env` with DB and Firebase values. Dev uses Vite source reload and Uvicorn `--reload`, proxies `/api` to the backend, binds the frontend to localhost, and does not pull Git. Live pulls `main` with `--ff-only` and runs the built frontend through Nginx. Neither mode shuts down the stack before rebuilding or prunes other Docker images. Use `./deploy.sh dev down`, `./deploy.sh dev logs`, or `./deploy.sh dev status`; the same actions work with `live`.

Dev has its own Compose project (`toporider-dev`), Postgres volume and GraphHopper cache in `data/dev`. Live retains the original `toporider` project, Postgres volume and `data/graph-cache`. Dev host ports are frontend 3001, backend 8002, Postgres 5402 and GraphHopper 8991; live ports are 3000, 8001, 5401 and 8989. Do not change the live project name on an existing installation without explicitly migrating its database volume. Both modes use the same Firebase project unless you change its settings; ensure localhost is allowed in Firebase Authentication and in the Kakao Maps JavaScript SDK's registered website domains.

## Map data and first-start downloads

This service still uses a nationwide OSM extract for GraphHopper routing. Place the input at `data/south-korea-260101.osm.pbf` before running either mode; this filename is a configured local name, not a URL that is automatically downloaded. The deployment script stops if it is missing. Dev mounts this same input read-only, so you do not need a second copy of the OSM file. Dev and live build separate routing/elevation caches, so the first dev run still costs import time and disk space. Subsequent runs reuse those caches. Removing a cache, changing incompatible routing settings, or intentionally updating map data may require a new import; replacing the PBF alone does not refresh an existing graph cache.

On an uncached build Docker downloads base images, the GraphHopper 9.1 JAR, npm packages and Python dependencies. On the first map import GraphHopper's configured CGIAR elevation provider may download elevation tiles into `data/srtm` (or `data/dev/srtm`). The map shown in the browser comes from Kakao Maps; the OSM graph is used to calculate routes. Expect significant disk and import work on first startup; the script does not automatically fetch a nationwide OSM extract. To use a newer extract, save it under the configured local filename or update the configuration and mounts together.
