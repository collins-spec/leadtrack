import { PrismaClient, CallStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Clean existing data
  await prisma.leadTag.deleteMany();
  await prisma.dNISession.deleteMany();
  await prisma.callLog.deleteMany();
  await prisma.formLead.deleteMany();
  await prisma.spendEntry.deleteMany();
  await prisma.notificationConfig.deleteMany();
  await prisma.trackingNumber.deleteMany();
  await prisma.account.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();

  // Create organization
  const org = await prisma.organization.create({
    data: { name: 'Demo Agency' },
  });

  // Create user (password: "password123")
  const passwordHash = await bcrypt.hash('password123', 12);
  const user = await prisma.user.create({
    data: {
      email: 'demo@leadtrack.io',
      passwordHash,
      name: 'Demo User',
      role: 'OWNER',
      organizationId: org.id,
    },
  });

  // Create client accounts
  const plumber = await prisma.account.create({
    data: {
      name: 'ABC Plumbing',
      businessPhone: '+15551234567',
      timezone: 'America/New_York',
      organizationId: org.id,
    },
  });

  const hvac = await prisma.account.create({
    data: {
      name: 'Cool Air HVAC',
      businessPhone: '+15559876543',
      timezone: 'America/Chicago',
      organizationId: org.id,
    },
  });

  // Create preset tags for ABC Plumbing
  const presetTags = [
    { name: 'Qualified', color: '#10b981' }, // green
    { name: 'Spam', color: '#ef4444' }, // red
    { name: 'Wrong Number', color: '#6b7280' }, // gray
    { name: 'Booked', color: '#3b82f6' }, // blue
    { name: 'Missed', color: '#f59e0b' }, // yellow
    { name: 'Follow-Up', color: '#f97316' }, // orange
    { name: 'Customer', color: '#8b5cf6' }, // purple
    { name: 'Not Interested', color: '#64748b' }, // slate
  ];

  const tags: Record<string, any> = {};
  for (const tag of presetTags) {
    tags[tag.name] = await prisma.leadTag.create({
      data: {
        label: tag.name,
        color: tag.color,
        // Not linked to any lead yet
      },
    });
  }

  // Create tracking numbers (no real Twilio SIDs for demo)
  const tn1 = await prisma.trackingNumber.create({
    data: {
      phoneNumber: '+15550001001',
      friendlyName: 'Google Ads | Brand Campaign',
      source: 'Google Ads',
      medium: 'cpc',
      campaignTag: 'Brand Campaign',
      accountId: plumber.id,
    },
  });

  const tn2 = await prisma.trackingNumber.create({
    data: {
      phoneNumber: '+15550001002',
      friendlyName: 'Google Ads | Emergency Services',
      source: 'Google Ads',
      medium: 'cpc',
      campaignTag: 'Emergency Services',
      accountId: plumber.id,
    },
  });

  const tn3 = await prisma.trackingNumber.create({
    data: {
      phoneNumber: '+15550001003',
      friendlyName: 'GMB Listing',
      source: 'Google',
      medium: 'organic',
      campaignTag: 'GMB',
      accountId: plumber.id,
    },
  });

  const tn4 = await prisma.trackingNumber.create({
    data: {
      phoneNumber: '+15550001004',
      friendlyName: 'Google Ads | AC Repair',
      source: 'Google Ads',
      medium: 'cpc',
      campaignTag: 'AC Repair',
      accountId: hvac.id,
    },
  });

  // DNI pool numbers for ABC Plumbing (Phase 2)
  await prisma.trackingNumber.create({
    data: {
      phoneNumber: '+15550002001',
      friendlyName: 'DNI Pool #1',
      source: 'Website',
      medium: 'dni',
      isDNIPool: true,
      accountId: plumber.id,
    },
  });

  await prisma.trackingNumber.create({
    data: {
      phoneNumber: '+15550002002',
      friendlyName: 'DNI Pool #2',
      source: 'Website',
      medium: 'dni',
      isDNIPool: true,
      accountId: plumber.id,
    },
  });

  await prisma.trackingNumber.create({
    data: {
      phoneNumber: '+15550002003',
      friendlyName: 'DNI Pool #3',
      source: 'Website',
      medium: 'dni',
      isDNIPool: true,
      accountId: plumber.id,
    },
  });

  // Generate call logs for the past 30 days
  const statuses: CallStatus[] = ['COMPLETED', 'COMPLETED', 'COMPLETED', 'NO_ANSWER', 'COMPLETED', 'BUSY', 'COMPLETED', 'COMPLETED'];
  const trackingNumbers = [tn1, tn2, tn3];
  const callerNumbers = ['+15551112222', '+15553334444', '+15555556666', '+15557778888', '+15559990000', '+15551113333', '+15552224444'];

  for (let i = 0; i < 45; i++) {
    const daysAgo = Math.floor(Math.random() * 30);
    const hoursAgo = Math.floor(Math.random() * 12) + 8; // 8am to 8pm
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    date.setHours(hoursAgo, Math.floor(Math.random() * 60), 0, 0);

    const tn = trackingNumbers[Math.floor(Math.random() * trackingNumbers.length)];
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    const duration = status === 'COMPLETED' ? Math.floor(Math.random() * 300) + 10 : status === 'NO_ANSWER' ? 0 : Math.floor(Math.random() * 10);

    const call = await prisma.callLog.create({
      data: {
        accountId: plumber.id,
        trackingNumberId: tn.id,
        callerNumber: callerNumbers[Math.floor(Math.random() * callerNumbers.length)],
        callerCity: ['New York', 'Brooklyn', 'Queens', 'Bronx', 'Manhattan'][Math.floor(Math.random() * 5)],
        callerState: 'NY',
        duration,
        callStatus: status,
        twilioCallSid: `CA${Date.now()}${Math.random().toString(36).slice(2, 10)}${i}`,
        whisperPlayed: `Call from ${tn.source} ${tn.campaignTag || tn.medium}`,
        recordingUrl: status === 'COMPLETED' && duration > 30 ? `https://api.twilio.com/2010-04-01/Accounts/demo/Recordings/RE${i}.mp3` : null,
        createdAt: date,
      },
    });

    // Add tags to some calls using preset tags
    if (duration > 60 && i % 3 === 0) {
      // ~33% of long calls tagged as Qualified
      await prisma.leadTag.create({
        data: { label: tags['Qualified'].label, color: tags['Qualified'].color, callLogId: call.id },
      });
    } else if (duration < 15 && duration > 0 && i % 4 === 0) {
      // ~25% of short calls tagged as Spam
      await prisma.leadTag.create({
        data: { label: tags['Spam'].label, color: tags['Spam'].color, callLogId: call.id },
      });
    } else if (status === 'NO_ANSWER' && i % 2 === 0) {
      // ~50% of missed calls tagged as Missed
      await prisma.leadTag.create({
        data: { label: tags['Missed'].label, color: tags['Missed'].color, callLogId: call.id },
      });
    }
    if (duration > 120 && i % 7 === 0) {
      // ~14% of very long calls tagged as Booked
      await prisma.leadTag.create({
        data: { label: tags['Booked'].label, color: tags['Booked'].color, callLogId: call.id },
      });
    }
    if (i % 11 === 0) {
      // ~9% tagged as Follow-Up
      await prisma.leadTag.create({
        data: { label: tags['Follow-Up'].label, color: tags['Follow-Up'].color, callLogId: call.id },
      });
    }
  }

  // Create some HVAC calls too
  for (let i = 0; i < 15; i++) {
    const daysAgo = Math.floor(Math.random() * 30);
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    date.setHours(Math.floor(Math.random() * 12) + 8, Math.floor(Math.random() * 60), 0, 0);

    await prisma.callLog.create({
      data: {
        accountId: hvac.id,
        trackingNumberId: tn4.id,
        callerNumber: callerNumbers[Math.floor(Math.random() * callerNumbers.length)],
        callerCity: 'Chicago',
        callerState: 'IL',
        duration: Math.floor(Math.random() * 200) + 15,
        callStatus: 'COMPLETED',
        twilioCallSid: `CA${Date.now()}${Math.random().toString(36).slice(2, 10)}hvac${i}`,
        whisperPlayed: `Call from Google Ads AC Repair`,
        createdAt: date,
      },
    });
  }

  // Create some form leads
  const formSources = [
    { utmSource: 'google', utmMedium: 'cpc', utmCampaign: 'Brand Campaign' },
    { utmSource: 'google', utmMedium: 'organic', utmCampaign: null },
    { utmSource: 'facebook', utmMedium: 'social', utmCampaign: 'Retargeting' },
  ];

  for (let i = 0; i < 12; i++) {
    const src = formSources[Math.floor(Math.random() * formSources.length)];
    const daysAgo = Math.floor(Math.random() * 30);
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);

    const formLead = await prisma.formLead.create({
      data: {
        accountId: plumber.id,
        formData: {
          name: `Customer ${i + 1}`,
          email: `customer${i + 1}@example.com`,
          phone: `+1555${String(Math.floor(Math.random() * 9000000) + 1000000)}`,
          message: 'I need a plumber for a leaky faucet.',
          service: ['Plumbing Repair', 'Drain Cleaning', 'Water Heater'][Math.floor(Math.random() * 3)],
        },
        pageUrl: 'https://abcplumbing.com/contact',
        utmSource: src.utmSource,
        utmMedium: src.utmMedium,
        utmCampaign: src.utmCampaign,
        referrer: src.utmMedium === 'organic' ? 'https://www.google.com' : null,
        createdAt: date,
      },
    });

    // Add tags to some form leads
    if (i % 3 === 0) {
      // ~33% tagged as Follow-Up
      await prisma.leadTag.create({
        data: { label: tags['Follow-Up'].label, color: tags['Follow-Up'].color, formLeadId: formLead.id },
      });
    } else if (i % 5 === 0) {
      // ~20% tagged as Qualified
      await prisma.leadTag.create({
        data: { label: tags['Qualified'].label, color: tags['Qualified'].color, formLeadId: formLead.id },
      });
    }
  }

  // Spend entries
  for (let i = 0; i < 30; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    date.setHours(0, 0, 0, 0);

    await prisma.spendEntry.create({
      data: {
        accountId: plumber.id,
        source: 'Google Ads',
        medium: 'cpc',
        campaign: 'Brand Campaign',
        date,
        spend: Math.round((Math.random() * 80 + 20) * 100) / 100,
        clicks: Math.floor(Math.random() * 40) + 5,
        impressions: Math.floor(Math.random() * 500) + 100,
      },
    });
  }

  console.log('Seed complete!');
  console.log(`  Organization: ${org.name} (${org.id})`);
  console.log(`  User: ${user.email} / password123`);
  console.log(`  Accounts: ${plumber.name}, ${hvac.name}`);
  console.log(`  Tracking numbers: 7 (4 static + 3 DNI pool)`);
  console.log(`  Call logs: ~60 (with sample tags applied)`);
  console.log(`  Form leads: 12 (with sample tags applied)`);
  console.log(`  Preset tags: 8 (Qualified, Spam, Wrong Number, Booked, Missed, Follow-Up, Customer, Not Interested)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
