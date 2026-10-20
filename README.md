# ClutchX3D + Wolf

| App | What it is | Local URL |
| --- | --- | --- |
| [`clutchx3d/`](clutchx3d) | The shop: ready-made and custom 3D prints, cart, bKash/Nagad checkout, order tracking | http://localhost:8080 |
| [`wolf/`](wolf) | Management app for everything: research, projects and academics (with step lines, tasks and subtasks), plus businesses. ClutchX3D is the first business: orders, payment verification, products, settings | http://localhost:8081 |
| [`logo/`](logo) | ClutchX3D logo files (SVG, PNG, favicons) | |
| `products/` | Original product photos (used to seed the catalogue) | |

```
Customer ──> clutchx3d (Node + Postgres + Spaces) <── x-admin-key ── wolf (Node) <── you
```

Wolf keeps its own research, projects and academics in a `wolf` schema (`WOLF_DATABASE_URL`, the same Postgres locally). For businesses it signs you in, then proxies requests to the ClutchX3D admin API with a shared secret (`ADMIN_API_KEY` in ClutchX3D = `CLUTCHX3D_ADMIN_KEY` in Wolf). More businesses can be added later in `wolf/server/modules.js`.

## How ordering works

1. A customer adds ready-made items, or a custom item (e.g. a statue), to the cart. For custom items they fill in the fields you define in Wolf: photos, files, text, number or choices with price add-ons. Files upload straight away.
2. At checkout they enter name, email, phone, city, address and delivery area, then Send Money with **bKash or Nagad to 01700678498** and enter the sender number and TrxID.
3. The order appears in Wolf as *Payment unverified*. Check your bKash/Nagad statement, then **Mark payment verified** (this moves it to *Confirmed*), then set *Printing, Shipped, Delivered*.
4. The customer tracks it at `/track` with order number + phone.

**Weight-priced prints (e.g. "Print your 3D model")** work differently:

1. The customer uploads their model, picks material, colour, size and quality, and sees the material's rate (e.g. PLA ৳4.5/g). They pay nothing at checkout and choose whether to get the invoice by WhatsApp or email.
2. In Wolf the order shows as *Needs invoice*. Slice the model, enter the weight per piece in grams (the rate is pre-filled from their material), add any extra charges and delivery, and save. Wolf then gives you ready-made **WhatsApp** and **email** messages with the invoice and a tracking link.
3. The customer opens the link (Track an order), checks the invoice and either **accepts and pays** with bKash/Nagad (sender number + TrxID) or declines it.
4. The order moves to *Payment check*. Verify the payment in Wolf as usual.

If a cart mixes weight-priced and fixed-price items, the whole order waits for the invoice. Rates live on the product's choice options in Wolf → Products (set "By weight" pricing and a ৳ per gram on each material).

A TrxID can only be used once per payment method. Prices are always recalculated on the server.

## Run locally

```bash
docker compose up -d --build        # Postgres + both apps
# Wolf login: admin / change-me-please  (set WOLF_ADMIN_PASSWORD to change)
```

For development with hot reload:

```bash
docker compose up -d db
cd clutchx3d && npm install && npm run dev      # API :8080 + Vite :5173
cd wolf && npm install && npm run dev           # API :8081 + Vite :5174
```

On first start the shop creates its tables and seeds 4 products from `products/`. **The prices are placeholders** (Headhunter ৳4,500, Jett ৳6,500, R.E.S. Ghost ৳5,500, statue from ৳3,500 plus size and finish add-ons). Change them in Wolf → ClutchX3D → Products. Delivery charges default to free; set them in Wolf → Settings.

## Deploy to DigitalOcean (App Platform)

Each app has its own spec: `clutchx3d/.do/app.yaml` and `wolf/.do/app.yaml`.

1. **Push this folder to a GitHub repo** and replace `your-github-user/ClutchX3D` in both specs.
2. **Create a Spaces bucket** (e.g. `clutchx3d` in `sgp1`, private) and a Spaces access key. App Platform has no persistent disk, so all uploads go here.
3. **Generate secrets:**
   ```bash
   openssl rand -hex 32                                   # ADMIN_API_KEY (use in both apps)
   openssl rand -hex 32                                   # WOLF_SESSION_SECRET
   cd wolf && npm install && npm run hash-password -- 'your-password'   # WOLF_ADMIN_PASSWORD_HASH
   ```
4. **Create the shop:** `doctl apps create --spec clutchx3d/.do/app.yaml`, then set `ADMIN_API_KEY`, `SPACES_KEY` and `SPACES_SECRET` in the app's settings. A managed Postgres dev database is created with it; `DATABASE_URL` and the CA certificate are wired automatically.
5. **Create Wolf:** put the shop's URL into `CLUTCHX3D_API_URL` / `CLUTCHX3D_PUBLIC_URL` in `wolf/.do/app.yaml`, then run `doctl apps create --spec wolf/.do/app.yaml` and set `WOLF_ADMIN_PASSWORD_HASH`, `WOLF_SESSION_SECRET`, `CLUTCHX3D_ADMIN_KEY` and `WOLF_DATABASE_URL` (the shop's connection string works; Wolf uses its own `wolf` schema).
6. **Domains:** add e.g. `clutchx3d.com` to the shop app and `admin.yourdomain.com` to Wolf under Settings → Domains. TLS is automatic.

You can do all of this in the DigitalOcean dashboard instead of `doctl` (Create App → GitHub → pick the repo and source directory → Dockerfile).
For production, switch the dev database to a managed cluster (see the comment in the spec) so you get backups.

**Alternative: one Droplet.** Install Docker, copy the repo, create a `.env` next to `docker-compose.yml` with `ADMIN_API_KEY`, `WOLF_ADMIN_PASSWORD`, `WOLF_SESSION_SECRET`, `WOLF_COOKIE_SECURE=true` and (optionally) the `SPACES_*` values, run `docker compose up -d --build`, and put Caddy or Nginx in front for HTTPS.

## Environment variables

**clutchx3d:** `DATABASE_URL`, `DATABASE_CA_CERT`, `ADMIN_API_KEY`, `SPACES_BUCKET`, `SPACES_REGION`, `SPACES_KEY`, `SPACES_SECRET`, `SPACES_PREFIX`, `MAX_UPLOAD_MB`, `PORT`. See `clutchx3d/.env.example`.
**wolf:** `WOLF_ADMIN_USERNAME`, `WOLF_ADMIN_PASSWORD` or `WOLF_ADMIN_PASSWORD_HASH`, `WOLF_SESSION_SECRET`, `WOLF_COOKIE_SECURE`, `WOLF_DATABASE_URL`, `WOLF_DATABASE_CA_CERT`, `CLUTCHX3D_API_URL`, `CLUTCHX3D_ADMIN_KEY`, `CLUTCHX3D_PUBLIC_URL`, `PORT`. See `wolf/.env.example`.

## Live server (DigitalOcean Droplet)

| App | URL |
| --- | --- |
| Wolf | http://162.243.255.182 |
| ClutchX3D shop | not deployed yet |

The shop is not on the server at all (no image, data or open port). Wolf shows ClutchX3D as inactive there.

The Droplet (1 CPU, 512 MB, Ubuntu 24.04) runs Wolf and Postgres from `deploy/docker-compose.yml` in `/opt/wolf`. Secrets live only in `/opt/wolf/.env` on the server. It is too small to build the apps, so images are built locally and shipped:

```bash
deploy/deploy.sh        # build, copy images over SSH, restart (uses the "wolf-do" host in ~/.ssh/config)
ssh wolf-do 'cd /opt/wolf && docker compose logs -f --tail 50'
```

It is plain http for now. When a domain points at the Droplet, put HTTPS in front (e.g. Caddy), then set `WOLF_COOKIE_SECURE=true` and `HTTPS=true` in `/opt/wolf/.env` and redeploy.

