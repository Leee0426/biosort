// /app/api/esp32/[...path]/route.js
export const dynamic = 'force-dynamic'; // Ensure this is dynamic

export async function GET(request, { params }) {
  return handleProxyRequest(request, params);
}

export async function POST(request, { params }) {
  return handleProxyRequest(request, params);
}

export async function PUT(request, { params }) {
  return handleProxyRequest(request, params);
}

export async function DELETE(request, { params }) {
  return handleProxyRequest(request, params);
}

export async function OPTIONS(request) {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  });
}

async function handleProxyRequest(request, { params }) {
  const { path } = params;
  const endpoint = Array.isArray(path) ? path.join('/') : path;
  
  // Get ESP32 IP from environment variable or default
  const esp32IP = process.env.ESP32_CONTROLLER_IP || '192.168.1.101';
  
  // Build the target URL
  const targetUrl = `http://${esp32IP}/${endpoint}`;
  
  // Get request method and headers
  const method = request.method;
  const headers = new Headers(request.headers);
  
  // Remove host header (will be set by fetch)
  headers.delete('host');
  
  try {
    console.log(`Proxy: ${method} ${targetUrl}`);
    
    const response = await fetch(targetUrl, {
      method,
      headers,
      body: method !== 'GET' && method !== 'HEAD' ? await request.text() : undefined,
      redirect: 'follow',
    });
    
    // Get response data
    const data = await response.text();
    
    // Return the response
    return new Response(data, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
    
  } catch (error) {
    console.error('Proxy error:', error);
    
    return new Response(JSON.stringify({
      error: 'Failed to connect to ESP32 controller',
      message: error.message,
      targetUrl,
    }), {
      status: 502,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}