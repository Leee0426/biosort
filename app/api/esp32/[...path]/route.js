// /app/api/esp32/[...path]/route.js
export const dynamic = 'force-dynamic'; // Ensure this is dynamic
export const runtime = 'nodejs'; // Use Node.js runtime for better compatibility

// Handle all HTTP methods
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

export async function PATCH(request, { params }) {
  return handleProxyRequest(request, params);
}

export async function HEAD(request, { params }) {
  return handleProxyRequest(request, params);
}

export async function OPTIONS(request) {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
      'Access-Control-Max-Age': '86400',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Expose-Headers': 'Content-Length, Content-Range',
    },
  });
}

// Configuration
const ESP32_IP = process.env.ESP32_CONTROLLER_IP || '192.168.100.9';
const ESP32_PORT = 80;
const PROXY_TIMEOUT = 10000; // 10 second timeout
const MAX_RETRIES = 2;

// Create a custom fetch with timeout and retry logic
async function fetchWithTimeoutAndRetry(url, options = {}, retries = MAX_RETRIES) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PROXY_TIMEOUT);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      // Don't follow redirects automatically
      redirect: 'manual',
    });

    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);

    // Retry on network errors
    if (retries > 0 && (
      error.name === 'AbortError' || // Timeout
      error.name === 'TypeError' ||  // Network error
      error.code === 'ECONNREFUSED' ||
      error.code === 'ECONNRESET' ||
      error.code === 'ETIMEDOUT'
    )) {
      console.log(`Retrying request to ${url}, ${retries} attempts left...`);
      // Wait a bit before retrying
      await new Promise(resolve => setTimeout(resolve, 1000));
      return fetchWithTimeoutAndRetry(url, options, retries - 1);
    }

    throw error;
  }
}

async function handleProxyRequest(request, { params }) {
  const { path } = params;
  const endpoint = Array.isArray(path) ? path.join('/') : path;
  
  // Build the target URL
  const targetUrl = `http://${ESP32_IP}:${ESP32_PORT}/${endpoint}`;
  
  // Get request method
  const method = request.method;
  
  // Prepare headers for forwarding
  const headers = new Headers(request.headers);
  
  // Remove headers that shouldn't be forwarded
  headers.delete('host');
  headers.delete('connection');
  headers.delete('accept-encoding');
  headers.delete('cf-connecting-ip');
  headers.delete('cf-ray');
  headers.delete('cf-visitor');
  headers.delete('cf-ipcountry');
  headers.delete('x-forwarded-for');
  headers.delete('x-forwarded-host');
  headers.delete('x-forwarded-proto');
  
  // Add ESP32-specific headers if needed
  if (!headers.has('User-Agent')) {
    headers.set('User-Agent', 'Vercel-Proxy/1.0');
  }
  
  // Set Accept header if not present
  if (!headers.has('Accept')) {
    headers.set('Accept', '*/*');
  }
  
  // Handle CORS preflight
  if (method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
        'Access-Control-Max-Age': '86400',
        'Access-Control-Allow-Credentials': 'true',
      },
    });
  }

  try {
    console.log(`[${new Date().toISOString()}] Proxy: ${method} ${targetUrl}`);
    
    // Get request body for non-GET/HEAD requests
    let body = null;
    if (method !== 'GET' && method !== 'HEAD') {
      // Try to get body as text first
      try {
        const text = await request.text();
        if (text && text.length > 0) {
          body = text;
          // If no content-type is set, default to application/json
          if (!headers.has('Content-Type')) {
            headers.set('Content-Type', 'application/json');
          }
        }
      } catch (error) {
        console.log('No body or error reading body:', error.message);
      }
    }

    // Make the request to ESP32
    const response = await fetchWithTimeoutAndRetry(targetUrl, {
      method,
      headers,
      body,
      // Don't follow redirects - handle them manually
      redirect: 'manual',
    });

    // Get response data
    let responseData;
    const contentType = response.headers.get('content-type') || 'text/plain';
    
    // Handle different content types
    if (contentType.includes('application/json')) {
      responseData = await response.text();
      try {
        // Try to parse to validate JSON
        JSON.parse(responseData);
      } catch (e) {
        console.warn('Response is not valid JSON, sending as text');
      }
    } else if (contentType.includes('text/html') || contentType.includes('text/plain')) {
      responseData = await response.text();
    } else {
      // For binary or unknown content types, try to get as array buffer
      try {
        responseData = await response.arrayBuffer();
      } catch (error) {
        console.warn('Failed to get array buffer, trying text:', error.message);
        responseData = await response.text();
      }
    }

    // Prepare response headers
    const responseHeaders = new Headers({
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Expose-Headers': 'Content-Length, Content-Range',
      'X-Proxy-Server': 'Vercel',
      'X-Target-URL': targetUrl,
    });

    // Copy other headers from ESP32 response
    const headersToCopy = [
      'cache-control',
      'expires',
      'last-modified',
      'etag',
      'content-length',
      'content-disposition',
      'location', // For redirects
    ];

    headersToCopy.forEach(header => {
      if (response.headers.has(header)) {
        responseHeaders.set(header, response.headers.get(header));
      }
    });

    // Handle redirects
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (location) {
        responseHeaders.set('location', location);
      }
    }

    // Log successful response
    console.log(`[${new Date().toISOString()}] Proxy Success: ${method} ${targetUrl} -> ${response.status}`);
    
    // Return the proxied response
    return new Response(responseData, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });

  } catch (error) {
    console.error(`[${new Date().toISOString()}] Proxy Error: ${method} ${targetUrl}`, error);
    
    // Determine error type and status code
    let statusCode = 502;
    let errorMessage = 'Failed to connect to ESP32 controller';
    
    if (error.name === 'AbortError') {
      statusCode = 504;
      errorMessage = 'Request timeout - ESP32 controller not responding';
    } else if (error.code === 'ECONNREFUSED') {
      statusCode = 503;
      errorMessage = 'Connection refused - ESP32 controller may be offline';
    } else if (error.code === 'ENOTFOUND') {
      statusCode = 502;
      errorMessage = 'Cannot resolve ESP32 controller address';
    }
    
    return new Response(JSON.stringify({
      error: errorMessage,
      message: error.message,
      targetUrl,
      timestamp: new Date().toISOString(),
      help: 'Check if ESP32 is online and accessible from the internet, or configure ESP32_CONTROLLER_IP environment variable',
    }), {
      status: statusCode,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
        'Access-Control-Allow-Credentials': 'true',
        'X-Proxy-Error': 'true',
      },
    });
  }
}

// Health check endpoint (when no path is provided)
export async function GET(request, { params }) {
  const { path } = params;
  
  // If no specific path, return health status
  if (!path || path.length === 0 || (path.length === 1 && path[0] === '')) {
    return new Response(JSON.stringify({
      status: 'online',
      service: 'ESP32 Proxy Server',
      timestamp: new Date().toISOString(),
      endpoints: {
        proxy: '/api/esp32/{endpoint}',
        health: '/api/esp32',
        test: '/api/esp32/test',
      },
      environment: {
        esp32_ip: ESP32_IP,
        esp32_port: ESP32_PORT,
        node_env: process.env.NODE_ENV,
      },
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
        'Access-Control-Allow-Credentials': 'true',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  }
  
  // Otherwise, handle the proxy request
  return handleProxyRequest(request, params);
}