import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { deviceIp } = await request.json();

    if (!deviceIp) {
      return NextResponse.json(
        { error: 'Device IP is required' },
        { status: 400 }
      );
    }

    // Send disconnect command to ESP32
    const result = await sendDisconnectCommand(deviceIp);
    
    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json({ 
      message: 'Disconnect command sent to device',
      rebootRequired: true
    });

  } catch (error) {
    return NextResponse.json(
      { error: 'Disconnect failed' },
      { status: 500 }
    );
  }
}

async function sendDisconnectCommand(deviceIp: string): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`http://${deviceIp}/disconnect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(5000)
    });

    if (response.ok) {
      return { success: true };
    } else {
      return { success: false, error: 'Device rejected disconnect command' };
    }
  } catch (error) {
    return { success: false, error: `Cannot communicate with device: ${error.message}` };
  }
}