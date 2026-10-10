# Going live on AWS

This setup has three parts:

- **One EC2 server.** It runs the app, HTTPS, and the 5-minute scheduler, all in Docker.
- **One RDS Postgres database.** AWS manages it and takes automatic backups.
- **Your domain**, for example `outreach.waresport.com`.

HTTPS certificates are issued and renewed automatically.

**Rough cost:** about $30/month.

| Item | Cost |
|---|---|
| EC2 `t4g.small` | ~$12 |
| Public IP | ~$4 |
| RDS `db.t4g.micro` + 20 GB | ~$15 (free for 12 months on a new AWS account) |

Use **the same AWS region** for everything, for example `us-east-1`.

---

## 1. Create the server (EC2)

AWS console → **EC2 → Launch instance**:

- **Name:** `waresport`
- **Image:** Ubuntu Server 24.04 LTS, **64-bit (Arm)**
- **Instance type:** `t4g.small` (2 GB RAM)
- **Key pair:** create one and download the `.pem` file. You need it to log in.
- **Network settings → Edit → Create security group** named `waresport-web`, with these rules:
  - SSH (22) from **My IP**
  - HTTP (80) from **Anywhere**
  - HTTPS (443) from **Anywhere**
- **Storage:** 20 GB gp3

Click **Launch**.

## 2. Give it a permanent IP address

**EC2 → Elastic IPs → Allocate**, then **Actions → Associate** it with the `waresport` instance. Note the IP.

## 3. Point the domain at it

Whoever manages DNS for waresport.com adds this record:

| Type | Name | Value |
|---|---|---|
| A | `outreach` | the Elastic IP from step 2 |

If the DNS is on Cloudflare, set the record to **DNS only** (grey cloud). Otherwise the HTTPS certificate can't be issued.

## 4. Create the database (RDS)

**RDS → Create database**:

- **Standard create**, engine **PostgreSQL** (version 16 or newer)
- **Template:** Free tier, or Dev/Test
- **DB instance identifier:** `waresport-db`
- **Master username:** `postgres`
- **Password:** pick one that uses **letters and numbers only**. Symbols break the connection string. Save it.
- **Instance:** `db.t4g.micro`
- **Storage:** 20 GB gp3
- **Connectivity → Connect to an EC2 compute resource** → choose `waresport`. AWS then wires up the network access between the two for you.
- **Public access:** No
- **Additional configuration → Initial database name:** `waresport`
- **Backups:** on, 7 days

Click **Create** and wait for status **Available**. Then copy the **Endpoint**, which looks like `waresport-db.xxxx.us-east-1.rds.amazonaws.com`.

## 5. Install the app on the server

Log in from your laptop:

```bash
chmod 400 ~/Downloads/your-key.pem
ssh -i ~/Downloads/your-key.pem ubuntu@<ELASTIC_IP>
```

Then, **on the server**, set up GitHub access. The repo is private, so the server needs a read-only deploy key:

```bash
ssh-keygen -t ed25519 -N "" -f ~/.ssh/id_ed25519
cat ~/.ssh/id_ed25519.pub
```

Copy the printed line. In GitHub, go to the repo's **Settings → Deploy keys → Add deploy key**, paste it, and leave write access **off**.

Next, clone the repo and install Docker:

```bash
git clone git@github.com:EpicAJS/waresport-cold-calling-agent.git
cd waresport-cold-calling-agent
git checkout abhijay/revamp-tool      # or stay on main once it's merged
bash deploy/setup-server.sh
exit                                   # log out so Docker permissions apply
```

## 6. Configure

SSH back in, then create the settings file:

```bash
cd waresport-cold-calling-agent
cp .env.example .env
openssl rand -base64 32   # run twice: one value for AUTH_SECRET, one for CRON_SECRET
nano .env
```

Fill in at least these values. Don't put quotes around them.

```
DOMAIN=outreach.waresport.com
APP_URL=https://outreach.waresport.com
DATABASE_URL=postgres://postgres:<DB_PASSWORD>@<RDS_ENDPOINT>:5432/waresport?sslmode=require
AUTH_SECRET=<random value>
CRON_SECRET=<another random value>
```

Then add the integrations you use:

- `GOOGLE_*`
- `MICROSOFT_*`
- `OPENAI_API_KEY`
- `BLAND_AI_API_KEY`
- `WEBHOOK_SECRET`
- `SERP_API_KEY`
- `RESEND_API_KEY`

Save and exit nano with Ctrl+O, Enter, then Ctrl+X.

## 7. Start it

```bash
docker compose up -d --build
```

The first build takes about 5–10 minutes. When it's done, run:

```bash
docker compose ps                 # app, caddy, scheduler should all be "running"
docker compose logs -f app        # should show "Database migrations applied." and "Ready"
```

## 8. Create your admin account right away

Open **https://outreach.waresport.com**. It goes to the setup page, and **the first person to sign up becomes the admin**, so do this immediately. Then invite the team from **Team**.

## 9. Point the integrations at the new address

- **Google Cloud → Credentials → your OAuth client:** add the redirect URI `https://outreach.waresport.com/api/oauth/google/callback`
- **Azure → App registration → Authentication:** add `https://outreach.waresport.com/api/oauth/microsoft/callback`
- **Cal.com, Calendly and Bland webhooks:** change the domain to `outreach.waresport.com`
- **GitHub Action scheduler:** leave the `APP_URL` and `CRON_SECRET` repo secrets **unset**. The server runs its own scheduler.

---

## Updating to a new version

On the server:

```bash
cd waresport-cold-calling-agent && bash deploy/update.sh
```

This pulls the latest code, rebuilds and restarts. It also applies any database changes automatically. The site is down for a few seconds while the app restarts.

## Useful commands

```bash
docker compose logs -f app         # app logs
docker compose logs scheduler      # one line every 5 min with what it sent/scanned
docker compose restart app         # restart after editing .env
```

## If something goes wrong

- **The site won't load, or there's a certificate error.** Run `docker compose logs caddy`. Usually one of these is the cause:
  - DNS isn't pointing at the Elastic IP yet. Check with `dig outreach.waresport.com`.
  - Ports 80 and 443 aren't open in the `waresport-web` security group.
  - Cloudflare's proxy (orange cloud) is on.
- **The app logs show "connect ETIMEDOUT" for the database.** The RDS and EC2 network link is missing. In RDS, open the database, go to **Connectivity → Connected compute resources**, and add the instance.
- **"no pg_hba.conf entry … no encryption".** Add `?sslmode=require` to the end of `DATABASE_URL`.
- **The build stops with "Killed" or exit code 137.** The server ran out of memory. Make sure `deploy/setup-server.sh` ran, because it adds swap. You can also use `t4g.medium`.
- **Database backups.** RDS keeps 7 days of automatic backups. Before a big update you can also take one by hand: **RDS → Actions → Take snapshot**.
