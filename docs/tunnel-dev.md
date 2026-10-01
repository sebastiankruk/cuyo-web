# Dev server and tunnel

How the game is served locally, and what a Cloudflare tunnel should point at.

## Ports

| What | Port | Command |
| --- | --- | --- |
| Dev server, source, hot reload | **5173** | `make dev` |
| Dev server, reachable from a phone on the LAN | **5173** | `make dev-lan` |
| Production bundle from `dist/` | **4173** | `make build && make preview` |

Both come from variables at the top of the `Makefile` — `PORT` and
`PREVIEW_PORT` — so there is one place to change them and one value to copy into
the tunnel configuration. Override either per invocation:

```sh
make dev PORT=8080
```

`--strictPort` is on for both. A dev server that silently moves to 5174 when 5173
is busy looks like a tunnel that is pointing at nothing, which is a confusing way
to lose an afternoon; with it, the port conflict is a loud failure. That is not
hypothetical — it is what happened here once, and it is why `make dev` is the
command to use rather than a bare `vite`.

## Vite's host check

Vite refuses a request whose `Host` header it does not recognise, so the first
time the tunnel is pointed at the dev server the page says:

```text
Blocked request. This host ("dev-cuyo.kruk.me") is not allowed.
```

That is a DNS-rebinding guard, and it is working as intended: without it, a page
anywhere on the internet could point a hostname at your loopback interface and
have the dev server serve it to whoever loaded that page.

`dev-cuyo.kruk.me` is allowed **by name** in `vite.config.ts`, for both the dev
server and `vite preview`. The alternative — `host: true`, which allows any
header — would have worked and would have removed the guard, which is the thing
to avoid. A hostname added later fails loudly instead of quietly working.

For a different tunnel hostname:

```sh
CUYO_ALLOWED_HOSTS=dev.example.com,other.example.com make dev
```

Checked in both directions: the tunnel's hostname is answered, `localhost` still
is, and `Host: evil.example.com` is still refused.

## Cloudflare

The tunnel should point at loopback. The dev server binds `127.0.0.1`, which is
deliberate: nothing on the network can reach it, and the tunnel is the intended
way in.

For a quick tunnel:

```sh
cloudflared tunnel --url http://localhost:5173
```

For a named tunnel, add to `/etc/cloudflared/config.yml`:

```yaml
ingress:
  - hostname: dev-cuyo.kruk.me
    service: http://localhost:5173
  - service: http_status:404
```

Then `cloudflared tunnel run <name>`.

Keep this project's port out of the iqoqo set. `3000` and `8000` are taken by the
iqoqo development tunnels; 5173 is Vite's default and is not one of them, and
4173 is Vite's preview port.

## What you will be looking at

The app currently runs the two hand-written fixture levels in
`engine/level-format/fixtures.ts`, transcribed from `nasenkugeln.ld` and
`hormone.ld`. The real level corpus is not wired up yet — that is task group 2 and
the level catalogue in group 6, and `engine/level-format` is where the `.ld`
parsing has been landing.

So the rendering, the board geometry and the falling-piece mechanics can be
judged from it. The 81 levels, the menus, the touch controls and the offline
install cannot: those are groups 6, 9, 10 and 11, none of which has a task
complete against its own bar.

`make preview` is worth a look too, since it serves `dist/` rather than the
source — it is what would actually be deployed, and it catches anything that only
breaks in a production bundle.
