# Exposing the dev server at dev.cuyo.kruk.me

The dev server runs on `http://127.0.0.1:5173`.

Cloudflare Tunnel `iqoqo-devel` already serves `preview.iqoqo.cc` and
`devel.iqoqo.cc`. `dev.cuyo.kruk.me` is added as a third ingress rule on the
same tunnel, so no new tunnel or credential is needed.

## 1. Add the ingress rule (needs sudo)

The live tunnel is the **system** service `/etc/cloudflared/config.yml`, so:

```sh
sudo tee -a /etc/cloudflared/config.yml >/dev/null <<'YAML'
YAML
```

That append is wrong on its own — `ingress` is a YAML list and the final
catch-all must stay last. Edit the file so the rules read, in this order:

```yaml
ingress:
  - hostname: preview.iqoqo.cc
    service: http://localhost:8000
  - hostname: devel.iqoqo.cc
    service: http://localhost:3000
  - hostname: dev.cuyo.kruk.me
    service: http://localhost:5173
  - service: http_status:404
```

Then apply without dropping connections:

```sh
sudo systemctl reload cloudflared
```

## 2. DNS for the kruk.me zone

**This step is not done and needs your action.** The `cert.pem` in
`~/.cloudflared` is scoped to the `iqoqo.cc` zone only, so `cloudflared` cannot
provision `kruk.me`. You need a Cloudflare API token with `Zone:DNS:Edit` for
`kruk.me`, then:

```sh
export CLOUDFLARE_API_TOKEN=<token>
cloudflared tunnel route dns iqoqo-devel dev.cuyo.kruk.me
```

### Stray record to delete

While establishing the above, `cloudflared` created the record below in the
**wrong** zone. It is inert (the tunnel 404s that hostname) but should be
removed — Cloudflare dashboard → `iqoqo.cc` → DNS → delete:

```
CNAME  dev.cuyo.kruk.me.iqoqo.cc
```

`cloudflared tunnel route dns` has no delete flag, so the dashboard is the
cleanest route.

## 3. Run the dev server

```sh
npm run dev:host     # binds 127.0.0.1:5173, pinned
```

`--strictPort` is deliberate: without it Vite silently moves to another port and
the tunnel 404s.
