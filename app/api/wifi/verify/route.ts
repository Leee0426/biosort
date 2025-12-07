import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { deviceIp, serialCode } = await request.json();

    if (!deviceIp || !serialCode) {
      return NextResponse.json(
        { error: 'Device IP and serial code are required' },
        { status: 400 }
      );
    }

    console.log(`Verifying serial code for device ${deviceIp}: ${serialCode}`);

    // Try multiple IPs - the original and potential new one
    const ipAttempts = [
      deviceIp, // Original IP (192.168.4.1)
      '192.168.100.182', // The IP we see in serial monitor
      'esp32-cam.local' // mDNS name
    ];

    let lastError = '';
    
    for (const ip of ipAttempts) {
      try {
        console.log(`Trying to connect to ${ip}...`);
        
        const response = await fetch(`http://${ip}/verify`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            serialCode: serialCode
          }),
          signal: AbortSignal.timeout(5000) // Shorter timeout for multiple attempts
        });

        if (response.ok) {
          const result = await response.json();
          console.log(`✅ Success with IP ${ip}:`, result);
          
          return NextResponse.json({ 
            message: 'Device configured successfully',
            ip: ip,
            ssid: result.ssid
          });
        }
      } catch (error: any) {
        lastError = error.message;
        console.log(`❌ Failed with IP ${ip}:`, error.message);
        // Continue to next IP attempt
      }
    }

    // If all attempts failed
    return NextResponse.json(
      { error: `Cannot reach device. It may have switched networks. Last error: ${lastError}` },
      { status: 400 }
    );

  } catch (error: any) {
    console.error('Serial code verification failed:', error);
    return NextResponse.json(
      { error: `Verification failed: ${error.message}` },
      { status: 500 }
    );
  }
}