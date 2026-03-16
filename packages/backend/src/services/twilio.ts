import { getTwilioClient } from '../config/twilio';
import { env } from '../config/env';
import { prisma } from '../config/prisma';
import VoiceResponse from 'twilio/lib/twiml/VoiceResponse';

export async function searchAvailableNumbers(areaCode?: string, country = 'US') {
  const client = getTwilioClient();
  const numbers = await client.availablePhoneNumbers(country).local.list({
    areaCode: areaCode ? parseInt(areaCode) : undefined,
    voiceEnabled: true,
    smsEnabled: true,
    limit: 10,
  });
  return numbers.map((n) => ({
    phoneNumber: n.phoneNumber,
    friendlyName: n.friendlyName,
    locality: n.locality,
    region: n.region,
  }));
}

export async function provisionNumber(phoneNumber: string, accountId: string, source: string, medium: string, campaignTag?: string, friendlyName?: string, isDNIPool = false) {
  const client = getTwilioClient();
  const webhookBase = env.TWILIO_WEBHOOK_BASE_URL;

  const purchased = await client.incomingPhoneNumbers.create({
    phoneNumber,
    voiceUrl: `${webhookBase}/api/webhooks/twilio/voice`,
    voiceMethod: 'POST',
    statusCallback: `${webhookBase}/api/webhooks/twilio/status`,
    statusCallbackMethod: 'POST',
  });

  const trackingNumber = await prisma.trackingNumber.create({
    data: {
      phoneNumber: purchased.phoneNumber,
      friendlyName: friendlyName || `${source} | ${campaignTag || medium}`,
      source,
      medium,
      campaignTag: campaignTag || null,
      twilioSid: purchased.sid,
      isDNIPool,
      accountId,
    },
  });

  return trackingNumber;
}

export function buildTwiML(forwardTo: string, whisperMessage: string, recordCalls = true): string {
  const response = new VoiceResponse();

  // Whisper to the agent before connecting
  const dial = response.dial({
    record: recordCalls ? 'record-from-answer-dual' : 'do-not-record',
    recordingStatusCallback: `${env.TWILIO_WEBHOOK_BASE_URL}/api/webhooks/twilio/recording`,
    recordingStatusCallbackMethod: 'POST',
    timeout: 30,
    action: `${env.TWILIO_WEBHOOK_BASE_URL}/api/webhooks/twilio/status`,
    method: 'POST',
  });

  dial.number(
    {
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      statusCallback: `${env.TWILIO_WEBHOOK_BASE_URL}/api/webhooks/twilio/status`,
      statusCallbackMethod: 'POST',
      url: `${env.TWILIO_WEBHOOK_BASE_URL}/api/webhooks/twilio/whisper?message=${encodeURIComponent(whisperMessage)}`,
      method: 'POST',
    },
    forwardTo
  );

  return response.toString();
}

export function buildWhisperTwiML(message: string): string {
  const response = new VoiceResponse();
  response.say({ voice: 'Polly.Joanna' }, message);
  return response.toString();
}

export async function releaseNumber(twilioSid: string) {
  const client = getTwilioClient();
  await client.incomingPhoneNumbers(twilioSid).remove();
}
