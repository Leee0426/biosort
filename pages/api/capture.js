export default async function handler(req, res) {
  // Handle OPTIONS request for CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { ip, t } = req.query;

  if (!ip) {
    return res.status(400).json({ error: 'IP parameter required' });
  }

  try {
    console.log(`🔄 Proxying capture request to: ${ip}`);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
    
    const response = await fetch(`http://${ip}/capture?t=${t || Date.now()}`, {
      method: 'GET',
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Camera responded with status: ${response.status}`);
    }

    // Get the image data
    const arrayBuffer = await response.arrayBuffer();
    
    if (arrayBuffer.byteLength === 0) {
      throw new Error('Empty image received from camera');
    }

    // Set appropriate headers
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Convert ArrayBuffer to Buffer and send
    const buffer = Buffer.from(arrayBuffer);
    res.send(buffer);

    console.log(`✅ Successfully proxied image: ${buffer.length} bytes`);

  } catch (error) {
    console.error('❌ Capture proxy error:', error.message);
    
    if (error.name === 'AbortError') {
      res.status(504).json({ 
        error: 'Camera timeout',
        message: 'Camera took too long to respond'
      });
    } else {
      res.status(500).json({ 
        error: 'Failed to capture image',
        message: error.message
      });
    }
  }
}

export const config = {
  api: {
    responseLimit: false,
    bodyParser: false,
  },
};