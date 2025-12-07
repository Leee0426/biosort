import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const devices = await discoverESP32Devices();
    return NextResponse.json({ devices });
  } catch (error) {
    console.error('Device discovery failed:', error);
    return NextResponse.json({ devices: [] });
  }
}

async function discoverESP32Devices(): Promise<any[]> {
  const devices: any[] = [];
  
  // Common ESP32 IPs to try (both AP and STA modes)
  const commonIPs = [
    '192.168.4.1',    // Default AP mode
    '192.168.1.100',
    '192.168.1.101',
    '192.168.1.102',
    '192.168.0.100',
    '192.168.0.101',
    '192.168.1.245',
    '192.168.1.246'
  ];

  // Try mDNS first
  try {
    const response = await fetch('http://esp32-cam.local/info', {
      method: 'GET',
      headers: {
        'User-Agent': 'ESP32-Discovery/1.0'
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      devices.push({
        serial: data.serial,
        ip: 'esp32-cam.local',
        status: data.status,
        type: 'ESP32-CAM',
        connection: data.connected_ssid ? 'sta' : 'ap',
        ap_ssid: data.connected_ssid ? undefined : 'ESP32-CAM-AP',
        discoveredVia: 'mDNS'
      });
    }
  } catch (error) {
    console.log('mDNS discovery failed:', error);
  }

  // Test common IPs in parallel with better error handling
  const promises = commonIPs.map(ip => checkDevice(ip));
  const results = await Promise.allSettled(promises);
  
  results.forEach((result, index) => {
    if (result.status === 'fulfilled' && result.value) {
      devices.push(result.value);
    }
  });

  return devices;
}

async function checkDevice(ip: string): Promise<any> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(`http://${ip}/info`, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'User-Agent': 'ESP32-Discovery/1.0'
      }
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
        ap_ssid: data.connected_ssid ? undefined : 'ESP32-CAM-AP',
        discoveredVia: 'IP Scan'
      };
    }
  } catch (error) {
    // Device not found at this IP - this is normal
  }
  return null;
}