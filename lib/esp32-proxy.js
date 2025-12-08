// /lib/esp32-proxy.js

/**
 * Helper function to make ESP32 API calls
 * Automatically uses proxy in production, direct connection in development
 */
export const fetchESP32 = async (endpoint, options = {}) => {
  const isProduction = process.env.NODE_ENV === 'production';
  
  let baseUrl;
  
  if (isProduction) {
    // In production, use the proxy
    baseUrl = '/api/esp32';
  } else {
    // In development, allow direct connection (if controllerIP is available)
    // We'll need to get the controller IP from localStorage
    if (typeof window !== 'undefined') {
      const controllerIP = localStorage.getItem('controllerIP') || '192.168.1.101';
      baseUrl = `http://${controllerIP}`;
    } else {
      // Server-side fallback
      baseUrl = '/api/esp32';
    }
  }
  
  const url = `${baseUrl}/${endpoint}`;
  
  // Add timeout to prevent hanging requests
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    
    // Handle specific errors
    if (error.name === 'AbortError') {
      throw new Error('Request timeout: ESP32 controller not responding');
    }
    
    // For development, fall back to direct connection if proxy fails
    if (isProduction) {
      throw error; // In production, just throw the error
    } else {
      // Try direct connection as fallback in development
      console.log('Proxy failed, trying direct connection...');
      const controllerIP = localStorage.getItem('controllerIP');
      if (controllerIP) {
        try {
          const directUrl = `http://${controllerIP}/${endpoint}`;
          const directResponse = await fetch(directUrl, {
            ...options,
            signal: controller.signal,
            headers: {
              'Content-Type': 'application/json',
              ...options.headers,
            },
          });
          
          if (!directResponse.ok) {
            throw new Error(`Direct connection failed: HTTP ${directResponse.status}`);
          }
          
          return await directResponse.json();
        } catch (directError) {
          throw new Error(`Both proxy and direct connection failed: ${directError.message}`);
        }
      }
      
      throw error;
    }
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
 * Test controller connection
 */
export const testControllerConnection = async (controllerIP = null) => {
  // If controllerIP is provided, use it directly
  if (controllerIP && process.env.NODE_ENV !== 'production') {
    try {
      const response = await fetch(`http://${controllerIP}/status`);
      return response.ok;
    } catch (error) {
      return false;
    }
  }
  
  // Otherwise use the proxy
  try {
    await getStatus();
    return true;
  } catch (error) {
    return false;
  }
};