import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import twilio from 'twilio';

const activeConfigs = new Map();

// Email configuration
const emailTransporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD,
  },
});

// Twilio configuration (for SMS)
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// Generate random OTP
function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Send OTP via Email
async function sendEmailOTP(email: string, otp: string): Promise<boolean> {
  try {
    await emailTransporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Your ESP32-CAM WiFi Configuration OTP',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">ESP32-CAM WiFi Configuration</h2>
          <p>Your One-Time Password (OTP) for configuring your ESP32-CAM device is:</p>
          <div style="background: #f4f4f4; padding: 15px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 5px; margin: 20px 0;">
            ${otp}
          </div>
          <p>This OTP will expire in 10 minutes.</p>
          <p>If you didn't request this, please ignore this email.</p>
        </div>
      `,
    });
    return true;
  } catch (error) {
    console.error('Failed to send email OTP:', error);
    return false;
  }
}

// Send OTP via SMS
async function sendSMSOTP(phoneNumber: string, otp: string): Promise<boolean> {
  try {
    await twilioClient.messages.create({
      body: `Your ESP32-CAM configuration OTP is: ${otp}. It will expire in 10 minutes.`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phoneNumber,
    });
    return true;
  } catch (error) {
    console.error('Failed to send SMS OTP:', error);
    return false;
  }
}

// Clean up old configurations
function cleanupOldConfigs() {
  const now = Date.now();
  for (const [ip, config] of activeConfigs.entries()) {
    if (now - config.timestamp > 10 * 60 * 1000) { // 10 minutes
      activeConfigs.delete(ip);
      console.log(`Cleaned up old config for ${ip}`);
    }
  }
}

export async function POST(request: Request) {
  try {
    const { deviceIp, contact, contactType, ssid, password } = await request.json();

    if (!deviceIp || !contact || !contactType || !ssid) {
      return NextResponse.json(
        { error: 'Device IP, contact info, contact type, and SSID are required' },
        { status: 400 }
      );
    }

    // Clean up old configs first
    cleanupOldConfigs();

    // Generate OTP
    const otp = generateOTP();
    
    // Send OTP based on contact type
    let otpSent = false;
    
    if (contactType === 'email') {
      otpSent = await sendEmailOTP(contact, otp);
    } else if (contactType === 'sms') {
      otpSent = await sendSMSOTP(contact, otp);
    }

    if (!otpSent) {
      return NextResponse.json(
        { error: 'Failed to send OTP. Please check your contact information.' },
        { status: 500 }
      );
    }

    // Store configuration with timestamp
    activeConfigs.set(deviceIp, {
      otp,
      ssid,
      password: password || '',
      contact,
      contactType,
      timestamp: Date.now()
    });

    console.log(`OTP ${otp} sent to ${contactType}: ${contact} for device ${deviceIp}`);

    return NextResponse.json({ 
      message: 'OTP sent successfully',
      contactType,
      contact: contact.replace(/(.{2})(.+)(.{2})/, '$1****$3') // Mask contact info
    });

  } catch (error) {
    console.error('Configuration failed:', error);
    return NextResponse.json(
      { error: 'Configuration failed' },
      { status: 500 }
    );
  }
}