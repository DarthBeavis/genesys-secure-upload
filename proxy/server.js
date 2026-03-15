require('dotenv').config();
const express  = require('express');
const multer   = require('multer');
const FormData = require('form-data');
const fetch    = require('node-fetch');
const cors     = require('cors');

const app    = express();
const upload = multer({ storage: multer.memoryStorage() });

// ── CONFIG ──────────────────────────────────────────────────────
const PORT         = process.env.PORT || 3000;
const API_URL      = process.env.API_URL      || 'https://api.dev.rbfcu.org/genesys-chat/upload/document';
const API_USERNAME = process.env.API_USERNAME || 'genesysapiuser';
const API_PASSWORD = process.env.API_PASSWORD; // required — set in .env

if (!API_PASSWORD) {
  console.error('ERROR: API_PASSWORD is not set in .env — server will not start.');
  process.exit(1);
}

// ── CORS — allow the customer portal HTML to call this proxy ────
app.use(cors());

// ── HEALTH CHECK ────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// ── UPLOAD PROXY ────────────────────────────────────────────────
// POST /proxy/upload
//   multipart/form-data fields: identifierType, identifier, files
//
// Forwards to customer API with Basic Auth added server-side.
// Returns the API response JSON directly to the caller.
app.post('/proxy/upload', upload.single('files'), async (req, res) => {
  console.log(`[proxy] Upload request — identifierType=${req.body.identifierType} identifier=${req.body.identifier} file=${req.file?.originalname}`);

  // Validate required fields
  const { identifierType, identifier } = req.body;
  if (!identifierType || !identifier || !req.file) {
    return res.status(400).json({
      requestId: null,
      errors: [{ code: 'MISSING_FIELDS', message: 'identifierType, identifier, and files are all required.' }]
    });
  }

  // Build multipart form for the upstream API
  const form = new FormData();
  form.append('identifierType', identifierType);
  form.append('identifier',     identifier);
  form.append('files',          req.file.buffer, {
    filename:    req.file.originalname,
    contentType: req.file.mimetype
  });

  const basicAuth = Buffer.from(`${API_USERNAME}:${API_PASSWORD}`).toString('base64');

  try {
    const upstream = await fetch(API_URL, {
      method:  'POST',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        ...form.getHeaders()
      },
      body: form
    });

    let data;
    try { data = await upstream.json(); }
    catch (_) { data = { status: 'FAILED', errors: [{ code: `HTTP_${upstream.status}`, message: 'Non-JSON response from upstream API' }] }; }

    console.log(`[proxy] Upstream response ${upstream.status}:`, JSON.stringify(data));
    res.status(upstream.status).json(data);

  } catch (err) {
    console.error('[proxy] Upstream fetch error:', err.message);
    res.status(502).json({
      requestId: null,
      errors: [{ code: 'PROXY_ERROR', message: `Could not reach upstream API: ${err.message}` }]
    });
  }
});

app.listen(PORT, () => {
  console.log(`[proxy] Running on http://localhost:${PORT}`);
  console.log(`[proxy] Forwarding to: ${API_URL}`);
  console.log(`[proxy] Username: ${API_USERNAME}`);
});
