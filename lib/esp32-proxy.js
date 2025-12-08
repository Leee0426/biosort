// /lib/esp32-proxy.js

/**
 * Helper function to make ESP32 API calls
 * Automatically uses proxy in production, direct connection in development
 */
export const fetchESP32 = async (endpoint, options = {}) => {
  const isProduction = process.env.NODE_ENV === 'production';
  
  let baseUrl;
  
  if (isProduction) {
    // In production, use the Vercel proxy
    baseUrl = '/api/esp32';
  } else {
    // In development, allow direct connection (if controllerIP is available)
    if (typeof window !== 'undefined') {
      // Check if we're in browser environment
      const controllerIP = localStorage.getItem('controllerIP') || '192.168.100.9';
      baseUrl = `http://${controllerIP}`;
    } else {
      // Server-side fallback in development
      baseUrl = 'http://192.168.100.9'; // Default ESP32 IP for dev
    }
  }
  
  // Clean endpoint - remove leading slash if present
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint.substring(1) : endpoint;
  const url = `${baseUrl}/${cleanEndpoint}`;
  
  console.log(`ESP32 Request: ${url}`, { isProduction, baseUrl });
  
  // Add timeout to prevent hanging requests
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...options.headers,
      },
      // Important: Don't cache ESP32 responses
      cache: 'no-cache',
      mode: 'cors',
      credentials: 'omit',
    });
    
    clearTimeout(timeoutId);
    
    // Check if response is ok
    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      
      try {
        const errorData = await response.text();
        if (errorData) {
          errorMessage += ` - ${errorData.substring(0, 100)}`;
        }
      } catch (e) {
        // Ignore errors in reading error response
      }
      
      throw new Error(errorMessage);
    }
    
    // Try to parse as JSON
    const contentType = response.headers.get('content-type') || '';
    
    if (contentType.includes('application/json')) {
      try {
        return await response.json();
      } catch (jsonError) {
        console.warn('Failed to parse JSON response:', jsonError);
        // Fall back to text
        const text = await response.text();
        throw new Error(`Invalid JSON response: ${text.substring(0, 100)}`);
      }
    } else {
      // Return as text for non-JSON responses
      return await response.text();
    }
  } catch (error) {
    clearTimeout(timeoutId);
    
    // Handle specific errors
    if (error.name === 'AbortError') {
      throw new Error('Request timeout: ESP32 controller not responding');
    }
    
    // Handle network errors
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      if (isProduction) {
        throw new Error('Network error: Cannot connect to ESP32 controller via proxy');
      } else {
        throw new Error('Network error: Cannot connect to ESP32 controller directly. Check if ESP32 is online and IP is correct.');
      }
    }
    
    // Re-throw other errors
    throw error;
  }
};

/**
 * Send command to ESP32 controller
 */
export const sendCommand = async (command, params = {}) => {
  return fetchESP32('control', {
    method: 'POST',
    body: JSON.stringify({ command, ...params }),
  });
};

/**
 * Get ESP32 status
 */
export const getStatus = async () => {
  return fetchESP32('status');
};

/**
 * Get sensor data
 */
export const getSensorData = async () => {
  return fetchESP32('sensor');
};

/**
 * Get bin capacity data
 */
export const getBinCapacity = async () => {
  return fetchESP32('bins');
};

/**
 * Test ESP32 connection
 */
export const testESP32Connection = async () => {
  try {
    const response = await fetchESP32('test', {
      method: 'GET',
      headers: {
        'Cache-Control': 'no-cache',
      },
    });
    return {
      connected: true,
      data: response,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      connected: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    };
  }
};

/**
 * Test proxy connection specifically
 */
export const testProxyConnection = async () => {
  try {
    // Try to reach the proxy health endpoint
    const response = await fetch('/api/esp32', {
      method: 'GET',
      headers: {
        'Cache-Control': 'no-cache',
      },
    });
    
    if (!response.ok) {
      throw new Error(`Proxy health check failed: ${response.status}`);
    }
    
    const data = await response.json();
    return {
      proxyOnline: true,
      data,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      proxyOnline: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    };
  }
};

/**
 * Update ESP32 controller IP for development
 */
export const updateControllerIP = (ip) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem('controllerIP', ip);
    console.log(`Updated controller IP to: ${ip}`);
  }
};

/**
 * Get current controller IP for development
 */
export const getControllerIP = () => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('controllerIP') || '192.168.100.9';
  }
  return '192.168.100.9';
};