import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { ip } = await request.json();
    
    if (!ip) {
      return NextResponse.json(
        { error: 'IP address is required' },
        { status: 400 }
      );
    }

    const device = await checkDevice(ip);
    
    if (device) {
      return NextResponse.json({ device });
    } else {
      return NextResponse.json(
        { error: 'No ESP32 device found at this IP' },
        { status: 404 }
      );
    }
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to connect to device' },
      { status: 500 }
    );
  }
}

async function checkDevice(ip: string): Promise<any> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`http://${ip}/info`, {
      method: 'GET',
      signal: controller.signal
    });
    
    clearTimeout(timeout);
    
    if (response.ok) {
      const data = await response.json();
      return {
        serial: data.serial || `ESP32_${ip}`,
        ip: ip,
        status: data.status || 'ready',
        type: 'ESP32-CAM',
        connection: data.connected_ssid ? 'sta' : 'ap',
        ap_ssid: data.connected_ssid ? undefined : 'ESP32-CAM-AP'
      };
    }
  } catch (error) {
    console.error(`Failed to check device at ${ip}:`, error);
  }
  return null;
}