import { NextApiRequest, NextApiResponse } from 'next';
import httpProxy from 'http-proxy';

const proxy = httpProxy.createProxyServer();

export const config = {
  api: {
    bodyParser: false,
    externalResolver: true,
  },
};

export default function handler(req, res) {
  // Extract the target URL from query parameters
  const target = req.query.target;
  
  if (!target) {
    return res.status(400).json({ error: 'Target parameter is required' });
  }

  return new Promise((resolve, reject) => {
    // Proxy the request to the ESP32-CAM
    proxy.web(req, res, { 
      target: target,
      changeOrigin: true,
      timeout: 10000 // 10 second timeout
    }, (err) => {
      if (err) {
        console.error('Proxy error:', err);
        return reject(err);
      }
      resolve();
    });
  });
}