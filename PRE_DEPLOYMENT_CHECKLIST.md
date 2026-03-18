# 📋 Pre-Deployment Checklist

Before deploying to production, gather these credentials and complete these tasks:

## ✅ Required Credentials

### 1. Twilio Account
- [ ] Twilio Account SID
- [ ] Twilio Auth Token
- [ ] At least one purchased phone number

**Get it**: https://console.twilio.com

---

### 2. OpenAI API Key
- [ ] OpenAI API Key (starts with `sk-`)
- [ ] Ensure billing is set up
- [ ] Verify Whisper API access

**Get it**: https://platform.openai.com/api-keys

---

### 3. Google Ads API
- [ ] Google Ads Developer Token
- [ ] OAuth 2.0 Client ID
- [ ] OAuth 2.0 Client Secret
- [ ] Google Ads Customer ID

**Get it**:
1. https://console.cloud.google.com → Create Project
2. Enable Google Ads API
3. Create OAuth 2.0 credentials
4. Apply for developer token: https://ads.google.com/home/tools/manager-accounts/

---

### 4. Domain Name (Optional but Recommended)
- [ ] Domain purchased (e.g., leadtrack.io)
- [ ] Access to DNS settings

**Recommended registrars**: Namecheap, Cloudflare, Google Domains

---

### 5. Email Service (Optional - for notifications)
- [ ] SMTP credentials (Gmail App Password works)

---

## ✅ Pre-Flight Tasks

### Code Preparation
- [ ] All environment files updated with production values
- [ ] Git repository pushed to GitHub/GitLab
- [ ] `.gitignore` excludes `.env` files
- [ ] Database schema is final (migrations ready)

### Security
- [ ] Generate strong JWT_SECRET (32+ characters random string)
- [ ] Review CORS settings in backend
- [ ] Ensure API keys are NOT hardcoded
- [ ] Password requirements are enforced

### Database
- [ ] Database schema tested locally
- [ ] Seed data script ready (if needed)
- [ ] Backup strategy planned

### External Services
- [ ] Twilio phone number purchased
- [ ] Twilio account has credit
- [ ] OpenAI account has credits
- [ ] Google Ads API access approved

---

## ✅ Test Locally First

Before deploying, verify everything works locally:

```bash
# Backend
cd packages/backend
npm run build  # Should complete without errors
npm start      # Should start on port 4000

# Frontend
cd packages/frontend
npm run build  # Should complete without errors
npm start      # Should start on port 3000
```

**Test these flows:**
- [ ] User registration works
- [ ] User login works
- [ ] Creating sub-accounts works
- [ ] All API endpoints respond
- [ ] Database operations succeed

---

## 🎯 Deployment Order

1. ✅ Push code to GitHub
2. ✅ Create Railway project
3. ✅ Add PostgreSQL database
4. ✅ Deploy backend
5. ✅ Deploy frontend
6. ✅ Configure environment variables
7. ✅ Update Twilio webhooks
8. ✅ Configure Google OAuth
9. ✅ Test production deployment
10. ✅ Add custom domain (optional)

---

## 🔐 Security Best Practices

- [ ] Use environment variables for ALL secrets
- [ ] Enable HTTPS (Railway does this automatically)
- [ ] Set secure JWT expiration (7-30 days)
- [ ] Implement rate limiting on sensitive endpoints
- [ ] Regular database backups enabled
- [ ] Monitor error logs regularly

---

## 📊 Post-Deployment Monitoring

After deployment, monitor these:
- [ ] Railway service health dashboard
- [ ] Backend error logs
- [ ] Database connection status
- [ ] Twilio webhook success rate
- [ ] OpenAI API usage/costs
- [ ] Google Ads API quota

---

## 💰 Cost Breakdown (Monthly)

| Service | Cost |
|---------|------|
| Railway (Backend) | $5 |
| Railway (Frontend) | $5 |
| Railway (PostgreSQL) | $5 |
| Twilio (per number) | $1 |
| Twilio (calls) | ~$0.01/min |
| OpenAI Whisper | ~$0.006/min |
| Domain (yearly/12) | ~$1-2 |
| **Estimated Total** | **~$17-25/month** |

*Note: Costs scale with usage. 100 calls/month ≈ $20 total*

---

## 🆘 Need Help?

If you run into issues during deployment:

1. **Check Railway logs**: Service → Deployments → View Logs
2. **Verify environment variables**: All required vars set?
3. **Database connection**: Is DATABASE_URL correct?
4. **Build errors**: Run `npm run build` locally first
5. **Ask for help**:
   - Railway Discord: https://discord.gg/railway
   - Claude Code: Ask me! 😊

---

## Ready to Deploy? 🚀

Once all checkboxes above are complete, follow:
📄 **[QUICK_DEPLOY.md](./QUICK_DEPLOY.md)** for step-by-step deployment
