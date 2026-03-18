# 🎯 Leadtrack V2

**AI-Powered Call Tracking & Attribution Platform for Marketing Agencies**

Built for **Leadgentic** - Track calls, analyze conversations with AI, attribute revenue to keywords, and sync conversion data to Google Ads.

---

## 🚀 Features

### Core Functionality
✅ **Multi-Tenant SaaS** - Manage multiple client sub-accounts
✅ **Dynamic Number Insertion (DNI)** - JavaScript snippet tracks UTM parameters
✅ **Call Tracking** - Twilio integration with call forwarding & recording
✅ **AI Transcription** - OpenAI Whisper converts calls to text
✅ **Lead Scoring** - AI analyzes call quality (1-10 score)
✅ **Keyword Attribution** - Resolve Google Ads keywords from GCLID
✅ **Revenue Tracking** - Track quoted & sales values per call
✅ **Google Ads Integration** - Auto-upload offline conversions with revenue

### Analytics & Reporting
📊 **Keywords Performance** - Calls, qualified leads, conversion rate by keyword
📊 **UTM Attribution** - Filter by source, medium, campaign
📊 **Quality Scoring** - AI-generated 1-10 score per call
📊 **Revenue Analytics** - Quoted vs Sales value per keyword
📊 **Google Ads Sync** - Daily spend import & conversion upload

### Branding
🎨 **Dark Theme** - Leadgentic brand colors (#0D0D0D + lime green)
🎨 **Responsive** - Mobile-first design
🎨 **Professional UI** - Shadcn/ui components

---

## 🏗️ Tech Stack

### Backend
- **Node.js** + **Express** - REST API
- **PostgreSQL** - Database
- **Prisma** - ORM & migrations
- **TypeScript** - Type safety

### Frontend
- **Next.js 14** - React framework
- **TailwindCSS** - Styling
- **Shadcn/ui** - Component library

### Integrations
- **Twilio** - Call tracking & recording
- **OpenAI Whisper** - AI transcription
- **Google Ads API** - Conversion tracking
- **JWT** - Authentication

---

## 📁 Project Structure

```
Leadtrack V2/
├── packages/
│   ├── backend/          # Express API + Database
│   │   ├── src/
│   │   │   ├── routes/   # API endpoints
│   │   │   ├── services/ # Business logic
│   │   │   ├── config/   # Configuration
│   │   │   └── middleware/
│   │   └── prisma/       # Database schema
│   │
│   └── frontend/         # Next.js App
│       ├── app/          # Pages & layouts
│       ├── components/   # UI components
│       └── lib/          # Utilities
│
├── QUICK_DEPLOY.md              # 🚀 5-minute deployment guide
├── DEPLOYMENT_GUIDE.md          # 📚 Full deployment docs
├── PRE_DEPLOYMENT_CHECKLIST.md # ✅ Pre-flight checks
└── README.md                    # 📖 You are here
```

---

## 🏃 Quick Start (Local Development)

### Prerequisites
- Node.js 18+
- PostgreSQL
- Twilio account
- OpenAI API key

### 1. Clone & Install

```bash
cd "/Users/collinswamae/Collins Claude/Leadtrack V2"
npm install
```

### 2. Setup Database

```bash
# Start PostgreSQL (via Docker)
docker-compose up -d

# Or use your local PostgreSQL
createdb leadtrack
```

### 3. Configure Environment

```bash
# Backend
cp packages/backend/.env.example packages/backend/.env
# Edit .env with your credentials

# Frontend
cp packages/frontend/.env.local.example packages/frontend/.env.local
```

### 4. Initialize Database

```bash
cd packages/backend
npm run db:push
npm run db:seed  # Creates demo account
```

### 5. Start Servers

**Terminal 1 - Backend:**
```bash
cd packages/backend
npm run dev
# Running on http://localhost:4000
```

**Terminal 2 - Frontend:**
```bash
cd packages/frontend
npm run dev
# Running on http://localhost:3000
```

### 6. Login

Go to http://localhost:3000/login

**Demo credentials:**
- Email: `demo@leadtrack.io`
- Password: `password123`

---

## 🌐 Deployment

Ready to go live? Follow these guides in order:

1. **[PRE_DEPLOYMENT_CHECKLIST.md](./PRE_DEPLOYMENT_CHECKLIST.md)** - Gather credentials & prepare
2. **[QUICK_DEPLOY.md](./QUICK_DEPLOY.md)** - Deploy to Railway in 5 minutes
3. **[DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)** - Full deployment docs with alternatives

**Recommended hosting:** Railway (~$15/month)
**Alternatives:** Vercel + Railway, DigitalOcean, AWS

---

## 📊 Key Workflows

### 1. Add a Client
1. Create sub-account with business phone
2. Provision tracking numbers (Twilio)
3. Add DNI snippet to client's website
4. Configure keyword scoring rules

### 2. Track a Call
1. Visitor lands on website → DNI captures UTM + GCLID
2. Visitor calls tracking number
3. Twilio forwards to client's business phone
4. Call recorded & transcribed by OpenAI
5. AI analyzes keywords & assigns quality score
6. Attribution resolved (keyword, campaign, ad group)

### 3. Revenue Attribution
1. Navigate to Calls page
2. Enter **Quoted Value** when lead is qualified
3. Enter **Sales Value** when deal closes
4. View revenue by keyword in Keywords page
5. Google Ads auto-receives conversion with value

### 4. Google Ads Integration
1. Connect Google Ads via OAuth
2. Daily spend sync (automatic at 6am UTC)
3. Add "Qualified" or "Booked" tag to call
4. Conversion auto-uploads to Google Ads with revenue value
5. Google Ads optimizes based on actual ROI

---

## 🔐 Security

- ✅ JWT authentication with HTTP-only cookies
- ✅ Bcrypt password hashing
- ✅ Environment variables for secrets
- ✅ CORS protection
- ✅ Input validation with Zod
- ✅ SQL injection protection (Prisma ORM)
- ✅ Rate limiting on auth endpoints

---

## 🧪 Testing

### Manual Testing Checklist
- [ ] User registration/login
- [ ] Multi-account switching
- [ ] Twilio call forwarding
- [ ] Call recording playback
- [ ] AI transcription
- [ ] Keyword resolution from GCLID
- [ ] Revenue tracking (quoted/sales)
- [ ] Google Ads OAuth flow
- [ ] Conversion upload to Google Ads

---

## 📈 Scaling

**Current capacity:** 100+ clients, 10k+ calls/month

**Bottlenecks to watch:**
- PostgreSQL connections (max 100 on Railway)
- OpenAI Whisper quota (6k minutes/month on Tier 1)
- Twilio concurrent calls (depends on account tier)

**Scaling path:**
1. 0-50 clients: Current Railway setup
2. 50-100 clients: Upgrade Railway to Pro ($20/month)
3. 100+ clients: Dedicated hosting (AWS RDS, auto-scaling)

---

## 🐛 Troubleshooting

### Database Connection Issues
```bash
# Check if PostgreSQL is running
docker-compose ps

# Reset database
cd packages/backend
npm run db:push -- --force-reset
```

### Twilio Webhooks Not Working
- Verify `TWILIO_WEBHOOK_BASE_URL` uses HTTPS
- Check Railway logs for errors
- Test webhook: `curl https://your-backend.railway.app/health`

### Google Ads API Errors
- Ensure developer token is approved
- Verify OAuth redirect URI matches exactly
- Check conversion action IDs in Settings

---

## 📝 Environment Variables

### Required Backend Variables
```bash
DATABASE_URL              # PostgreSQL connection string
JWT_SECRET               # Min 32 chars, random string
TWILIO_ACCOUNT_SID       # From Twilio Console
TWILIO_AUTH_TOKEN        # From Twilio Console
OPENAI_API_KEY          # From OpenAI Platform
GOOGLE_ADS_CLIENT_ID    # From Google Cloud Console
GOOGLE_ADS_CLIENT_SECRET # From Google Cloud Console
GOOGLE_ADS_DEVELOPER_TOKEN # From Google Ads
```

### Required Frontend Variables
```bash
NEXT_PUBLIC_API_URL      # Backend URL
```

---

## 🤝 Contributing

This is a private project for Leadgentic. For questions or issues:
- Contact: collins@creatorscollective.us
- Phone: +254787272502

---

## 📄 License

Proprietary - © 2025 Leadgentic. All rights reserved.

---

## 🎉 Credits

**Built with:**
- OpenAI Whisper for transcription
- Google Ads API for conversion tracking
- Twilio for call tracking
- Prisma for database ORM
- Next.js for frontend
- Shadcn/ui for components

**Developed for Leadgentic** - Premium Google Ads management for local service businesses.

---

**Ready to deploy?** → Start with [PRE_DEPLOYMENT_CHECKLIST.md](./PRE_DEPLOYMENT_CHECKLIST.md)
