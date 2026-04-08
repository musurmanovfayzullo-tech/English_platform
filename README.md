# Level Up English Platform

Premium Uzbek beginner spoken English course platform.

## Tech Stack

- **Backend:** Node.js + Express
- **Database:** PostgreSQL (production) / JSON files (development)
- **Frontend:** Vanilla HTML, CSS, JavaScript
- **Hosting:** Render.com

---

## Local Development

```bash
# 1. Install dependencies
npm install

# 2. Create .env file
cp .env.example .env
# Then edit .env with your values

# 3. Start dev server
npm run dev
```

Open http://localhost:3000

---

## Deploy to GitHub + Render

### Step 1 — GitHub'ga yuklash

```bash
# Birinchi marta:
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/english-speaking.git
git push -u origin main

# Keyingi o'zgarishlar uchun:
git add .
git commit -m "Update"
git push
```

### Step 2 — Render.com sozlash

1. [render.com](https://render.com) ga kiring → **New** → **Blueprint**
2. GitHub reponi tanlang
3. `render.yaml` avtomatik aniqlanadi — **Apply** tugmasini bosing
4. Render 2 ta narsa yaratadi:
   - **PostgreSQL database** (`english-speaking-db`)
   - **Web service** (`english-speaking-platform`)

### Step 3 — Environment Variables sozlash

Render Dashboard → Web Service → **Environment** bo'limiga o'ting va quyidagilarni qo'shing:

| Variable | Qiymat |
|----------|--------|
| `APP_URL` | `https://english-speaking-platform.onrender.com` |
| `ADMIN_USERNAME` | `admin` (yoki o'zingiz xohlagan) |
| `ADMIN_PASSWORD_HASH` | *pastda ko'rsatilganidek yarating* |
| `TELEGRAM_USERNAME` | Telegram username (@ siz) |

> `SESSION_SECRET` va `DATABASE_URL` render.yaml orqali avtomatik to'ldiriladi.

### Admin parol hash yaratish

```bash
node -e "require('bcryptjs').hash('SizningParolingiz123', 12).then(console.log)"
```

Chiqgan qiymatni `ADMIN_PASSWORD_HASH` ga joylashtiring.

### Step 4 — Deploy

Environment variables saqlangandan so'ng Render avtomatik deploy qiladi.  
URL: `https://english-speaking-platform.onrender.com`  
Admin: `https://english-speaking-platform.onrender.com/admin`

---

## Environment Variables (to'liq ro'yxat)

| Variable | Majburiy | Tavsif |
|----------|----------|--------|
| `NODE_ENV` | ✅ | `production` |
| `APP_URL` | ✅ | To'liq HTTPS URL |
| `SESSION_SECRET` | ✅ | 32+ belgilik random string |
| `DATABASE_URL` | ✅ | PostgreSQL URL (Render avtomatik beradi) |
| `ADMIN_USERNAME` | ✅ | Admin login nomi |
| `ADMIN_PASSWORD_HASH` | ✅ | bcrypt hash |
| `APP_NAME` | ➖ | Sayt nomi (default: Level Up English) |
| `COURSE_PRICE` | ➖ | Kurs narxi so'mda (default: 199000) |
| `TELEGRAM_USERNAME` | ➖ | Telegram username |

---

## Free Plan haqida eslatma

Render free plan da web service **15 daqiqa faolsizlikdan so'ng uxlaydi**.  
Birinchi so'rov ~30 soniya kechikishi mumkin. Bu normaal.  
Doimiy ishlash uchun Render **Starter** ($7/oy) rejasiga o'ting.
