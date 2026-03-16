import express from 'express';
import cors from 'cors';
import { env } from './config/env';
import { errorHandler } from './middleware/errorHandler';
import authRoutes from './routes/auth';
import accountRoutes from './routes/accounts';
import trackingNumberRoutes from './routes/trackingNumbers';
import callRoutes from './routes/calls';
import webhookRoutes from './routes/webhooks';
import leadRoutes from './routes/leads';
import analyticsRoutes from './routes/analytics';
import dniRoutes from './routes/dni';
import snippetRoutes from './routes/snippet';
import transcriptionRoutes from './routes/transcription';
import keywordRoutes from './routes/keywords';
import notificationRoutes from './routes/notifications';
import googleAdsRoutes from './routes/googleAds';
import reportRoutes from './routes/reports';
import userRoutes from './routes/users';
import { startSessionCleanup } from './services/dni';
import { startDailyDigest } from './services/digest';
import { startGoogleAdsSync } from './services/googleAds';
import { startReportScheduler } from './services/reportScheduler';

const app = express();

// CORS policies
const allowedOrigins = env.FRONTEND_URL.split(',').map(s => s.trim());
if (!allowedOrigins.includes('http://localhost:3000')) {
  allowedOrigins.push('http://localhost:3000');
}
const dashboardCors = cors({ origin: allowedOrigins, credentials: true });
const publicCors = cors({ origin: '*' });

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Twilio sends form-encoded

// Public routes — open CORS (called by client-site JS snippet & Twilio)
app.use('/api/dni', publicCors, dniRoutes);
app.use('/api/snippet', publicCors, snippetRoutes);
app.use('/api/leads', publicCors, leadRoutes);
app.use('/api/webhooks', webhookRoutes);

// Dashboard routes — restricted CORS (frontend only)
app.use('/api/auth', dashboardCors, authRoutes);
app.use('/api/accounts', dashboardCors, accountRoutes);
app.use('/api/tracking-numbers', dashboardCors, trackingNumberRoutes);
app.use('/api/calls', dashboardCors, callRoutes);
app.use('/api/analytics', dashboardCors, analyticsRoutes);
app.use('/api/transcription', dashboardCors, transcriptionRoutes);
app.use('/api/accounts', dashboardCors, keywordRoutes);
app.use('/api/notifications', dashboardCors, notificationRoutes);
app.use('/api/google-ads', dashboardCors, googleAdsRoutes);
app.use('/api/reports', dashboardCors, reportRoutes);
app.use('/api/users', dashboardCors, userRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handler
app.use(errorHandler);

app.listen(env.PORT, () => {
  console.log(`LeadTrack API running on http://localhost:${env.PORT}`);
  startSessionCleanup();
  startDailyDigest();
  startGoogleAdsSync();
  startReportScheduler();
});
