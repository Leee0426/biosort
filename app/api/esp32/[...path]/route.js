import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'edge'; // Try edge runtime instead of nodejs

// Handle all HTTP methods
export async function GET(request) {
  return handleRequest(request, 'GET');
}

export async function POST(request) {
  return handleRequest(request, 'POST');
}

export async function PUT(request) {
  return handleRequest(request, 'PUT');
}

export async function DELETE(request) {
  return handleRequest(request, 'DELETE');
}

export async function OPTIONS(request) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  });
}

async function handleRequest(request, method) {
  try {
    // Parse the URL to get the endpoint
    const url = new URL(request.url);
    const pathname = url.pathname;
    
    // Extract the endpoint after /api/esp32/
    let endpoint = '';
    if (pathname.startsWith('/api/esp32/')) {
      endpoint = pathname.substring('/api/esp32/'.length);
    }
    
    console.log(`Proxy: ${method} ${endpoint || '/'}`);
    
    // Handle root and test endpoints
    if (!endpoint || endpoint === '' || endpoint === 'test') {
      return NextResponse.json({
        status: 'online',
        service: 'ESP32 Proxy',
        timestamp: new Date().toISOString(),
        endpoint: endpoint || 'root',
        note: 'Use /api/esp32/{esp32-endpoint} to proxy to ESP32',
      }, {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-cache',
        },
      });
    }
    
    // Get ESP32 IP from environment
    const ESP32_IP = process.env.ESP32_CONTROLLER_IP || '192.168.100.9';
    const targetUrl = `http://${ESP32_IP}/${endpoint}`;
    
    console.log(`Forwarding to ESP32: ${targetUrl}`);
    
    // Prepare fetch options
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    
    const options = {
      method: method,
      headers: {},
      signal: controller.signal,
    };
    
    // Copy headers (excluding problematic ones)
    const headersToCopy = ['content-type', 'authorization', 'accept'];
    for (const [key, value] of request.headers.entries()) {
      if (headersToCopy.includes(key.toLowerCase())) {
        options.headers[key] = value;
      }
    }
    
    // Set default headers
    if (!options.headers['accept']) {
      options.headers['accept'] = '*/*';
    }
    if (!options.headers['user-agent']) {
      options.headers['user-agent'] = 'Vercel-Proxy/1.0';
    }
    
    // Add body for non-GET/HEAD requests
    if (method !== 'GET' && method !== 'HEAD') {
      try {
        const bodyText = await request.text();
        if (bodyText) {
          options.body = bodyText;
          if (!options.headers['content-type']) {
            options.headers['content-type'] = 'application/json';
          }
        }
      } catch (error) {
        console.log('No request body:', error.message);
      }
    }
    
    // Make the request to ESP32
    const response = await fetch(targetUrl, options);
    clearTimeout(timeoutId);
    
    // Get response data
    const responseText = await response.text();
    
    // Return the proxied response
    return new NextResponse(responseText, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
    
  } catch (error) {
    console.error('Proxy error:', error);
    
    return NextResponse.json({
      error: 'Proxy error',
      message: error.message,
      timestamp: new Date().toISOString(),
      suggestion: 'Check if ESP32 is running and accessible at the configured IP',
    }, {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}