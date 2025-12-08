import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  // Get the full URL path after /api/esp32/
  const url = new URL(request.url);
  const pathname = url.pathname;
  const endpoint = pathname.replace('/api/esp32/', '');
  
  console.log(`Proxy request to endpoint: ${endpoint}`);
  
  // Handle root endpoint
  if (!endpoint || endpoint === '') {
    return NextResponse.json({
      status: 'online',
      message: 'ESP32 Proxy is working',
      usage: 'Use /api/esp32/{esp32-endpoint}',
      example: '/api/esp32/status'
    });
  }
  
  // Forward to ESP32
  const ESP32_IP = process.env.ESP32_CONTROLLER_IP || '192.168.100.9';
  const targetUrl = `http://${ESP32_IP}/${endpoint}`;
  
  try {
    const response = await fetch(targetUrl, {
      signal: AbortSignal.timeout(10000),
    });
    
    const data = await response.text();
    
    return new NextResponse(data, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
    
  } catch (error) {
    return NextResponse.json({
      error: 'Failed to connect to ESP32',
      details: error.message,
      targetUrl,
      help: 'Make sure ESP32 is running and accessible',
    }, { status: 502 });
  }
}

// Handle POST requests too
export async function POST(request) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const endpoint = pathname.replace('/api/esp32/', '');
  
  const ESP32_IP = process.env.ESP32_CONTROLLER_IP || '192.168.100.9';
  const targetUrl = `http://${ESP32_IP}/${endpoint}`;
  
  try {
    const body = await request.text();
    
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: body,
      signal: AbortSignal.timeout(10000),
    });
    
    const data = await response.text();
    
    return new NextResponse(data, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
    
  } catch (error) {
    return NextResponse.json({
      error: 'Failed to connect to ESP32',
      details: error.message,
      targetUrl,
    }, { status: 502 });
  }
}