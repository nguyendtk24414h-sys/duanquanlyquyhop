const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const fetch = require('node-fetch');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

dotenv.config();

const app = express();
// Security headers
app.use(helmet());

// CORS: allow local development origins, explicit origins, and Firebase hosting domains
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:5500,http://127.0.0.1:5500,http://localhost:3000,http://127.0.0.1:3000,http://localhost:8080,http://127.0.0.1:8080').split(',').map((origin) => origin.trim()).filter(Boolean);

function isLocalDevOrigin(origin) {
  try {
    const parsed = new URL(origin);
    return ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
  } catch {
    return false;
  }
}

function isFirebaseHostingOrigin(origin) {
  try {
    const parsed = new URL(origin);
    return parsed.hostname.endsWith('.firebaseapp.com') || parsed.hostname.endsWith('.web.app');
  } catch {
    return false;
  }
}

app.use(cors({
  origin: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}));
app.options('*', cors());

app.use(express.json({ limit: '25mb' }));

// Serve frontend files when app is hosted as a single service
app.use(express.static(path.join(__dirname)));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Rate limiter (general)
const generalLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300 });
app.use(generalLimiter);

const PINATA_JWT = process.env.PINATA_JWT;
const PINATA_API_KEY = process.env.PINATA_API_KEY;
const PINATA_API_SECRET = process.env.PINATA_API_SECRET;
const PORT = process.env.PORT || 3000;

if (!PINATA_JWT && (!PINATA_API_KEY || !PINATA_API_SECRET)) {
  console.warn('Pinata credentials are missing. Set PINATA_JWT or PINATA_API_KEY + PINATA_API_SECRET.');
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
