# Frontend and backend configuration

The source remains in one repository with separate `client/` and `server/` directories. Environment files are now separate too:

| File | Purpose |
|---|---|
| `server/.env` | Private backend credentials, PostgreSQL, administrator, AI and server settings |
| `server/.env.example` | Backend setup template; no real credentials |
| `client/.env` | Local frontend API connection settings |
| `client/.env.example` | Frontend setup template; only public settings |

The former root `.env` was moved to `server/.env` with its existing contents preserved. The root `.env.example` was moved to `server/.env.example`. Both actual environment files are ignored by Git and excluded from Docker builds. Keep all private credentials in the backend file. Vite embeds `VITE_*` variables in browser code.

Run commands from the repository root. For a new checkout, copy each example to `.env` in the same directory and configure PostgreSQL in `server/.env`.

## Start separately

Terminal 1:

```sh
npm run dev:server
```

Terminal 2:

```sh
npm run dev:client
```

Open the Vite URL printed by the frontend terminal. In `client/.env`, `API_PROXY_TARGET` must match the backend URL printed by the backend terminal. The API can choose a free port if the configured port is occupied. For independent terminals, update the frontend proxy target accordingly.

Alternatively, `npm run dev` starts both processes and automatically connects the frontend proxy to the actual backend port. It passes the contents of `server/.env` only to the API child process. API source, SQL migrations and backend environment edits trigger a backend reload.

The default client configuration is:

```dotenv
VITE_API_BASE_URL=/api
API_PROXY_TARGET=http://127.0.0.1:3000
```

Set the proxy port to your actual backend port. Vite reads this file from `client/`; it does not load `server/.env`. Restart the standalone backend after changing its environment, or use its development watcher. Vite restarts when its environment changes.

## Optional direct API connection

For a frontend that calls another local origin directly, set `VITE_API_BASE_URL=http://127.0.0.1:3000/api` in `client/.env` and `CLIENT_ORIGIN=http://127.0.0.1:5173` in `server/.env`. Match the actual ports. The backend permits credentialed CORS only for that exact configured origin. Use the same hostname for both local services, such as `127.0.0.1`, so session cookies remain on the same site. For different public sites, prefer a same-site API proxy; cross-site cookie policy is a separate deployment concern.

## Builds and production

`npm run build` builds the frontend using `client/.env` and any mode-specific frontend environment files. Public environment changes need a rebuild. Backend settings are read at process startup.

`npm start` loads `server/.env`. It can still serve the built frontend for the existing combined deployment. Set `SERVE_CLIENT=false` in the backend environment for an API-only server and host `client/dist` separately, with the API proxy or direct-origin configuration described above.

All database, reset, PostgreSQL test and browser-test commands now read `server/.env`. Docker runtime environment injection uses `--env-file server/.env`; neither actual file is copied into the image. Hosting-provider environment variables still work without local environment files.
