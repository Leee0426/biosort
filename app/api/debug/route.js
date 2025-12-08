// /app/api/debug/route.js
export async function GET(request) {
  console.log('Debug endpoint called');
  
  // Test environment variables
  const envVars = {
    ESP32_CONTROLLER_IP: process.env.ESP32_CONTROLLER_IP || 'NOT SET',
    NODE_ENV: process.env.NODE_ENV,
    VERCEL_ENV: process.env.VERCEL_ENV,
  };
  
  // Test DNS resolution
  let dnsTest = { success: false };
  try {
    const dns = await import('dns').then(module => module.promises);
    dnsTest = {
      success: true,
      resolved: 'DNS module available',
    };
  } catch (error) {
    dnsTest = {
      success: false,
      error: error.message,
    };
  }
  
  // Test network connectivity
  let networkTest = { success: false };
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch('http://192.168.100.9:80/test', {
      signal: controller.signal,
    });
    
    clearTimeout(timeout);
    networkTest = {
      success: true,
      status: response.status,
      statusText: response.statusText,
    };
  } catch (error) {
    networkTest = {
      success: false,
      error: error.message,
      code: error.code,
    };
  }
  
  const debugInfo = {
    timestamp: new Date().toISOString(),
    environment: envVars,
    dns: dnsTest,
    network: networkTest,
    request: {
      url: request.url,
      headers: Object.fromEntries(request.headers.entries()),
    },
  };
  
  return new Response(JSON.stringify(debugInfo, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}