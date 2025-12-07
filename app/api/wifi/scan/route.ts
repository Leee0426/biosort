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

    const networks = await scanNetworksViaDevice(deviceIp);
    return NextResponse.json({ networks });
  } catch (error) {
    console.error('Network scan failed:', error);
    return NextResponse.json(
      { error: 'Failed to scan networks' },
      { status: 500 }
    );
  }
}

async function scanNetworksViaDevice(deviceIp: string): Promise<any[]> {
  try {
    const response = await fetch(`http://${deviceIp}/scan`, {
      method: 'GET',
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      throw new Error(`Device returned ${response.status}`);
    }

    const data = await response.json();
    return data.networks || [];
  } catch (error) {
    throw new Error(`Cannot scan networks via device: ${error.message}`);
  }
}