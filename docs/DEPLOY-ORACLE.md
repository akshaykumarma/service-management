# Deploying the Service Desk on Oracle Cloud

This sets the app up on an Oracle Cloud virtual machine (the Always Free tier is enough),
on your own domain with HTTPS, with real WhatsApp messages through Meta's WhatsApp Cloud
API. Allow about 2 hours, plus 1–3 days for Meta's approvals (start Part 6 early).

What runs on the server (`docker-compose.prod.yml`):

| Container | Job |
|---|---|
| `caddy` | The only thing reachable from the internet (ports 80/443). Gets and renews the HTTPS certificate automatically and passes requests to the app. |
| `app` | The Service Desk. |
| `db` | PostgreSQL. Private; also reachable from the server itself for backups. |
| `migrate` | A one-off container for database updates and admin scripts. |

---

## Part 1 — Create the server (20 min)

1. Sign up at **cloud.oracle.com**. Pick the **home region** closest to your stores
   (e.g. *India West (Mumbai)* or *India South (Hyderabad)*); it can't be changed later.
2. **☰ → Compute → Instances → Create instance**:
   - **Name:** `shubha-service`
   - **Image:** *Canonical Ubuntu 22.04* (Change image → Ubuntu)
   - **Shape:** Change shape → *Ampere* → **VM.Standard.A1.Flex**, **2 OCPUs, 12 GB memory**
     (Always Free). If Oracle says it is out of capacity, try again later or another
     availability domain.
   - **Networking:** *Create new virtual cloud network* and *Create new public subnet*;
     **Assign a public IPv4 address: Yes**.
   - **Add SSH keys:** *Generate a key pair for me* → **Save private key** and **Save public
     key**. Keep them safe — without the private key you cannot log in.
   - **Boot volume:** tick *Specify a custom boot volume size*: **100 GB**.
   - **Create**. When it shows **Running**, copy the **Public IP address**.
3. Open the web ports in Oracle's firewall: on the instance page click the **Subnet** →
   **Security Lists** → *Default Security List* → **Add Ingress Rules**, twice:
   - Source CIDR `0.0.0.0/0`, IP protocol TCP, Destination port **80**
   - Source CIDR `0.0.0.0/0`, IP protocol TCP, Destination port **443**

   Do **not** open 3000 or 5432.
4. Log in from your Mac's Terminal:
   ```bash
   chmod 400 ~/Downloads/ssh-key-*.key
   ssh -i ~/Downloads/ssh-key-*.key ubuntu@<PUBLIC_IP>
   ```
   (Type `yes` the first time.)

## Part 2 — Domain name (10 min + waiting)

HTTPS, invoice links and WhatsApp need a permanent web address.

1. Use a domain you own, or buy one (GoDaddy, Hostinger, Namecheap, …).
2. In the domain's **DNS settings**, add an **A record**: Name `service` (for
   `service.yourdomain.com`), Value `<PUBLIC_IP>`, TTL lowest available.
3. Wait until it resolves — on your Mac, `ping service.yourdomain.com` should show your
   server's IP (minutes to a few hours).

## Part 3 — Prepare the server (15 min)

Run on the server (over SSH):

```bash
# System updates and Docker
sudo apt update && sudo apt -y upgrade
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
exit
```

Log in again (`ssh -i … ubuntu@<PUBLIC_IP>`) so the Docker permission applies, then:

```bash
# Ubuntu images on Oracle block everything but SSH at the server's own firewall too
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save

# The app
git clone https://github.com/akshaykumarma/service-management.git
cd service-management
git checkout claude/speckit-installation-apij1s
```

The repository is private: when `git clone` asks, use your GitHub **username** and, as the
password, a **personal access token** (GitHub → Settings → Developer settings → Personal
access tokens → Fine-grained → read access to this repository).

## Part 4 — Settings (10 min)

```bash
cp .env.production.example .env
nano .env
```

Fill in (generate each secret with `openssl rand -base64 32` — a different one for each):

| Setting | Value |
|---|---|
| `APP_DOMAIN` | `service.yourdomain.com` (no `https://`, no `/`) |
| `POSTGRES_PASSWORD`, `AUTH_SECRET`, `OTP_HASH_SECRET` | random secrets |
| `SMTP_*` | for password-reset emails, e.g. Gmail: `smtp.gmail.com`, port `587`, your address, and a Google **App Password** (Google Account → Security → 2-Step Verification → App passwords) |
| `WHATSAPP_*` | leave for now — Part 6 |

Save with **Ctrl+O**, **Enter**, **Ctrl+X**. Keep a copy of this file somewhere safe (a
password manager): without `POSTGRES_PASSWORD` you can't open your own backups.

## Part 5 — Start the app (15 min)

```bash
cd ~/service-management
docker compose -f docker-compose.prod.yml up -d --build      # first build on ARM: ~10 min
docker compose -f docker-compose.prod.yml run --rm migrate   # sets up the database
docker compose -f docker-compose.prod.yml run --rm migrate \
  npm run seed:super-admin -- you@yourdomain.com 'A-Strong-Passw0rd!' "Your Name"
```

Open **https://service.yourdomain.com** — the padlock should show, and you can log in with
the Super Admin you just created.

> **Moving your existing data from the Mac?** Use these steps *instead of* the three
> commands above (the data must go in before the app starts for the first time):
>
> 1. On the Mac, with Docker running:
>    ```bash
>    cd ~/Desktop/service-management
>    docker compose exec -T db pg_dump -U service_management service_management | gzip > ~/Desktop/service-data.sql.gz
>    scp -i ~/Downloads/ssh-key-*.key ~/Desktop/service-data.sql.gz ubuntu@<PUBLIC_IP>:~
>    ```
> 2. On the server:
>    ```bash
>    cd ~/service-management
>    docker compose -f docker-compose.prod.yml up -d db
>    gunzip -c ~/service-data.sql.gz | docker compose -f docker-compose.prod.yml exec -T db psql -q -U service_management service_management
>    docker compose -f docker-compose.prod.yml run --rm migrate
>    docker compose -f docker-compose.prod.yml up -d --build
>    ```
>    Your users, stores, tickets and history come across; log in with your existing account.

## Part 6 — WhatsApp (start early: Meta approvals take 1–3 days)

1. **Meta Business account** — at **business.facebook.com**, create one for *Shubha
   Sewing*. Start **Business verification** (Business settings → Security Centre → Start
   verification; GST certificate or registration, plus a utility bill or bank statement).
   Unverified accounts can message only a small number of customers per day.
2. **Developer app** — **developers.facebook.com → My Apps → Create app** → use case
   *Other* → type **Business** → link your business account. Then **Add product →
   WhatsApp → Set up**.
3. **Phone number** — **WhatsApp → API Setup → Add phone number**. Use a number that is
   **not** registered on the WhatsApp or WhatsApp Business phone app (delete that account
   on the phone first, or use a new SIM). Verify by SMS/call and submit the display name
   *Shubha Sewing*. Copy its **Phone number ID** → `WHATSAPP_PHONE_NUMBER_ID` in `.env`.
4. **Permanent access token** — **Business settings → Users → System users → Add**
   (name `service-desk`, role **Admin**) → **Assign assets**: your app (full control) and
   your WhatsApp account (full control) → **Generate new token** → choose your app,
   expiry **Never**, permissions `whatsapp_business_messaging` and
   `whatsapp_business_management` → copy it into `WHATSAPP_ACCESS_TOKEN`.
5. **App secret** — in the developer app: **App settings → Basic → App secret → Show** →
   `WHATSAPP_WEBHOOK_SECRET`.
6. **Verify token** — make up a phrase (e.g. `shubha-verify-2026`) →
   `WHATSAPP_VERIFY_TOKEN`.
7. **Message templates** — create all seven templates in **docs/WHATSAPP-TEMPLATES.md**
   (WhatsApp Manager → Message templates), exactly as written there. Wait for each to show
   **Active**.
8. **Apply the settings** on the server:
   ```bash
   cd ~/service-management && nano .env      # the WHATSAPP_* values from steps 3–6
   docker compose -f docker-compose.prod.yml up -d
   ```
9. **Webhook** (delivery ticks) — in the developer app: **WhatsApp → Configuration →
   Webhook → Edit**: Callback URL `https://service.yourdomain.com/api/webhooks/whatsapp`,
   Verify token = your phrase from step 6 → **Verify and save**. Then under *Webhook
   fields* → **messages** → **Subscribe**.
10. **Test** — create a service ticket with **your own** mobile number. Within a minute you
    should get the "ticket created" WhatsApp; the ticket's **Activity** shows it as
    *sent* (then *delivered*/*read* once the webhook reports back). If it shows *failed*,
    see Troubleshooting.

## Part 7 — First-day setup in the app

As the Super Admin, in this order:

1. **Stores** — add each store with its real **phone number** and **WhatsApp number**,
   then **Activate**.
2. **Team** — add Admins, Service Managers (one store each) and Technicians, with
   technicians' **WhatsApp numbers** (they get demo assignments there).
3. **Catalogue** — parts, services and demo services (or bulk-import with the sample CSVs).
4. **Machine models** — or bulk-import.
5. Do one full test: a service ticket → In Progress → Completed (ready-for-pickup
   WhatsApp) → Start delivery (OTP on WhatsApp) → Delivered (invoice link); and a demo
   ticket → assign → Completed (demo-completed WhatsApp with the invoice).

## Part 8 — Running it

**Update to a new version** (after I merge changes):

```bash
cd ~/service-management
git pull
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml run --rm migrate
```

**Nightly backups** (keeps 14 days in `~/backups`):

```bash
mkdir -p ~/backups
crontab -e
# add this line, save:
30 2 * * * /home/ubuntu/service-management/deploy/backup-db.sh >> /home/ubuntu/backups/backup.log 2>&1
```

Also turn on Oracle's own copies: **Instance → Boot volume → Backup policies → Assign →
Bronze** (weekly). Occasionally copy a backup off the server to your Mac:
`scp -i ~/Downloads/ssh-key-*.key ubuntu@<PUBLIC_IP>:~/backups/<file>.sql.gz ~/Desktop/`

**Restore a backup** (replaces all current data):

```bash
cd ~/service-management
docker compose -f docker-compose.prod.yml stop app
docker compose -f docker-compose.prod.yml exec -T db psql -U service_management -d postgres \
  -c "DROP DATABASE service_management;" -c "CREATE DATABASE service_management;"
gunzip -c ~/backups/<file>.sql.gz | docker compose -f docker-compose.prod.yml exec -T db psql -U service_management service_management
docker compose -f docker-compose.prod.yml start app
```

**Logs:** `docker compose -f docker-compose.prod.yml logs app --tail 100`

## Troubleshooting

| Problem | Check |
|---|---|
| Site doesn't open / no padlock | `ping service.yourdomain.com` shows the server IP? Ports 80 and 443 open in **both** the Oracle security list and `iptables` (Part 1.3, Part 3)? `docker compose -f docker-compose.prod.yml logs caddy` |
| "502 Bad Gateway" | The app is still starting or crashed: `… logs app --tail 100` |
| WhatsApp shows *failed* in Activity | `… logs app | grep -i whatsapp` shows Meta's reason. Common: template not yet **Active**, its name or number of `{{…}}` differs from docs/WHATSAPP-TEMPLATES.md, wrong language (`WHATSAPP_TEMPLATE_LANGUAGE`), expired token, or the customer's number isn't on WhatsApp. |
| Webhook "Verify and save" fails | `WHATSAPP_VERIFY_TOKEN` in `.env` must match exactly, and the app restarted after editing `.env` (`… up -d`). |
| Password-reset emails don't arrive | `SMTP_*` settings; for Gmail use an App Password, not your normal password. |
| Ran out of disk | `docker system prune -af` (removes old build layers; your data volumes are kept). |
