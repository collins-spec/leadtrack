# 🚀 Quick Deploy to Railway (5 Minutes)

## 1. Prepare Repository

```bash
cd "/Users/collinswamae/Collins Claude/Leadtrack V2"

# Commit all changes
git add .
git commit -m "Ready for production deployment"
git push origin main
```

## 2. Railway Setup

### A. Create Railway Account
1. Go to **https://railway.app**
2. Sign up with GitHub
3. Connect your GitHub account

### B. Create New Project
1. Click **"New Project"**
2. Select **"Deploy from GitHub repo"**
3. Choose **"Leadtrack V2"** repository
4. Railway will create an empty project

### C. Add PostgreSQL Database
1. In your project, click **"+ New"**
2. Select **"Database"** → **"PostgreSQL"**
3. Click **"Add PostgreSQL"**
4. Railway will provision the database (takes ~30 seconds)
5. **Copy the DATABASE_URL** from the database service

## 3. Deploy Backend

1. Click **"+ New"** → **"GitHub Repo"**
2. Select **"Leadtrack V2"** repo
3. Click **"Add Variables"** and enter:

```
DATABASE_URL=<paste from step 2C>
NODE_ENV=production
PORT=4000
JWT_SECRET=<generate random 32+ char string>
TWILIO_ACCOUNT_SID=<your twilio sid>
TWILIO_AUTH_TOKEN=<your twilio token>
OPENAI_API_KEY=<your openai key>
GOOGLE_ADS_CLIENT_ID=<your google client id>
GOOGLE_ADS_CLIENT_SECRET=<your google secret>
GOOGLE_ADS_DEVELOPER_TOKEN=<your google dev token>
```

4. Go to **"Settings"** → **"Service Settings"**:
   - **Root Directory**: `packages/backend`
   - **Build Command**: `npm install && npm run db:generate && npm run build`
   - **Start Command**: `npm run db:push && npm start`

5. Click **"Deploy"**

6. Once deployed, go to **"Settings"** → **"Networking"**:
   - Click **"Generate Domain"**
   - Copy the URL (e.g., `backend-production-xxxx.railway.app`)

## 4. Deploy Frontend

1. Click **"+ New"** → **"GitHub Repo"** (yes, same repo again)
2. Select **"Leadtrack V2"** repo
3. Click **"Add Variables"**:

```
NEXT_PUBLIC_API_URL=https://<your-backend-url-from-step-3>
```

4. Go to **"Settings"** → **"Service Settings"**:
   - **Root Directory**: `packages/frontend`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`

5. Click **"Deploy"**

6. Once deployed, go to **"Settings"** → **"Networking"**:
   - Click **"Generate Domain"**
   - Copy the frontend URL

## 5. Update Environment Variables

Go back to **Backend Service**:
1. Click **"Variables"**
2. Add/Update:

```
BACKEND_URL=https://<your-backend-url>
FRONTEND_URL=https://<your-frontend-url>
TWILIO_WEBHOOK_BASE_URL=https://<your-backend-url>
```

3. Click **"Redeploy"** to apply changes

## 6. Configure External Services

### Twilio Webhooks
1. Go to **Twilio Console** → **Phone Numbers**
2. Select your tracking number
3. Update **Voice & Fax**:
   - **Voice URL**: `https://<backend-url>/api/webhooks/twilio/voice`
   - **Status Callback URL**: `https://<backend-url>/api/webhooks/twilio/status`

### Google Ads OAuth
1. Go to **Google Cloud Console** → **APIs & Services** → **Credentials**
2. Edit your OAuth 2.0 Client
3. Add **Authorized redirect URI**: `https://<backend-url>/api/google-ads/callback`

## 7. Test Your Deployment

Visit your frontend URL and:
- [ ] Create an account
- [ ] Log in
- [ ] Create a sub-account
- [ ] Make a test call to verify Twilio integration
- [ ] Connect Google Ads
- [ ] Check that transcriptions work

## 🎉 You're Live!

Your app is now running at:
- **Frontend**: `https://<your-frontend-url>`
- **Backend**: `https://<backend-url>`

---

## Custom Domain (Optional)

### Add Your Domain

1. **Frontend Service** → **"Settings"** → **"Domains"**
   - Click **"Custom Domain"**
   - Enter: `app.yourdomain.com`

2. **Add DNS Record** (in your domain registrar):
   - Type: `CNAME`
   - Name: `app`
   - Value: `<your-railway-domain>`
   - TTL: `3600`

3. **Backend Service** → **"Settings"** → **"Domains"**
   - Click **"Custom Domain"**
   - Enter: `api.yourdomain.com`

4. **Add DNS Record**:
   - Type: `CNAME`
   - Name: `api`
   - Value: `<your-backend-railway-domain>`
   - TTL: `3600`

Wait 5-10 minutes for DNS propagation, then update:
- Twilio webhooks to use `api.yourdomain.com`
- Google OAuth redirect to use `api.yourdomain.com`
- Backend FRONTEND_URL to use `app.yourdomain.com`

---

## Costs

Railway Free Tier:
- **$5 free credit/month**
- Each service ~$5/month after free credit
- **Total: ~$15/month** (Backend + Frontend + Database)

**Pro Tip**: Railway charges only for actual usage, so it auto-scales with your agency growth!

---

## Need Help?

- Railway Docs: https://docs.railway.app
- Railway Discord: https://discord.gg/railway
- Check logs: Each service has "Deployments" → Click latest → "View Logs"
