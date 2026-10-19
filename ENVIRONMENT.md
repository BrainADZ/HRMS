# Environment setup

There is one local environment file: `server/.env`. It contains the PostgreSQL
connection and any private server settings. Copy `server/.env.example` on a new
checkout, set `DATABASE_URL` and `ADMIN_EMAIL`, and keep the file out of Git. Set
`ADMIN_PASSWORD` or leave it blank to receive a generated temporary password at first
startup.

In this workspace, the old root `.env` was moved to `server/.env` with its existing
values preserved.

The React client needs no local env file. It calls `/api`. In development,
`npm run dev` starts the API and Vite together and gives Vite the API's actual
port. In production, `npm run build` creates `client/dist` and `npm start`
serves it from the Node server on the same origin.

```sh
npm run dev
```

The URL printed by Vite opens the development app. To run the built app:

```sh
npm run build
npm start
```

`npm run demo` uses a disposable embedded database and does not need
`DATABASE_URL`. Press `q` and Enter to stop it.

For an advanced split deployment, set `VITE_API_BASE_URL` at build time to
the public API URL and `CLIENT_ORIGIN` on the server to the exact frontend
origin. The server permits credentialed cross-origin requests only from that
origin. Keep database passwords and API keys on the server.

The server uses `DATA_DIR=./data` by default for uploads. Back up both that
directory and PostgreSQL. For HTTPS behind a trusted proxy, set
`TRUST_PROXY=1` and `COOKIE_SECURE=true` in `server/.env`.
