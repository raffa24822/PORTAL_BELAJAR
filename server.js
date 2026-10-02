const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '12mb', strict: true }));
const PORT = Number(process.env.PORT || 3000);
const KEY = String(process.env.ASTS_SERVER_KEY || '');
const DATA_DIR = path.resolve(process.env.DATA_DIR || __dirname);
const DB_FILE = path.join(DATA_DIR, 'asts-data.json');
const ALLOWED = new Set(['ping', 'subjects', 'users', 'results']);
let db = Object.create(null);
let writeQueue = Promise.resolve();
try {
  if (fs.existsSync(DB_FILE)) {
    const loaded = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    if (loaded && typeof loaded === 'object' && !Array.isArray(loaded)) db = loaded;
  }
} catch (error) {
  console.error('Database file tidak bisa dibaca:', error.message);
  process.exit(1);
}
function sendError(res, status, message) { return res.status(status).json({ ok: false, error: message }); }
function auth(req, res, next) {
  if (!KEY) return sendError(res, 503, 'Server belum dikonfigurasi. Atur ASTS_SERVER_KEY di Environment hosting.');
  if (!req.get('x-asts-key') || req.get('x-asts-key') !== KEY) return sendError(res, 401, 'Kunci server salah atau belum diisi.');
  next();
}
function normalizeName(value) { return String(value || '').trim().toLocaleLowerCase('id-ID'); }
function resultKey(r) {
  if (r && r.id) return String(r.id);
  return [r && r.name, r && r.subject, r && r.date, r && r.time, r && r.score].map(v => String(v == null ? '' : v)).join('|');
}
function timeOf(item) { return Number(item && (item.updatedAt || item.timestamp || item.lastSeen) || 0); }
function mergeRecords(oldList, incomingList, keyFn) {
  const map = new Map();
  for (const item of [...(Array.isArray(oldList) ? oldList : []), ...(Array.isArray(incomingList) ? incomingList : [])]) {
    if (!item || typeof item !== 'object') continue;
    const key = keyFn(item);
    if (!key) continue;
    const previous = map.get(key);
    if (!previous || timeOf(item) >= timeOf(previous)) map.set(key, item);
  }
  return [...map.values()];
}
function mergeData(name, incoming) {
  if (name === 'subjects') return Array.isArray(incoming) ? incoming : [];
  if (name === 'users') return mergeRecords(db.users && db.users.data, incoming, u => normalizeName(u.name));
  if (name === 'results') return mergeRecords(db.results && db.results.data, incoming, resultKey);
  return incoming;
}
function persist() {
  const snapshot = JSON.stringify(db);
  writeQueue = writeQueue.then(async () => {
    await fs.promises.mkdir(DATA_DIR, { recursive: true });
    const tmp = DB_FILE + '.tmp';
    await fs.promises.writeFile(tmp, snapshot, { encoding: 'utf8', mode: 0o600 });
    await fs.promises.rename(tmp, DB_FILE);
  });
  return writeQueue;
}
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'ASTS', time: new Date().toISOString() }));
app.get('/', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, 'ASTS_KELAS_10.html'));
});
app.post('/asts_kelas10/reset-users.json', auth, async (req, res) => {
  if (!req.body || req.body.confirm !== 'RESET_ALL_STUDENT_ACCOUNTS') {
    return sendError(res, 400, 'Konfirmasi reset akun tidak valid.');
  }
  const resetAt = Date.now();
  const previousUsers = db.users || {};
  const previousNames = Array.isArray(previousUsers.data) ? previousUsers.data.map(user => normalizeName(user && user.name)).filter(Boolean) : [];
  const resetNames = [...new Set([...(Array.isArray(previousUsers.resetNames) ? previousUsers.resetNames.map(normalizeName) : []), ...previousNames])];
  db.users = { data: [], resetAt, resetNames, updatedAt: resetAt };
  try {
    await persist();
    return res.json({ ok: true, resetAt, message: 'Semua akun siswa berhasil direset.' });
  } catch (error) {
    console.error('Gagal menyimpan reset akun:', error.message);
    return sendError(res, 500, 'Reset akun belum berhasil disimpan. Periksa persistent disk hosting.');
  }
});
app.get('/asts_kelas10/:name.json', auth, (req, res) => {
  const name = req.params.name;
  if (!ALLOWED.has(name)) return sendError(res, 404, 'Data yang diminta tidak tersedia.');
  res.setHeader('Cache-Control', 'no-store');
  return res.json(db[name] === undefined ? null : db[name]);
});
app.put('/asts_kelas10/:name.json', auth, async (req, res) => {
  const name = req.params.name;
  if (!ALLOWED.has(name)) return sendError(res, 404, 'Data yang diminta tidak tersedia.');
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return sendError(res, 400, 'Format data tidak valid.');
  if (name === 'ping') {
    db.ping = { data: { ok: true }, updatedAt: Date.now() };
  } else {
    if (!Array.isArray(body.data)) return sendError(res, 400, 'Field data harus berupa daftar/array.');
    const previous = db[name] || {};
    let incomingData = body.data;
    if (name === 'users' && Number(previous.resetAt || 0) > 0) {
      const resetAt = Number(previous.resetAt);
      const resetNames = new Set((Array.isArray(previous.resetNames) ? previous.resetNames : []).map(normalizeName));
      // Tolak akun lama yang dikirim ulang oleh HP yang belum menerima sinyal reset.
      // Akun baru dengan nama sama diterima hanya jika createdAt lebih baru dari reset.
      incomingData = body.data.filter(user => !resetNames.has(normalizeName(user && user.name)) || Number(user && user.createdAt || 0) > resetAt);
    }
    db[name] = {
      data: mergeData(name, incomingData),
      updatedAt: Date.now(),
      ...(name === 'users' && previous.resetAt ? { resetAt: previous.resetAt, resetNames: previous.resetNames || [] } : {})
    };
  }
  try {
    await persist();
    return res.json({ ok: true, name, count: name === 'ping' ? 1 : db[name].data.length, updatedAt: Date.now() });
  } catch (error) {
    console.error('Gagal menyimpan database:', error.message);
    return sendError(res, 500, 'Data belum berhasil disimpan. Periksa persistent disk hosting.');
  }
});
app.use((error, _req, res, _next) => {
  if (error && error.type === 'entity.too.large') return sendError(res, 413, 'Data terlalu besar untuk dikirim.');
  if (error instanceof SyntaxError) return sendError(res, 400, 'JSON tidak valid.');
  console.error(error);
  return sendError(res, 500, 'Terjadi kesalahan pada server.');
});
app.listen(PORT, '0.0.0.0', () => {
  console.log(`ASTS server berjalan pada port ${PORT}; data disimpan di ${DB_FILE}`);
  if (!KEY) console.error('PERINGATAN: ASTS_SERVER_KEY belum diatur. API sinkronisasi tidak akan berfungsi.');
});
