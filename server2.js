require("dotenv").config();
const express = require("express");
const session = require("express-session");
const path = require("path");
const bcrypt = require("bcrypt");
const Database = require("better-sqlite3");
const multer = require("multer");
const fs = require("fs");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
const port = process.env.PORT || 3002;

// ----------------------------------
// SQLite 設定 & テーブル作成
// ----------------------------------
const DB_FILE = path.join(__dirname, "users.db");
const db = new Database(DB_FILE);

db.prepare(
  `CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL, kibidango INTEGER DEFAULT 0)`
).run();
db.prepare(
  `CREATE TABLE IF NOT EXISTS photos (id INTEGER PRIMARY KEY AUTOINCREMENT, user_email TEXT, filepath TEXT, latitude REAL, longitude REAL, title TEXT, created_at TEXT)`
).run();
db.prepare(
  `CREATE TABLE IF NOT EXISTS posts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_email TEXT, photo_id INTEGER, caption TEXT, created_at TEXT)`
).run();
db.prepare(
  `CREATE TABLE IF NOT EXISTS likes (user_email TEXT, post_id INTEGER, PRIMARY KEY (user_email, post_id))`
).run();

// ----------------------------------
// ミドルウェア
// ----------------------------------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "super-secret-key-change-this",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 24 * 60 * 60 * 1000,
      secure: process.env.COOKIE_SECURE === "true",
    },
  })
);

app.use("/js", express.static(path.join(__dirname, "js")));
app.use("/pages", express.static(path.join(__dirname, "pages")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use(express.static(path.join(__dirname)));

const uploadPath = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadPath),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, "photo-" + (Date.now() + "-" + Math.round(Math.random() * 1e9)) + ext);
  },
});
const upload = multer({ storage });

// ----------------------------------
// 認証系 API
// ----------------------------------
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ success: false, message: "無効なログインです" });
    }
    req.session.user = { email: user.email, kibidango: user.kibidango };
    res.json({ success: true, user: req.session.user });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

app.post("/api/signup", async (req, res) => {
  const { email, password } = req.body;
  const hashed = await bcrypt.hash(password, 10);
  try {
    db.prepare("INSERT INTO users (email, password) VALUES (?, ?)").run(email, hashed);
    res.json({ success: true });
  } catch (err) {
    res.status(409).json({ success: false, message: "登録済みです" });
  }
});

app.get("/api/me", (req, res) => res.json({ loggedIn: !!req.session.user, user: req.session.user }));

app.post("/api/logout", (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// ----------------------------------
// フォルダ (自分専用) API
// ----------------------------------
app.post("/api/photo/upload", upload.single("image"), (req, res) => {
  if (!req.session.user) return res.status(401).json({ success: false });
  const { lat, lng, title } = req.body;
  const filepath = "/uploads/" + req.file.filename;
  const info = db.prepare(
    `INSERT INTO photos (user_email, filepath, latitude, longitude, title, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))`
  ).run(req.session.user.email, filepath, lat, lng, title || "");
  res.json({ success: true, filepath, id: info.lastInsertRowid });
});

app.get("/api/photo/list", (req, res) => {
  if (!req.session.user) return res.status(401).json({ success: false });
  const rows = db.prepare("SELECT * FROM photos WHERE user_email = ? ORDER BY created_at DESC").all(req.session.user.email);
  res.json({ success: true, photos: rows });
});

app.delete("/api/photo/:id", (req, res) => {
  if (!req.session.user) return res.status(401).json({ success: false });
  const photoId = req.params.id;
  try {
    const photo = db.prepare("SELECT filepath FROM photos WHERE id = ? AND user_email = ?").get(photoId, req.session.user.email);
    if (!photo) return res.status(404).json({ success: false });
    db.prepare("DELETE FROM photos WHERE id = ? AND user_email = ?").run(photoId, req.session.user.email);
    const fullPath = path.join(__dirname, photo.filepath);
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

// ----------------------------------
// SNS API
// ----------------------------------
app.get("/api/all_posts", (req, res) => {
  const user_email = req.session.user ? req.session.user.email : null;
  const posts = db.prepare(`
    SELECT p.id, p.caption, p.created_at, p.user_email as user, ph.filepath, ph.latitude, ph.longitude,
    (CASE WHEN p.user_email = ? THEN 1 ELSE 0 END) as is_mine
    FROM posts p JOIN photos ph ON p.photo_id = ph.id
    ORDER BY p.created_at DESC
  `).all(user_email);
  const my_likes = user_email ? db.prepare("SELECT post_id FROM likes WHERE user_email = ?").all(user_email).map((l) => l.post_id) : [];
  res.json({ success: true, posts, my_likes });
});

app.post("/api/sns/post", (req, res) => {
  if (!req.session.user) return res.status(401).json({ success: false });
  const { photo_id, caption } = req.body;
  db.prepare(`INSERT INTO posts (user_email, photo_id, caption, created_at) VALUES (?, ?, ?, datetime('now'))`).run(req.session.user.email, photo_id, caption);
  res.json({ success: true });
});

// 🔥 SNSの投稿削除 API (ここを追加したぜ！)
app.post("/api/sns/delete", (req, res) => {
  if (!req.session.user) return res.status(401).json({ success: false });
  const { post_id } = req.body;
  const user_email = req.session.user.email;
  try {
    const result = db.prepare("DELETE FROM posts WHERE id = ? AND user_email = ?").run(post_id, user_email);
    if (result.changes > 0) {
      res.json({ success: true });
    } else {
      res.status(403).json({ success: false, message: "自分の投稿以外は消せねぇぜ" });
    }
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

app.post("/api/like", (req, res) => {
  if (!req.session.user) return res.status(401).json({ success: false });
  const { post_id, action } = req.body;
  if (action === "like") {
    db.prepare("INSERT OR IGNORE INTO likes (user_email, post_id) VALUES (?, ?)").run(req.session.user.email, post_id);
  } else {
    db.prepare("DELETE FROM likes WHERE user_email = ? AND post_id = ?").run(req.session.user.email, post_id);
  }
  res.json({ success: true });
});

// ----------------------------------
// ✨ AIコンシェルジュ API
// ----------------------------------
app.post("/api/ai/recommend", async (req, res) => {
  if (!req.session.user) return res.status(401).json({ success: false });
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  try {
    const allPosts = db.prepare(`SELECT p.id, p.caption FROM posts p`).all();
    const likedPosts = db.prepare(`SELECT p.id, p.caption FROM likes l JOIN posts p ON l.post_id = p.id WHERE l.user_email = ?`).all(req.session.user.email);
    const allText = allPosts.map((p) => `ID:${p.id} 内容:${p.caption}`).join("\n");
    const likedText = likedPosts.map((p) => `ID:${p.id} 内容:${p.caption}`).join("\n");
    const prompt = `あなたは巡礼アプリのコンシェルジュ。好みの傾向：${likedText || "未設定"}。全リスト：${allText}。おすすめIDを1つ数字のみで返せ。`;
    const result = await model.generateContent(prompt);
    const recommendedId = parseInt(result.response.text().trim());
    res.json({ success: true, id: recommendedId });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.listen(port, () => console.log(`Server running at http://localhost:${port}`));