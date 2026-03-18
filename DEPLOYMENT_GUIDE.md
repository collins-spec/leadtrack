# Leadtrack V2 Deployment Guide

## Option 1: Railway (Recommended - All-in-One)

### Prerequisites
1. GitHub account
2. Railway account (https://railway.app)
3. Domain name (optional but recommended)

### Step 1: Prepare for Deployment

1. **Create Production Environment Files**

Create `packages/backend/.env.production`:
```bash
# Database (Railway will auto-populate this)
DATABASE_URL=

# Server
NODE_ENV=production
PORT=4000
BACKEND_URL=https://your-backend.railway.app
FRONTEND_URL=https://leadtrack.yourdomain.com

# JWT
JWT_SECRET=your-production-jwt-secret-min-32-chars

# Twilio
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token
TWILIO_WEBHOOK_BASE_URL=https://your-backend.railway.app

# OpenAI
OPENAI_API_KEY=your_openai_key

# Google Ads
GOOGLE_ADS_CLIENT_ID=your_client_id
GOOGLE_ADS_CLIENT_SECRET=your_client_secret
GOOGLE_ADS_DEVELOPER_TOKEN=your_developer_token
```

Create `packages/frontend/.env.production`:
```bash
NEXT_PUBLIC_API_URL=https://your-backend.railway.app
```

2. **Add Build Scripts**

Update `packages/backend/package.json`:
```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "db:generate": "prisma generate",
    "db:push": "prisma db push",
    "db:migrate": "prisma migrate deploy"
  }
}
```

Update `packages/frontend/package.json`:
```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start -p 3000"
  }
}
```

3. **Create Railway Configuration**

Create `railway.json` in root:
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "numReplicas": 1,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

### Step 2: Deploy to Railway

1. **Push to GitHub**
```bash
cd "/Users/collinswamae/Collins Claude/Leadtrack V2"
git add .
git commit -m "Prepare for Railway deployment"
git push origin main
```

2. **Create Railway Project**
- Go to https://railway.app
- Click "New Project"
- Select "Deploy from GitHub repo"
- Choose your Leadtrack V2 repository

3. **Add PostgreSQL Database**
- In your Railway project, click "+ New"
- Select "Database" → "PostgreSQL"
- Railway will auto-generate DATABASE_URL

4. **Deploy Backend**
- Click "+ New" → "GitHub Repo"
- Select your repo
- Root Directory: `packages/backend`
- Add environment variables from `.env.production`
- Under "Settings" → "Deploy":
  - Build Command: `npm install && npm run db:generate && npm run build`
  - Start Command: `npm run db:migrate && npm start`
- Click "Deploy"

5. **Deploy Frontend**
- Click "+ New" → "GitHub Repo"
- Select your repo again
- Root Directory: `packages/frontend`
- Add environment variables
- Under "Settings" → "Deploy":
  - Build Command: `npm install && npm run build`
  - Start Command: `npm start`
- Click "Deploy"

6. **Get Your URLs**
- Backend: Click backend service → "Settings" → "Generate Domain"
- Frontend: Click frontend service → "Settings" → "Generate Domain"

7. **Update Environment Variables**
- Go back and update BACKEND_URL, FRONTEND_URL, TWILIO_WEBHOOK_BASE_URL with actual Railway URLs
- Redeploy services

### Step 3: Configure Custom Domain (Optional)

1. **Add Custom Domain to Frontend**
- Frontend service → "Settings" → "Domains"
- Click "Custom Domain"
- Enter `app.yourdomain.com`
- Add CNAME record in your DNS:
  - Name: `app`
  - Value: `your-app.railway.app`

2. **Add Custom Domain to Backend**
- Backend service → "Settings" → "Domains"
- Click "Custom Domain"
- Enter `api.yourdomain.com`
- Add CNAME record in your DNS:
  - Name: `api`
  - Value: `your-backend.railway.app`

### Step 4: Configure External Services

1. **Update Twilio Webhooks**
- Go to Twilio Console
- Update webhook URLs to use your Railway backend URL:
  - Voice URL: `https://api.yourdomain.com/api/webhooks/twilio/voice`
  - Status Callback: `https://api.yourdomain.com/api/webhooks/twilio/status`
  - Recording Callback: `https://api.yourdomain.com/api/webhooks/twilio/recording`

2. **Update Google Ads OAuth Redirect**
- Google Cloud Console → APIs & Services → Credentials
- Add authorized redirect URI: `https://api.yourdomain.com/api/google-ads/callback`

### Step 5: Set Up Monitoring

1. **Railway Logs**
- Each service has a "Deployments" tab with logs
- Use for debugging

2. **Set Up Alerts** (Optional)
- Railway → "Observability"
- Configure alerts for downtime

---

## Option 2: Vercel (Frontend) + Railway (Backend)

**Best for:** Maximum frontend performance with edge CDN

### Frontend on Vercel

1. **Connect to Vercel**
```bash
npm i -g vercel
cd packages/frontend
vercel
```

2. **Configure Build**
- Root Directory: `packages/frontend`
- Framework: Next.js
- Build Command: `npm run build`
- Output Directory: `.next`

3. **Environment Variables**
- Add `NEXT_PUBLIC_API_URL` in Vercel dashboard

### Backend on Railway
- Follow Railway backend steps from Option 1

---

## Option 3: DigitalOcean App Platform

**Best for:** More control, predictable pricing

1. **Create App**
- Go to DigitalOcean → "Create" → "Apps"
- Connect GitHub repo

2. **Configure Services**
- Add PostgreSQL database ($7/month)
- Add backend service ($5/month)
- Add frontend service ($5/month)

3. **Environment Variables**
- Add all required env vars in App Platform

---

## Cost Estimates

| Provider | Database | Backend | Frontend | Total/Month |
|----------|----------|---------|----------|-------------|
| **Railway** | $5 | $5 | $5 | **~$15** |
| **Vercel + Railway** | $5 | $5 | Free | **~$10** |
| **DigitalOcean** | $7 | $5 | $5 | **~$17** |

---

## Post-Deployment Checklist

- [ ] Test user registration and login
- [ ] Test Twilio webhook (make a test call)
- [ ] Test Google Ads OAuth connection
- [ ] Test call transcription
- [ ] Test conversion uploads to Google Ads
- [ ] Set up regular database backups
- [ ] Configure CORS properly
- [ ] Enable HTTPS (Railway does this automatically)
- [ ] Set up monitoring/alerts
- [ ] Document API endpoints
- [ ] Create admin user account

---

## Troubleshooting

### Database Migration Issues
```bash
# Railway PostgreSQL shell
railway run npx prisma db push --accept-data-loss
```

### CORS Errors
Update `packages/backend/src/config/cors.ts`:
```typescript
const allowedOrigins = [
  'https://yourdomain.com',
  'https://api.yourdomain.com',
  process.env.FRONTEND_URL
];
```

### Twilio Webhook Failures
- Check Railway logs for errors
- Verify TWILIO_WEBHOOK_BASE_URL uses HTTPS
- Test webhook URL manually: `curl https://api.yourdomain.com/health`

---

## Backup Strategy

### Railway PostgreSQL Backup
```bash
# Export database
railway pg:dump > backup-$(date +%Y%m%d).sql

# Restore database
railway pg:restore < backup.sql
```

### Automated Backups
Consider setting up:
- Railway automated backups (Pro plan)
- Cron job to export to S3/Google Cloud Storage
- Weekly manual snapshots

---

## Scaling Considerations

As your agency grows:
1. **10-50 clients**: Current Railway setup is perfect
2. **50-100 clients**: Upgrade to Railway Pro ($20/month)
3. **100+ clients**: Consider dedicated hosting (AWS/GCP)

Railway auto-scales based on usage, so you're covered for initial growth.
