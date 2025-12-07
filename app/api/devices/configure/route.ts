import { NextResponse } from 'next/server';

const activeConfigs = new Map();

function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function POST(request: Request) {
  try {
    const { deviceIp, ssid, password } = await request.json();

    if (!deviceIp || !ssid) {
      return NextResponse.json(
        { error: 'Device IP and SSID are required' },
        { status: 400 }
      );
    }

    const otp = generateOTP();
    console.log(`Generated OTP for ${deviceIp}: ${otp}`);
    
    // Send configuration to device WITH the OTP
    const result = await sendConfiguration(deviceIp, ssid, password, otp);
    
    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
      );
    }

    // Store configuration with the OTP we generated
    activeConfigs.set(deviceIp, {
      otp,
      ssid,
      password,
      timestamp: Date.now()
    });

    console.log(`Stored configuration for ${deviceIp}, OTP: ${otp}`);

    return NextResponse.json({ 
      message: 'Configuration sent to device',
      otp: otp
    });

  } catch (error) {
    console.error('Configuration failed:', error);
    return NextResponse.json(
      { error: 'Configuration failed' },
      { status: 500 }
    );
  }
}

async function sendConfiguration(deviceIp: string, ssid: string, password: string, otp: string): Promise<{ success: boolean; error?: string }> {
  try {
    const configPayload = {
      ssid,
      password,
      otp  // Send the OTP to the ESP32
    };

    console.log(`Sending to ${deviceIp}:`, configPayload);

    const response = await fetch(`http://${deviceIp}/configure`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'User-Agent': 'ESP32-Config/1.0'
      },
      body: JSON.stringify(configPayload),
      signal: AbortSignal.timeout(15000) // Increased timeout
    });

    if (response.ok) {
      const responseData = await response.json();
      console.log(`Device response:`, responseData);
      return { success: true };
    } else {
      const errorText = await response.text();
      console.error(`Device error response: ${errorText}`);
      return { success: false, error: `Device returned ${response.status}: ${errorText}` };
    }
  } catch (error: any) {
    console.error(`Device communication failed:`, error);
    return { success: false, error: `Device communication failed: ${error.message}` };
  }
}