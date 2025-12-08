// /app/api/esp32/[...path]/route.js
export const dynamic = 'force-dynamic';

// Handle OPTIONS requests for CORS
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

// Handle all other requests
export async function GET(request, { params }) {
  return handleProxyRequest(request, params, 'GET');
}

export async function POST(request, { params }) {
  return handleProxyRequest(request, params, 'POST');
}

export async function PUT(request, { params }) {
  return handleProxyRequest(request, params, 'PUT');
}

export async function DELETE(request, { params }) {
  return handleProxyRequest(request, params, 'DELETE');
}

async function handleProxyRequest(request, { params }, method) {
  console.log(`=== PROXY REQUEST START ===`);
  console.log(`Method: ${method}`);
  console.log(`URL: ${request.url}`);
  
  try {
    // Get path from params
    const { path = [] } = params;
    const endpoint = Array.isArray(path) ? path.join('/') : path || '';
    
    console.log(`Endpoint: "${endpoint}"`);
    
    // Get ESP32 IP - try multiple sources
    const ESP32_IP = process.env.ESP32_CONTROLLER_IP || '192.168.100.9';
    console.log(`ESP32 IP from env: ${ESP32_IP}`);
    
    // Special case for test endpoint
    if (endpoint === 'test' || endpoint === '') {
      console.log('Handling test/health endpoint');
      return new Response(JSON.stringify({
        status: 'online',
        message: 'ESP32 Proxy is working',
        timestamp: new Date().toISOString(),
        esp32_ip: ESP32_IP,
        endpoint: endpoint || 'root',
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-cache',
        },
      });
    }
    
    // Build target URL
    const targetUrl = `http://${ESP32_IP}/${endpoint}`;
    console.log(`Target URL: ${targetUrl}`);
    
    // Prepare fetch options
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
    
    const options = {
      method: method,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Vercel-Proxy/1.0',
      },
      signal: controller.signal,
    };
    
    // Add body for non-GET requests
    if (method !== 'GET') {
      try {
        const bodyText = await request.text();
        if (bodyText) {
          options.body = bodyText;
          options.headers['Content-Type'] = 'application/json';
        }
      } catch (error) {
        console.log('No body or error reading body:', error.message);
      }
    }
    
    console.log('Fetch options:', JSON.stringify(options, null, 2));
    
    // Make the request
    const response = await fetch(targetUrl, options);
    clearTimeout(timeoutId);
    
    console.log(`ESP32 Response Status: ${response.status} ${response.statusText}`);
    
    // Get response data
    const responseText = await response.text();
    console.log(`ESP32 Response (first 500 chars): ${responseText.substring(0, 500)}`);
    
    // Return the response
    return new Response(responseText, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'application/json',
        'Access-Control-Allow-Origin': '*',
        'X-Proxy': 'Vercel',
      },
    });
    
  } catch (error) {
    console.error('=== PROXY ERROR ===');
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error code:', error.code);
    console.error('Error stack:', error.stack);
    
    // Determine appropriate status code
    let statusCode = 500;
    let errorMessage = 'Internal server error';
    
    if (error.name === 'AbortError') {
      statusCode = 504;
      errorMessage = 'Request timeout - ESP32 not responding';
    } else if (error.message.includes('fetch failed') || error.message.includes('NetworkError')) {
      statusCode = 502;
      errorMessage = 'Network error - Cannot reach ESP32';
    }
    
    return new Response(JSON.stringify({
      error: errorMessage,
      details: error.message,
      timestamp: new Date().toISOString(),
      help: 'Check if ESP32 is online and accessible at the configured IP address',
    }), {
      status: statusCode,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } finally {
    console.log(`=== PROXY REQUEST END ===`);
  }
}