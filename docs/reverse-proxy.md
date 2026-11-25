# Reverse proxy and HTTPS

Siduri speaks plain HTTP on port 3000 inside the container (published as `SIDURI_PORT` on the host). For access from outside your network, put it behind a reverse proxy that handles HTTPS.

HTTPS is needed for:

- secure session cookies (set automatically when `BASE_URL` starts with `https://`)
- [installing the app](user-guide.md#install-as-an-app) on phones and desktops (except on `localhost`)
- keeping the screen on during [brew day](brew-day.md) (browsers allow it only on HTTPS or `localhost`)
- [RAPT pushing](devices.md#rapt-pill-temperature-controller-fermentation-chamber) readings to your server through its data stream

In `.env`:

```sh
BASE_URL=https://siduri.example.com
TRUST_PROXY=true
```

`TRUST_PROXY=true` makes the app use the client address the proxy passes on, so login rate limiting applies to the real visitor and not to the proxy.

## Live updates

Changes made elsewhere (another device, the brew-day timers, readings from a RAPT Pill) arrive through Server-Sent Events on `/api/events`: a long-running response that must not be buffered.

- **Caddy and Traefik:** work as is.
- **nginx:** works as is (the app sends `X-Accel-Buffering: no`). Keep `proxy_read_timeout` at 60s or more (the default).
- **Cloudflare tunnels and other proxies:** may buffer responses. If live updates don't arrive, an orange cloud icon appears in the header after a few seconds. Everything else keeps working; changes from elsewhere show up when you reload or switch back to the tab, and the brew-day timers stay correct either way.

## Examples

**Caddy**

```
siduri.example.com {
    reverse_proxy localhost:8087
}
```

**nginx**

```nginx
server {
    listen 443 ssl;
    server_name siduri.example.com;
    # ssl_certificate …; ssl_certificate_key …;

    client_max_body_size 200m;  # backup files (Settings → Backup) of up to 200 MB

    location / {
        proxy_pass http://127.0.0.1:8087;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
