import { NextApiRequest, NextApiResponse } from 'next';
import httpProxy from 'http-proxy';

const proxy = httpProxy.createProxyServer();

// Disable the default body parser
export const config = {
  api: {
    bodyParser: false,
  },
};

export default function handler(req, res) {
  // Get the target URL from query parameters
  const target = req.query.target;
  
  if (!target) {
    res.status(400).json({ error: 'Target parameter is required' });
    return;
  }

  return new Promise((resolve, reject) => {
    // Proxy the request to the ESP32
    proxy.web(req, res, { target, changeOrigin: true }, (err) => {
      if (err) {
        return reject(err);
      }
      resolve();
    });
  });
}