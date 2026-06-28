const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const fetch = require('node-fetch');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

dotenv.config();

const app = express();
// Security headers
// Disable Helmet's default Content Security Policy so the frontend can load
// external CDN scripts and run inline bootstrap code used by the SPA.
// We still keep other Helmet protections enabled.
// Disable Helmet's default Content Security Policy and cross-origin embedder
// policies so the SPA can load CDN scripts and resources when served from
// the proxy. We keep other Helmet protections enabled.
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false,
  originAgentCluster: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// Explicitly set a permissive Content-Security-Policy to allow CDN scripts
// and necessary inline bootstrap code used by the SPA. This overrides any
// restrictive CSP that may be applied by intermediaries or the browser.
app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', "default-src 'self' https: data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com https://cdn.jsdelivr.net https://www.gstatic.com https://fonts.googleapis.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.tailwindcss.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: https:; connect-src 'self' https://api.pinata.cloud https://firestore.googleapis.com https://identitytoolkit.googleapis.com https://www.googleapis.com https://www.gstatic.com https://ethereum-sepolia-rpc.publicnode.com https://duanquanlyquyhop-production.up.railway.app; frame-src 'self' https://www.google.com; worker-src 'self' blob:; child-src 'self' blob:; object-src 'none';");
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  next();
});

// CORS: allow browser clients to call proxy endpoints.
// For production, replace `origin: true` with an explicit allowlist if needed.
app.use(cors({
  origin: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}));
app.options('*', cors());

app.use(express.json({ limit: '25mb' }));

// Serve frontend files when app is hosted as a single service
const frontendCandidates = [
  path.join(__dirname, 'frontend'),
  path.join(__dirname, '..', 'frontend')
];
const frontendDirectory = frontendCandidates.find((candidate) => fs.existsSync(candidate)) || path.join(__dirname, 'frontend');

app.use(express.static(frontendDirectory));
app.get('/', (req, res) => {
  res.sendFile(path.join(frontendDirectory, 'index.html'));
});

// Rate limiter (general)
const generalLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300 });
app.use(generalLimiter);

const PINATA_JWT = process.env.PINATA_JWT;
const PINATA_API_KEY = process.env.PINATA_API_KEY;
const PINATA_API_SECRET = process.env.PINATA_API_SECRET;
const PORT = process.env.PORT || 3000;

const FIREBASE_CONFIG = {
  apiKey: process.env.FIREBASE_API_KEY || '',
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || '',
  projectId: process.env.FIREBASE_PROJECT_ID || '',
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
  appId: process.env.FIREBASE_APP_ID || '',
  measurementId: process.env.FIREBASE_MEASUREMENT_ID || ''
};

if (!PINATA_JWT && (!PINATA_API_KEY || !PINATA_API_SECRET)) {
  console.warn('Pinata credentials are missing. Set PINATA_JWT or PINATA_API_KEY + PINATA_API_SECRET.');
}

if (!FIREBASE_CONFIG.apiKey) {
  console.warn('Firebase config is incomplete. Set FIREBASE_API_KEY and related env variables.');
}

function buildPinataHeaders() {
  if (PINATA_JWT) {
    return {
      Authorization: `Bearer ${PINATA_JWT}`,
      'Content-Type': 'application/json'
    };
  }

  return {
    'pinata_api_key': PINATA_API_KEY,
    'pinata_secret_api_key': PINATA_API_SECRET,
    'Content-Type': 'application/json'
  };
}

app.get('/config/firebase', (req, res) => {
  res.json(FIREBASE_CONFIG);
});

app.post('/api/pinata/pin-json', async (req, res) => {
  try {
    const { voteData } = req.body;
    if (!voteData || typeof voteData !== 'object') {
      return res.status(400).json({ error: 'voteData is required.' });
    }

    // Basic size validation to avoid huge payloads
    const size = Buffer.byteLength(JSON.stringify(voteData));
    if (size > 200 * 1024) {
      return res.status(413).json({ error: 'Payload too large' });
    }

    // Minimal required fields
    if (!voteData.id || !voteData.proposer) {
      return res.status(400).json({ error: 'voteData.id and voteData.proposer are required' });
    }

    const payload = {
      pinataMetadata: {
        name: voteData.id ? `vote-metadata-${voteData.id}` : 'vote-metadata',
        keyvalues: {
          proposer: voteData.proposer || 'unknown',
          proposerRole: voteData.proposerRole || 'unknown',
          status: voteData.status || 'unknown'
        }
      },
      pinataContent: voteData
    };

    const response = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
      method: 'POST',
      headers: buildPinataHeaders(),
      body: JSON.stringify(payload)
    });

    const resultText = await response.text();
    let result;
    try {
      result = JSON.parse(resultText);
    } catch (parseErr) {
      result = resultText || { error: 'Empty response from Pinata' };
    }

    if (!response.ok) {
      console.error('Pinata proxy returned error', response.status, result);
      return res.status(response.status).json({ error: result });
    }

    if (!result || !result.IpfsHash) {
      console.error('Pinata proxy missing IpfsHash:', result);
      return res.status(502).json({ error: 'Invalid response from Pinata', details: result });
    }

    return res.json({ cid: result.IpfsHash, ipfsUri: `ipfs://${result.IpfsHash}` });
  } catch (error) {
    console.error('Pinata pin-json error:', error);
    res.status(500).json({ error: error.message || 'Pinata upload failed.' });
  }
});

// Simulated Gemini OCR proxy endpoint (for local testing only)
app.post('/api/gemini/ocr', async (req, res) => {
  try {
    const { parts } = req.body || {};
    // If client sent image inlineData, we can inspect size or mimeType; for simulation return deterministic JSON
    const simulated = {
      amount: 150000,
      reason: "Mua van phong pham",
      confidence: 95
    };
    return res.json({ ocr: simulated });
  } catch (err) {
    console.error('Gemini proxy error:', err);
    return res.status(500).json({ error: 'Gemini proxy failed' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Pinata proxy server listening on port ${PORT}`);
});
