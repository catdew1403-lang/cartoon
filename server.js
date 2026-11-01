'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const net = require('node:net');
const { promisify } = require('node:util');
const express = require('express');
const mysql = require('mysql2/promise');
const sharp = require('sharp');

if (fs.existsSync(path.join(__dirname, '.env'))) process.loadEnvFile(path.join(__dirname, '.env'));
const required = ['PORT', 'DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'SESSION_SECRET'];
if (required.some(key => !process.env[key])) throw new Error('Missing required application environment variables');
if (process.env.DB_NAME !== 'db_std10_p01') throw new Error('Database identity must match confirmed project p01');
if (process.env.SESSION_SECRET.length < 48) throw new Error('SESSION_SECRET must contain at least 48 characters');
const port = Number(process.env.PORT);
if (!Number.isInteger(port) || port < 1 || port > 65535 || Number(process.env.DB_PORT) !== 3306) throw new Error('Invalid application or database port');
if (!['true', 'false'].includes(process.env.COOKIE_SECURE)) throw new Error('Set COOKIE_SECURE explicitly for the deployed transport');
const secureCookie = process.env.COOKIE_SECURE === 'true';
const pool = mysql.createPool({ host: process.env.DB_HOST, port: 3306, database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD, connectionLimit: 4, queueLimit: 20, connectTimeout: 5000, charset: 'utf8mb4', decimalNumbers: true, multipleStatements: false });
const app = express();
app.disable('x-powered-by');
// Trust only explicitly configured ingress addresses, never a hop count or arbitrary headers.
const trustedProxies = (process.env.TRUSTED_PROXY_IPS || '').split(',').map(value => value.trim()).filter(Boolean);
if (trustedProxies.length > 16 || trustedProxies.some(value => !net.isIP(value) || value.includes('%'))) throw new Error('TRUSTED_PROXY_IPS must contain at most 16 unscoped literal IP addresses');
const normalizedIp = value => {
  if(net.isIP(value || '') !== 6 || value.includes('%')) return value;
  const canonical=new URL(`http://[${value}]/`).hostname.slice(1,-1);
  const mapped=/^::ffff:([a-f0-9]{1,4}):([a-f0-9]{1,4})$/.exec(canonical);
  if(!mapped) return canonical;
  const high=parseInt(mapped[1],16); const low=parseInt(mapped[2],16);
  return `${high >>> 8}.${high & 255}.${low >>> 8}.${low & 255}`;
};
const trustedProxySet = new Set(trustedProxies.map(normalizedIp));
app.set('trust proxy', address => trustedProxySet.has(normalizedIp(address)));
const clientAddress = req => normalizedIp(req.ip || req.socket.remoteAddress);
sharp.cache({ memory: 8, files: 0, items: 10 });
sharp.concurrency(1);
const scrypt = promisify(crypto.scrypt);
const publicRoot = path.join(__dirname, 'public');
const imageRoot = path.join(publicRoot, 'images');
const cookieOptions = { httpOnly: true, secure: secureCookie, sameSite: 'strict', path: '/' };
const hash = text => crypto.createHash('sha256').update(text).digest('hex');
const sign = text => crypto.createHmac('sha256', process.env.SESSION_SECRET).update(text).digest('hex');
const safeEqual = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a); const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
};
let passwordJobs = 0;
async function derivePassword(password, salt) {
  if (passwordJobs >= 2) fail(429, 'ระบบเข้าสู่ระบบกำลังทำงาน กรุณาลองอีกครั้ง');
  passwordJobs++;
  try { return await scrypt(password, salt, 64); }
  finally { passwordJobs--; }
}
function passwordInput(value, minimum) {
  if (typeof value !== 'string' || value.length < minimum || value.length > 128) fail(400, 'รหัสผ่านต้องยาว 12–128 ตัวอักษร');
  return value;
}
const fail = (status, message) => { const error = new Error(message); error.status = status; throw error; };
const ok = (res, data, status = 200) => res.status(status).json({ data });
const idOf = value => { const id = Number(value); if (!Number.isSafeInteger(id) || id < 1 || id > 4294967295) fail(400, 'รหัสข้อมูลไม่ถูกต้อง'); return id; };
const text = (value, max, min = 0) => { if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) fail(400, 'ข้อมูลไม่ครบหรือยาวเกินกำหนด'); return value.trim(); };
const userFields = 'id,username,email,role,pen_name,donation_url,donation_qr_url';
const genres = ['แฟนตาซี', 'ชีวิตประจำวัน', 'ผจญภัย', 'โรแมนซ์', 'ลึกลับ', 'ตลก', 'อื่น ๆ'];
const publicSeries = 's.hidden=0 AND u.suspended=0';
const seriesFields = `s.id,s.writer_id,s.title,s.synopsis,s.genre,s.tags,s.status,s.cover_image_url,s.views,s.updated_at,COALESCE(NULLIF(u.pen_name,''),u.username) AS writer_name,(SELECT COUNT(*) FROM chapters c WHERE c.series_id=s.id AND c.published_at IS NOT NULL) AS chapter_count`;
const query = async (sql, args = []) => (await pool.execute(sql, args))[0];
async function transaction(fn) {
  const connection = await pool.getConnection();
  try { await connection.beginTransaction(); const result = await fn(connection); await connection.commit(); return result; }
  catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}
function cookies(req) {
  const result = Object.create(null);
  for (const piece of (req.headers.cookie || '').split(';')) {
    const offset = piece.indexOf('=');
    if (offset !== -1) result[piece.slice(0, offset).trim()] = piece.slice(offset + 1).trim();
  }
  return result;
}
const buckets = new Map();
function limit(req, key, maximum, windowMs) {
  const now = Date.now();
  const id = `${clientAddress(req)}:${key}`;
  let bucket = buckets.get(id);
  if (!bucket || bucket.until <= now) {
    if (buckets.size >= 10000) {
      for (const [k,v] of buckets) if (v.until <= now) buckets.delete(k);
      if (buckets.size >= 10000) fail(429, 'มีผู้ใช้งานมาก กรุณาลองใหม่ภายหลัง');
    }
    bucket = { count: 0, until: now + windowMs }; buckets.set(id, bucket);
  }
  if (++bucket.count > maximum) fail(429, 'ใช้งานถี่เกินไป กรุณารอสักครู่');
}
app.use((req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'" });
  next();
});
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  try { limit(req, 'api', 240, 60000); next(); } catch (error) { next(error); }
});
app.use('/api', async (req, res, next) => {
  const jar = cookies(req);
  const token = jar.kt_csrf;
  const [nonce, signature] = (token || '').split('.');
  req.csrfToken = nonce && /^[a-f0-9]{48}$/.test(nonce) && safeEqual(signature, sign(nonce)) ? token : `${crypto.randomBytes(24).toString('hex')}`;
  if (!req.csrfToken.includes('.')) req.csrfToken += `.${sign(req.csrfToken)}`;
  if (req.csrfToken !== token) res.cookie('kt_csrf', req.csrfToken, { ...cookieOptions, maxAge: 86400000 });
  if (!['GET','HEAD'].includes(req.method)) {
    const origin = req.headers.origin;
    if (origin) {
      let host; try { host = new URL(origin).host; } catch { return next(Object.assign(new Error('ต้นทางคำขอไม่ถูกต้อง'), { status: 403 })); }
      if (host !== req.headers.host) return next(Object.assign(new Error('ไม่อนุญาตคำขอข้ามเว็บไซต์'), { status: 403 }));
    }
    if (!safeEqual(req.headers['x-csrf-token'], token) || token !== req.csrfToken) return next(Object.assign(new Error('กรุณารีเฟรชหน้าเว็บแล้วลองใหม่'), { status: 403, code: 'CSRF_INVALID' }));
  }
  if (jar.kt_session && /^[a-f0-9]{64}$/.test(jar.kt_session)) {
    try {
      const rows = await query(`SELECT u.${userFields.split(',').join(',u.')} FROM sessions se JOIN users u ON u.id=se.user_id WHERE se.token_hash=? AND se.expires_at>UTC_TIMESTAMP() AND u.suspended=0`, [hash(jar.kt_session)]);
      req.user = rows[0] || null;
    } catch (error) { return next(error); }
  }
  next();
});
app.use('/api', express.json({ limit: '32kb', type: 'application/json' }));
const auth = (req, res, next) => req.user ? next() : next(Object.assign(new Error('กรุณาเข้าสู่ระบบ'), { status: 401 }));
const writer = (req, res, next) => req.user && ['writer','admin'].includes(req.user.role) ? next() : next(Object.assign(new Error('สำหรับบัญชีนักเขียนเท่านั้น'), { status: req.user ? 403 : 401 }));
const admin = (req, res, next) => req.user?.role === 'admin' ? next() : next(Object.assign(new Error('สำหรับผู้ดูแลระบบเท่านั้น'), { status: 403 }));
async function sessionFor(req, res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  await transaction(async db => {
    await db.execute('DELETE FROM sessions WHERE expires_at<UTC_TIMESTAMP() OR token_hash=?', [hash(cookies(req).kt_session || '')]);
    await db.execute('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 7 DAY))', [hash(token), userId]);
  });
  res.cookie('kt_session', token, { ...cookieOptions, maxAge: 7 * 86400000 });
}
async function ownSeries(db, userId, seriesId) {
  const [rows] = await db.execute('SELECT * FROM series WHERE id=? FOR UPDATE', [seriesId]);
  if (!rows[0] || rows[0].writer_id !== userId) fail(404, 'ไม่พบผลงานของคุณ');
  if (rows[0].hidden) fail(403, 'ผลงานนี้ถูกระงับโดยผู้ดูแล');
  return rows[0];
}
async function ownDraft(db, userId, chapterId) {
  const [rows] = await db.execute('SELECT c.*,s.writer_id,s.hidden FROM chapters c JOIN series s ON s.id=c.series_id WHERE c.id=? FOR UPDATE', [chapterId]);
  if (!rows[0] || rows[0].writer_id !== userId) fail(404, 'ไม่พบตอนของคุณ');
  if (rows[0].published_at || rows[0].hidden) fail(409, 'ตอนที่เผยแพร่หรือถูกระงับไม่สามารถแก้ไขได้');
  return rows[0];
}
async function readableChapter(chapterId, userId = null) {
  const rows = await query(`SELECT c.*,s.title AS series_title,s.writer_id,COALESCE(NULLIF(u.pen_name,''),u.username) AS writer_name,u.donation_url,u.donation_qr_url FROM chapters c JOIN series s ON s.id=c.series_id JOIN users u ON u.id=s.writer_id WHERE c.id=? AND ${publicSeries} AND (c.published_at IS NOT NULL OR s.writer_id=?)`, [chapterId, userId]);
  if (!rows[0]) fail(404, 'ไม่พบตอนที่อ่านได้');
  return rows[0];
}

const requiredSchema = {
  users: 'id,username,email,password_hash,role,pen_name,donation_url,donation_qr_url,guidelines_version,guidelines_accepted_at,suspended,created_at',
  sessions: 'token_hash,user_id,expires_at',
  series: 'id,writer_id,title,synopsis,genre,tags,status,cover_image_url,hidden,views,created_at,updated_at',
  chapters: 'id,series_id,chapter_number,title,published_at,created_at',
  images: 'id,user_id,image_url,bytes,created_at',
  chapter_pages: 'id,chapter_id,image_id,page_order',
  chapter_views: 'viewer_hash,chapter_id,viewed_date',
  bookmarks: 'user_id,series_id,created_at',
  likes: 'user_id,chapter_id',
  reading_history: 'user_id,chapter_id,page_order,updated_at',
  reports: 'id,user_id,series_id,reason,status,resolved_by,created_at,resolved_at'
};
app.get('/api/health', async (req, res) => {
  try {
    const identity = await query('SELECT DATABASE() AS name');
    if(identity[0]?.name !== 'db_std10_p01') throw new Error('Database identity mismatch');
    const columns = await query('SELECT TABLE_NAME,COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()');
    const present = new Set(columns.map(column => `${column.TABLE_NAME}.${column.COLUMN_NAME}`));
    for(const [table, names] of Object.entries(requiredSchema)) {
      if(names.split(',').some(name => !present.has(`${table}.${name}`))) throw new Error('Incomplete schema');
    }
    ok(res, { status: 'ok', project: 'p01', database: 'ready', schema: 'ready' });
  } catch { res.status(503).json({ error: 'ฐานข้อมูลยังไม่พร้อม กรุณาตรวจการเชื่อมต่อและนำเข้า migration ผ่านหน้าฐานข้อมูลของ p01 เท่านั้น' }); }
});
app.get('/api/session', (req, res) => ok(res, { user: req.user || null, csrfToken: req.csrfToken }));
app.post('/api/register', async (req, res) => {
  limit(req, 'auth', 10, 900000);
  const body = req.body || {};
  const username = text(body.username, 60, 3);
  const email = text(body.email, 254, 5).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'อีเมลไม่ถูกต้อง');
  const password = passwordInput(body.password, 12);
  if (!['reader','writer'].includes(body.role)) fail(400, 'บทบาทไม่ถูกต้อง');
  const penName = body.role === 'writer' ? text(body.pen_name, 80, 1) : '';
  if (body.role === 'writer' && body.acceptGuidelines !== true) fail(400, 'ต้องยอมรับกฎนักเขียนก่อน');
  const salt = crypto.randomBytes(16).toString('hex');
  const digest = await derivePassword(password, salt);
  const result = await query('INSERT INTO users(username,email,password_hash,role,pen_name,guidelines_version,guidelines_accepted_at) VALUES(?,?,?,?,?,?,?)', [username,email,`${salt}:${digest.toString('hex')}`,body.role,penName,body.role === 'writer' ? '1' : null,body.role === 'writer' ? new Date() : null]);
  await sessionFor(req,res,result.insertId);
  const user = (await query(`SELECT ${userFields} FROM users WHERE id=?`,[result.insertId]))[0];
  ok(res, user, 201);
});
app.post('/api/login', async (req, res) => {
  limit(req, 'auth', 10, 900000);
  const email = text(req.body?.email,254,1).toLowerCase();
  const password = passwordInput(req.body?.password,1);
  const rows = await query('SELECT * FROM users WHERE email=?', [email]);
  const user = rows[0];
  const [salt, expected] = user ? user.password_hash.split(':') : ['00000000000000000000000000000000','0'.repeat(128)];
  const actual = await derivePassword(password,salt);
  if (!safeEqual(actual.toString('hex'),expected) || !user || user.suspended) fail(401, 'อีเมลหรือรหัสผ่านไม่ถูกต้อง หรือบัญชีถูกระงับ');
  await sessionFor(req,res,user.id);
  ok(res,{ id:user.id,role:user.role });
});
app.post('/api/logout', (req,res,next) => {
  query('DELETE FROM sessions WHERE token_hash=?',[hash(cookies(req).kt_session || '')]).then(() => {
    res.clearCookie('kt_session',cookieOptions); ok(res,{loggedOut:true});
  }).catch(next);
});
app.post('/api/upgrade', auth, async (req,res) => {
  if(req.user.role !== 'reader') fail(409,'บัญชีนี้เป็นนักเขียนอยู่แล้ว');
  if(req.body?.acceptGuidelines !== true) fail(400,'ต้องยอมรับกฎนักเขียนก่อน');
  const penName = text(req.body.pen_name,80,1);
  await query("UPDATE users SET role='writer',pen_name=?,guidelines_version='1',guidelines_accepted_at=UTC_TIMESTAMP() WHERE id=? AND role='reader'",[penName,req.user.id]);
  ok(res,{upgraded:true});
});
function donationUrl(value) {
  const url = text(value || '',500);
  if(!url) return '';
  let parsed; try { parsed = new URL(url); } catch { fail(400,'ลิงก์สนับสนุนไม่ถูกต้อง'); }
  if(parsed.protocol !== 'https:' || parsed.port || parsed.username || parsed.password || !['buymeacoffee.com','www.buymeacoffee.com','ko-fi.com','www.ko-fi.com'].includes(parsed.hostname)) fail(400,'รองรับลิงก์ HTTPS ของ Buy Me a Coffee หรือ Ko-fi เท่านั้น');
  return parsed.href;
}
async function ownedImage(url,userId,db) {
  if(!url) return '';
  if(typeof url !== 'string' || !/^\/images\/[a-f0-9-]{36}\.webp$/.test(url)) fail(400,'รูปภาพไม่ถูกต้อง');
  const [rows] = await db.execute('SELECT id FROM images WHERE image_url=? AND user_id=? FOR UPDATE',[url,userId]);
  if(!rows.length) fail(403,'คุณไม่มีสิทธิ์ใช้รูปนี้');
  return url;
}
app.put('/api/profile',writer,async (req,res) => {
  const penName = text(req.body?.pen_name,80,1);
  const url = donationUrl(req.body.donation_url);
  await transaction(async db=> {
    const qr = await ownedImage(req.body.donation_qr_url === undefined ? req.user.donation_qr_url : req.body.donation_qr_url,req.user.id,db);
    await db.execute('UPDATE users SET pen_name=?,donation_url=?,donation_qr_url=? WHERE id=?',[penName,url,qr,req.user.id]);
  });
  ok(res,{saved:true});
});
app.get('/api/series',async(req,res) => {
  const clauses = [publicSeries, 'EXISTS(SELECT 1 FROM chapters c WHERE c.series_id=s.id AND c.published_at IS NOT NULL)'];
  const args=[];
  if(req.query.q) { const q = `%${text(req.query.q,100)}%`; clauses.push('(s.title LIKE ? OR s.synopsis LIKE ? OR u.pen_name LIKE ?)');args.push(q,q,q); }
  if(req.query.genre) { clauses.push('s.genre=?');args.push(text(req.query.genre,40)); }
  if(req.query.status) { clauses.push('s.status=?');args.push(text(req.query.status,20)); }
  if(req.query.tag) { clauses.push('s.tags LIKE ?');args.push(`%${text(req.query.tag,100)}%`); }
  const order = req.query.sort === 'top' ? 's.views DESC,s.id DESC' : '(SELECT MAX(c.published_at) FROM chapters c WHERE c.series_id=s.id) DESC,s.id DESC';
  ok(res,await query(`SELECT ${seriesFields} FROM series s JOIN users u ON u.id=s.writer_id WHERE ${clauses.join(' AND ')} ORDER BY ${order} LIMIT 100`,args));
});
app.get('/api/series/:id',async(req,res) => {
  const id=idOf(req.params.id);
  const rows=await query(`SELECT ${seriesFields},u.donation_url,u.donation_qr_url FROM series s JOIN users u ON u.id=s.writer_id WHERE s.id=? AND ${publicSeries} AND (EXISTS(SELECT 1 FROM chapters c WHERE c.series_id=s.id AND c.published_at IS NOT NULL) OR s.writer_id=?)`,[id,req.user?.id || null]);
  if(!rows[0]) fail(404,'ไม่พบผลงาน');
  const chapters=await query('SELECT id,chapter_number,title,published_at FROM chapters WHERE series_id=? AND published_at IS NOT NULL ORDER BY chapter_number',[id]);
  const bookmarked=req.user ? (await query('SELECT user_id FROM bookmarks WHERE user_id=? AND series_id=?',[req.user.id,id])).length>0 : false;
  ok(res,{...rows[0],chapters,bookmarked});
});
app.get('/api/chapters/:id',async(req,res) => {
  const id=idOf(req.params.id);
  const chapter=await readableChapter(id,req.user?.id);
  const pages=await query('SELECT p.id,i.image_url,p.page_order FROM chapter_pages p JOIN images i ON i.id=p.image_id WHERE p.chapter_id=? ORDER BY p.page_order',[id]);
  const chapters=await query('SELECT id,chapter_number,title FROM chapters WHERE series_id=? AND published_at IS NOT NULL ORDER BY chapter_number',[chapter.series_id]);
  let liked=false;
  if(req.user) liked=(await query('SELECT user_id FROM likes WHERE user_id=? AND chapter_id=?',[req.user.id,id])).length>0;
  // Count at most one view per viewer/chapter/day rather than every refresh.
  if(chapter.published_at) {
    await transaction(async db => {
      const [result]=await db.execute('INSERT IGNORE INTO chapter_views(viewer_hash,chapter_id,viewed_date) VALUES(?,?,UTC_DATE())',[sign(req.user ? `user:${req.user.id}` : `ip:${clientAddress(req)}`),id]);
      if(result.affectedRows) await db.execute('UPDATE series SET views=views+1 WHERE id=?',[chapter.series_id]);
    });
  }
  ok(res,{...chapter,pages,chapters,liked});
});
app.post('/api/series/:id/bookmark',auth,async(req,res) => {
  const id=idOf(req.params.id);
  const exists=await query(`SELECT s.id FROM series s JOIN users u ON u.id=s.writer_id WHERE s.id=? AND ${publicSeries} AND EXISTS(SELECT 1 FROM chapters c WHERE c.series_id=s.id AND c.published_at IS NOT NULL)`,[id]);
  if(!exists.length) fail(404,'ไม่พบผลงาน');
  const bookmarked=await transaction(async db => {
    await db.execute('SELECT id FROM users WHERE id=? FOR UPDATE',[req.user.id]);
    const [result]=await db.execute('DELETE FROM bookmarks WHERE user_id=? AND series_id=?',[req.user.id,id]);
    if(!result.affectedRows) await db.execute('INSERT INTO bookmarks(user_id,series_id) VALUES(?,?)',[req.user.id,id]);
    return !result.affectedRows;
  });
  ok(res,{bookmarked});
});
app.post('/api/chapters/:id/like',auth,async(req,res) => {
  const id=idOf(req.params.id); await readableChapter(id);
  const liked=await transaction(async db => {
    await db.execute('SELECT id FROM users WHERE id=? FOR UPDATE',[req.user.id]);
    const [result]=await db.execute('DELETE FROM likes WHERE user_id=? AND chapter_id=?',[req.user.id,id]);
    if(!result.affectedRows) await db.execute('INSERT INTO likes(user_id,chapter_id) VALUES(?,?)',[req.user.id,id]);
    return !result.affectedRows;
  });
  ok(res,{liked});
});
app.get('/api/chapters/:id/history',auth,async(req,res) => {
  const chapterId=idOf(req.params.id);
  await readableChapter(chapterId,req.user.id);
  const rows=await query('SELECT chapter_id,page_order FROM reading_history WHERE user_id=? AND chapter_id=?',[req.user.id,chapterId]);
  ok(res,{history:rows[0] || null});
});
app.put('/api/history',auth,async(req,res) => {
  const chapterId=idOf(req.body?.chapter_id); const pageOrder=idOf(req.body?.page_order);
  await readableChapter(chapterId);
  const pages=await query('SELECT id FROM chapter_pages WHERE chapter_id=? AND page_order=?',[chapterId,pageOrder]);
  if(!pages.length) fail(400,'ไม่พบหน้าที่อ่าน');
  await query('INSERT INTO reading_history(user_id,chapter_id,page_order) VALUES(?,?,?) ON DUPLICATE KEY UPDATE page_order=VALUES(page_order),updated_at=UTC_TIMESTAMP()',[req.user.id,chapterId,pageOrder]);
  ok(res,{saved:true});
});
app.get('/api/profile',auth,async(req,res) => {
  const bookmarks=await query(`SELECT ${seriesFields} FROM bookmarks b JOIN series s ON s.id=b.series_id JOIN users u ON u.id=s.writer_id WHERE b.user_id=? AND ${publicSeries} ORDER BY b.created_at DESC LIMIT 100`,[req.user.id]);
  const history=await query(`SELECT h.chapter_id,h.page_order,c.series_id,c.title,s.title AS series_title FROM reading_history h JOIN chapters c ON c.id=h.chapter_id JOIN series s ON s.id=c.series_id JOIN users u ON u.id=s.writer_id WHERE h.user_id=? AND ${publicSeries} AND c.published_at IS NOT NULL ORDER BY h.updated_at DESC LIMIT 100`,[req.user.id]);
  const stats=(await query('SELECT COUNT(*) AS series,COALESCE(SUM(views),0) AS views,(SELECT COUNT(*) FROM bookmarks b JOIN series ss ON ss.id=b.series_id WHERE ss.writer_id=?) AS bookmarks FROM series WHERE writer_id=?',[req.user.id,req.user.id]))[0];
  ok(res,{user:req.user,bookmarks,history,stats});
});
function seriesInput(body) {
  const title=text(body?.title,160,1); const synopsis=text(body.synopsis,6000,1); const genre=text(body.genre,40,1); const tags=text(body.tags || '',300);
  if(!genres.includes(genre) || !['ongoing','completed'].includes(body.status)) fail(400,'หมวดหมู่หรือสถานะไม่ถูกต้อง');
  return [title,synopsis,genre,tags,body.status];
}
app.get('/api/studio',writer,async(req,res) => {
  const series=await query('SELECT * FROM series WHERE writer_id=? ORDER BY updated_at DESC,id DESC LIMIT 100',[req.user.id]);
  if(!series.length) return ok(res,series);
  const placeholders=series.map(()=>'?').join(',');
  const seriesIds=series.map(item=>item.id);
  const chapters=await query(`SELECT id,series_id,title,chapter_number,published_at FROM chapters WHERE series_id IN (${placeholders}) ORDER BY series_id,chapter_number`,seriesIds);
  const pages=await query(`SELECT p.id,p.chapter_id,i.image_url,p.page_order FROM chapter_pages p JOIN images i ON i.id=p.image_id JOIN chapters c ON c.id=p.chapter_id WHERE c.series_id IN (${placeholders}) ORDER BY p.chapter_id,p.page_order`,seriesIds);
  const chapterMap=new Map(chapters.map(chapter=>[chapter.id,{...chapter,pages:[]}]));
  for(const page of pages) chapterMap.get(page.chapter_id)?.pages.push(page);
  const seriesMap=new Map(series.map(item=>[item.id,{...item,chapters:[]}]));
  for(const chapter of chapterMap.values()) seriesMap.get(chapter.series_id)?.chapters.push(chapter);
  ok(res,[...seriesMap.values()]);
});
app.post('/api/series',writer,async(req,res) => {
  const values=seriesInput(req.body);
  const id=await transaction(async db=> {
    const cover=await ownedImage(req.body.cover_image_url || '',req.user.id,db);
    const [result]=await db.execute('INSERT INTO series(writer_id,title,synopsis,genre,tags,status,cover_image_url) VALUES(?,?,?,?,?,?,?)',[req.user.id,...values,cover]);
    return result.insertId;
  });
  ok(res,{id},201);
});
app.put('/api/series/:id',writer,async(req,res) => {
  const id=idOf(req.params.id); const values=seriesInput(req.body);
  await transaction(async db => {
    await ownSeries(db,req.user.id,id);
    const cover=await ownedImage(req.body.cover_image_url || '',req.user.id,db);
    await db.execute('UPDATE series SET title=?,synopsis=?,genre=?,tags=?,status=?,cover_image_url=? WHERE id=?',[...values,cover,id]);
  });
  ok(res,{saved:true});
});
app.delete('/api/series/:id',writer,async(req,res) => {
  const id=idOf(req.params.id);
  await transaction(async db => {
    await ownSeries(db,req.user.id,id);
    await db.execute('UPDATE series SET hidden=1 WHERE id=?',[id]);
  });
  ok(res,{archived:true});
});
app.post('/api/series/:id/chapters',writer,async(req,res) => {
  const seriesId=idOf(req.params.id); const title=text(req.body?.title,160,1); const number=Number(req.body.chapter_number);
  if(!Number.isFinite(number)||number<=0||number>999999||Math.abs(number*100-Math.round(number*100))>0.00001) fail(400,'เลขตอนไม่ถูกต้อง');
  const id=await transaction(async db => { await ownSeries(db,req.user.id,seriesId);const [result]=await db.execute('INSERT INTO chapters(series_id,chapter_number,title) VALUES(?,?,?)',[seriesId,number,title]);return result.insertId; });
  ok(res,{id},201);
});
app.put('/api/chapters/:id/pages',writer,async(req,res) => {
  const chapterId=idOf(req.params.id); const ids=req.body?.page_ids;
  if(!Array.isArray(ids)||!ids.length||ids.length>200||new Set(ids).size!==ids.length) fail(400,'ลำดับหน้าไม่ถูกต้อง');
  ids.forEach(idOf);
  await transaction(async db => {
    await ownDraft(db,req.user.id,chapterId);
    const [pages]=await db.execute('SELECT id FROM chapter_pages WHERE chapter_id=?',[chapterId]);
    if(pages.length!==ids.length||pages.some(page=>!ids.includes(page.id))) fail(400,'ต้องจัดเรียงหน้าที่มีอยู่ทั้งหมด');
    await db.execute('UPDATE chapter_pages SET page_order=page_order+1000 WHERE chapter_id=?',[chapterId]);
    for(let i=0;i<ids.length;i++) await db.execute('UPDATE chapter_pages SET page_order=? WHERE chapter_id=? AND id=?',[i+1,chapterId,ids[i]]);
  });
  ok(res,{saved:true});
});
app.delete('/api/chapters/:id/pages/:pageId',writer,async(req,res) => {
  const chapterId=idOf(req.params.id);const pageId=idOf(req.params.pageId);
  await transaction(async db => {
    await ownDraft(db,req.user.id,chapterId);
    const [result]=await db.execute('DELETE FROM chapter_pages WHERE id=? AND chapter_id=?',[pageId,chapterId]);
    if(!result.affectedRows) fail(404,'ไม่พบหน้า');
    const [pages]=await db.execute('SELECT id FROM chapter_pages WHERE chapter_id=? ORDER BY page_order',[chapterId]);
    for(let i=0;i<pages.length;i++) await db.execute('UPDATE chapter_pages SET page_order=? WHERE id=?',[i+1,pages[i].id]);
  });
  ok(res,{deleted:true});
});
app.post('/api/chapters/:id/publish',writer,async(req,res) => {
  const id=idOf(req.params.id);
  await transaction(async db => {
    const chapter=await ownDraft(db,req.user.id,id);
    const [pages]=await db.execute('SELECT id FROM chapter_pages WHERE chapter_id=?',[id]);
    if(!pages.length) fail(400,'ต้องอัปโหลดหน้าการ์ตูนก่อนเผยแพร่');
    await db.execute('UPDATE chapters SET published_at=UTC_TIMESTAMP() WHERE id=?',[id]);
    await db.execute('UPDATE series SET updated_at=UTC_TIMESTAMP() WHERE id=?',[chapter.series_id]);
  });
  ok(res,{published:true});
});
app.delete('/api/chapters/:id',writer,async(req,res) => {
  const id=idOf(req.params.id);
  await transaction(async db => {await ownDraft(db,req.user.id,id);await db.execute('DELETE FROM chapters WHERE id=?',[id]);});
  ok(res,{deleted:true});
});
// Admit one body before buffering; hold its slot until parsing and processing settle.
let imageBusy=false;
const rawImage=express.raw({type:['image/png','image/jpeg','image/gif','image/webp'],limit:5*1024*1024});
function admitImage(req,res,next) {
  try {
    limit(req,'images',30,60000);
    if(imageBusy) fail(429,'กำลังประมวลผลรูป กรุณาลองอีกครั้ง');
    imageBusy=true;
    let released=false; let processing=false;
    const release=()=> {
      if(released) return;
      released=true; imageBusy=false;
      req.removeListener('aborted',onAbort);
      res.removeListener('close',onClose);
    };
    const onAbort=()=> { if(!processing) release(); };
    const onClose=()=> { if(!processing) release(); };
    req.once('aborted',onAbort); res.once('close',onClose);
    req.releaseImage=release;
    rawImage(req,res,error=> {
      if(error || req.aborted || released) { release(); if(error) next(error); return; }
      processing=true;
      next();
    });
  } catch(error) { next(error); }
}
async function storeImage(req,chapterId=null) {
  if(!Buffer.isBuffer(req.body)||!req.body.length) fail(400,'รองรับ PNG, JPG, GIF และ WebP เท่านั้น');
  let db; let locked=false; let filePath; let fileCreated=false; let commitAttempted=false;
  try {
    db=await pool.getConnection();
    const [lock]=await db.execute("SELECT GET_LOCK('p01_image_quota',2) AS acquired");
    if(lock[0].acquired!==1) fail(429,'กรุณารออัปโหลดรูปก่อนหน้า');
    locked=true;
    await db.beginTransaction();
    if(chapterId) await ownDraft(db,req.user.id,chapterId);
    const [quota]=await db.execute('SELECT COUNT(*) AS count,COALESCE(SUM(bytes),0) AS bytes FROM images');
    if(quota[0].count>=200) fail(409,'ถึงขีดจำกัดรูปภาพ 200 รูปของโปรเจกต์');
    let output;
    try {
      const pipeline=sharp(req.body,{limitInputPixels:12000000,animated:false,failOn:'warning'});
      const metadata=await pipeline.metadata();
      if(!['png','jpeg','gif','webp'].includes(metadata.format)) fail(400,'ชนิดรูปภาพไม่รองรับ');
      output=await pipeline.rotate().resize({width:1440,withoutEnlargement:true}).webp({quality:82}).toBuffer();
    } catch(error) { if(error.status) throw error; fail(400,'ไฟล์รูปเสียหายหรือมีความละเอียดเกิน 12 ล้านพิกเซล'); }
    if(output.length>5*1024*1024||Number(quota[0].bytes)+output.length>100*1024*1024) fail(409,'ขนาดรูปหรือพื้นที่รวมเกินข้อกำหนด');
    await fsp.mkdir(imageRoot,{recursive:true});
    const realPublic=await fsp.realpath(publicRoot); const realImage=await fsp.realpath(imageRoot);
    if(realPublic!==publicRoot||realImage!==imageRoot) fail(500,'พื้นที่รูปภาพไม่ปลอดภัย');
    const uuid=crypto.randomUUID(); const url=`/images/${uuid}.webp`; filePath=path.join(imageRoot,`${uuid}.webp`);
    const file=await fsp.open(filePath,'wx',0o600); fileCreated=true;
    try { await file.writeFile(output); await file.sync(); } finally { await file.close(); }
    await db.execute('INSERT INTO images(id,user_id,image_url,bytes) VALUES(?,?,?,?)',[uuid,req.user.id,url,output.length]);
    let result={image_url:url};
    if(chapterId) {
      const [pages]=await db.execute('SELECT COALESCE(MAX(page_order),0)+1 AS next FROM chapter_pages WHERE chapter_id=?',[chapterId]);
      const order=Number(pages[0].next); if(order>200) fail(409,'จำนวนหน้ามากเกินกำหนด');
      const [insert]=await db.execute('INSERT INTO chapter_pages(chapter_id,image_id,page_order) VALUES(?,?,?)',[chapterId,uuid,order]);
      result={...result,id:insert.insertId,page_order:order};
    }
    commitAttempted=true;
    await db.commit(); fileCreated=false; return result;
  } catch(error) {
    if(db) await db.rollback().catch(()=>{});
    // A disconnected COMMIT can still have succeeded; retain its possible image.
    if(fileCreated && !commitAttempted) await fsp.unlink(filePath).catch(()=>{});
    if(fileCreated && commitAttempted) console.error('Image commit outcome uncertain; retained file for owner verification');
    throw error;
  } finally {
    if(db) { if(locked) await db.execute("SELECT RELEASE_LOCK('p01_image_quota')").catch(()=>{}); db.release(); }
  }
}
app.delete('/api/images/:uuid',writer,async(req,res)=> {
  const uuid=req.params.uuid;
  if(!/^[a-f0-9-]{36}$/.test(uuid)) fail(400,'รหัสรูปไม่ถูกต้อง');
  await transaction(async db=> {
    const [rows]=await db.execute('SELECT image_url FROM images WHERE id=? AND user_id=? FOR UPDATE',[uuid,req.user.id]);
    if(!rows.length) fail(404,'ไม่พบรูปของคุณ');
    const url=rows[0].image_url;
    const [refs]=await db.execute('SELECT (SELECT COUNT(*) FROM series WHERE cover_image_url=?)+(SELECT COUNT(*) FROM users WHERE donation_qr_url=?)+(SELECT COUNT(*) FROM chapter_pages WHERE image_id=?) AS count',[url,url,uuid]);
    if(Number(refs[0].count)) fail(409,'รูปนี้ยังถูกใช้งานอยู่');
    await db.execute('DELETE FROM images WHERE id=?',[uuid]);
  });
  await fsp.unlink(path.join(imageRoot,`${uuid}.webp`)).catch(error=>{if(error.code!=='ENOENT') console.error('Image cleanup failed:',error.code);});
  ok(res,{deleted:true});
});
app.post('/api/images',writer,admitImage,async(req,res)=> {
  try { ok(res,await storeImage(req),201); } finally { req.releaseImage(); }
});
app.post('/api/chapters/:id/pages',writer,admitImage,async(req,res)=> {
  try { ok(res,await storeImage(req,idOf(req.params.id)),201); } finally { req.releaseImage(); }
});
app.post('/api/reports',auth,async(req,res)=> {
  limit(req,'reports',5,3600000);
  const seriesId=idOf(req.body?.series_id); const reason=text(req.body.reason,1000,10);
  const rows=await query(`SELECT s.id FROM series s JOIN users u ON u.id=s.writer_id WHERE s.id=? AND ${publicSeries}`,[seriesId]);
  if(!rows.length) fail(404,'ไม่พบผลงาน');
  const result=await query('INSERT INTO reports(user_id,series_id,reason) VALUES(?,?,?)',[req.user.id,seriesId,reason]);
  ok(res,{id:result.insertId},201);
});
app.get('/api/admin/reports',auth,admin,async(req,res)=>ok(res,await query('SELECT r.id,r.series_id,s.title AS series_title,u.username AS reporter_name,r.reason,r.status FROM reports r JOIN series s ON s.id=r.series_id JOIN users u ON u.id=r.user_id ORDER BY r.created_at DESC LIMIT 200')));
app.get('/api/admin/users',auth,admin,async(req,res)=>ok(res,await query('SELECT id,username,role,suspended FROM users ORDER BY id DESC LIMIT 200')));
app.post('/api/admin/reports/:id/resolve',auth,admin,async(req,res)=> {
  const id=idOf(req.params.id); const action=req.body?.action;
  if(!['dismiss','hide'].includes(action)) fail(400,'คำสั่งไม่ถูกต้อง');
  await transaction(async db=> {
    const [rows]=await db.execute('SELECT * FROM reports WHERE id=? FOR UPDATE',[id]);
    if(!rows[0]) fail(404,'ไม่พบรายงาน'); if(rows[0].status!=='open') fail(409,'รายงานถูกจัดการแล้ว');
    if(action==='hide') await db.execute('UPDATE series SET hidden=1 WHERE id=?',[rows[0].series_id]);
    await db.execute('UPDATE reports SET status=?,resolved_by=?,resolved_at=UTC_TIMESTAMP() WHERE id=?',[action==='hide'?'hidden':'dismissed',req.user.id,id]);
  }); ok(res,{resolved:true});
});
app.post('/api/admin/users/:id/suspend',auth,admin,async(req,res)=> {
  const id=idOf(req.params.id); if(typeof req.body?.suspended!=='boolean') fail(400,'สถานะไม่ถูกต้อง');
  await transaction(async db=> {
    const [rows]=await db.execute('SELECT role FROM users WHERE id=? FOR UPDATE',[id]);
    if(!rows[0]) fail(404,'ไม่พบบัญชี'); if(rows[0].role==='admin') fail(403,'ไม่สามารถระงับผู้ดูแลผ่าน API');
    await db.execute('UPDATE users SET suspended=? WHERE id=?',[req.body.suspended,id]);
    if(req.body.suspended) await db.execute('DELETE FROM sessions WHERE user_id=?',[id]);
  }); ok(res,{saved:true});
});
app.use('/api',(req,res)=>res.status(404).json({error:'ไม่พบ API'}));
app.get('/images/:file',async(req,res)=> {
  try {
    limit(req,'image-reads',300,60000);
    if(!/^[a-f0-9-]{36}\.webp$/.test(req.params.file)) fail(404,'ไม่พบรูป');
    const url=`/images/${req.params.file}`;
    const publicRows=await query(`SELECT i.id FROM images i WHERE i.image_url=? AND (EXISTS(SELECT 1 FROM series s JOIN users u ON u.id=s.writer_id WHERE s.cover_image_url=i.image_url AND ${publicSeries} AND EXISTS(SELECT 1 FROM chapters c WHERE c.series_id=s.id AND c.published_at IS NOT NULL)) OR EXISTS(SELECT 1 FROM users u WHERE u.donation_qr_url=i.image_url AND u.suspended=0) OR EXISTS(SELECT 1 FROM chapter_pages p JOIN chapters c ON c.id=p.chapter_id JOIN series s ON s.id=c.series_id JOIN users u ON u.id=s.writer_id WHERE p.image_id=i.id AND c.published_at IS NOT NULL AND ${publicSeries}))`,[url]);
    if(!publicRows.length) {
      const token=cookies(req).kt_session || '';
      const owner=await query('SELECT i.id FROM images i JOIN sessions se ON se.user_id=i.user_id JOIN users u ON u.id=i.user_id WHERE i.image_url=? AND se.token_hash=? AND se.expires_at>UTC_TIMESTAMP() AND u.suspended=0',[url,hash(token)]);
      if(!owner.length) fail(404,'ไม่พบรูป');
    }
    const filePath=path.join(imageRoot,req.params.file);
    const real=await fsp.realpath(filePath); if(real!==filePath) fail(404,'ไม่พบรูป');
    res.set({'Cache-Control':'private, no-store','Content-Type':'image/webp'});
    res.sendFile(filePath);
  } catch(error) { if(!error.status && error.code==='ENOENT') error.status=404; throw error; }
});
const staticFiles=new Map([['/',['index.html','text/html']],['/index.html',['index.html','text/html']],['/style.css',['style.css','text/css']],['/index.js',['index.js','text/javascript']]]);
app.use(async(req,res,next)=> {
  if(!['GET','HEAD'].includes(req.method)) return res.sendStatus(405);
  const asset=staticFiles.get(req.path); if(!asset) return res.sendStatus(404);
  const filePath=path.join(publicRoot,asset[0]);
  try { if(await fsp.realpath(filePath)!==filePath) return res.sendStatus(404); }
  catch(error) { return next(error); }
  res.set('Cache-Control','no-cache'); res.type(asset[1]); res.sendFile(filePath);
});
app.use((error,req,res,next)=> {
  if(res.headersSent) return next(error);
  let status=error.status || 503;
  let message=error.status ? error.message : 'ระบบฐานข้อมูลยังไม่พร้อม กรุณาตรวจการเชื่อมต่อและ migration ของ p01';
  if(error.code==='ER_DUP_ENTRY') { status=409; message='ข้อมูลนี้มีอยู่แล้ว กรุณาเปลี่ยนอีเมล ชื่อผู้ใช้ หรือเลขตอน'; }
  if(error.type==='entity.too.large') { status=413; message='ไฟล์หรือข้อมูลมีขนาดเกินกำหนด (รูปไม่เกิน 5 MB)'; }
  if(error instanceof SyntaxError && error.type==='entity.parse.failed') { status=400; message='รูปแบบ JSON ไม่ถูกต้อง'; }
  if(!error.status) console.error('Request failed:',error.code || 'INTERNAL_ERROR');
  res.status(status).json({error:message,...(error.code==='CSRF_INVALID' ? {code:'CSRF_INVALID'} : {})});
});

const server=app.listen(port,process.env.HOST || '0.0.0.0',()=>console.log(`Kartoon p01 listening on port ${port}`));
server.requestTimeout=30000; server.headersTimeout=10000;
server.on('error',error=>{console.error('Server failed:',error.code);process.exitCode=1;});
for(const signal of ['SIGTERM','SIGINT']) process.on(signal,()=>{
  const timer=setTimeout(()=>process.exit(1),10000);timer.unref();
  server.close(()=>pool.end().finally(()=>{clearTimeout(timer);process.exit(0);}));
});

