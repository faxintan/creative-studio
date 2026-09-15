# creative-studio
A lot of ideas

## Local AiChat

Start the local AiChat web UI and bridge:

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173`.

Useful local configuration:

- `AICHAT_HOST`: bridge host, defaults to `127.0.0.1`
- `AICHAT_PORT`: bridge port, defaults to `8787`
- `AICHAT_RUNTIME`: `auto`, `app-server`, or `exec-json`
- `AICHAT_TRAE_APP_SERVER_WS`: TraeCode app-server WebSocket URL for app-server mode
- `TRAECLI_PATH`: `traecli` binary path, defaults to `traecli`
- `TRAECLI_PERMISSION_MODE`: optional; unset uses the `traecli exec` headless default
- `TRAECLI_SANDBOX_MODE`: defaults to `read-only`
