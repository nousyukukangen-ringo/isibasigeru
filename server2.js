require("dotenv").config();
const express = require("express");
const session = require("express-session");
const path = require("path");
const bcrypt = require("bcrypt");
const Database = require("better-sqlite3");
const multer = require("multer");
const fs = require("fs");

const app = express();
const port = process.env.PORT || 3002;

// ----------------------------------
// SQLite 設定
// ----------------------------------
const DB_FILE = path.join(__dirname, "users.db");
const db = new Database(DB_FILE);

// users テーブル
db.prepare(
  `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    kibidango INTEGER DEFAULT 0
  )
`
).run();

// photos テーブル
db.prepare(
  `
  CREATE TABLE IF NOT EXISTS photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_email TEXT,
    filepath TEXT,
    latitude REAL,
    longitude REAL,
    created_at TEXT
  )
`
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

// 静的ファイル
app.use("/js", express.static(path.join(__dirname, "js")));
app.use("/pages", express.static(path.join(__dirname, "pages")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use(express.static(path.join(__dirname)));

// ----------------------------------
// multer 設定（アップロード）
// ----------------------------------
const uploadPath = path.join(__dirname, "uploads");

if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, "photo-" + unique + ext);
  },
});

const upload = multer({ storage });

// ----------------------------------
// SPA ルート
// ----------------------------------
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ----------------------------------
// API: login
// ----------------------------------
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ success: false, message: "入力必須です" });

    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);

    if (!user)
      return res
        .status(401)
        .json({
          success: false,
          message: "メールアドレスまたはパスワードが無効です",
        });

    const match = await bcrypt.compare(password, user.password);
    if (!match)
      return res
        .status(401)
        .json({
          success: false,
          message: "メールアドレスまたはパスワードが無効です",
        });

    req.session.regenerate((err) => {
      if (err)
        return res
          .status(500)
          .json({ success: false, message: "サーバーエラー" });

      req.session.user = {
        email: user.email,
        kibidango: user.kibidango,
        isAdmin: false,
      };
      return res.json({ success: true, user: req.session.user });
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ success: false, message: "サーバーエラー" });
  }
});

// ----------------------------------
// API: signup
// ----------------------------------
app.post("/api/signup", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ success: false, message: "入力必須です" });

    const exists = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
    if (exists)
      return res
        .status(409)
        .json({ success: false, message: "既に使用されています" });

    const hashed = await bcrypt.hash(password, 10);

    db.prepare(
      "INSERT INTO users (email, password, kibidango) VALUES (?, ?, 0)"
    ).run(email, hashed);

    res.json({
      success: true,
      message: "アカウント作成完了！ログインしてください。",
    });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ success: false, message: "サーバーエラー" });
  }
});

// ----------------------------------
// API: me
// ----------------------------------
app.get("/api/me", (req, res) => {
  if (!req.session.user) return res.json({ loggedIn: false });
  res.json({ loggedIn: true, user: req.session.user });
});

// ----------------------------------
// API: logout
// ----------------------------------
app.post("/api/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err)
      return res
        .status(500)
        .json({ success: false, message: "ログアウトできませんでした" });

    res.json({ success: true });
  });
});

// photos テーブルに title カラム追加（既存テーブル対応）
const columns = db.prepare("PRAGMA table_info(photos)").all();
if (!columns.find((c) => c.name === "title")) {
  db.prepare(`ALTER TABLE photos ADD COLUMN title TEXT`).run();
}

// API: 写真アップロード
app.post("/api/photo/upload", upload.single("image"), (req, res) => {
  if (!req.session.user)
    return res
      .status(401)
      .json({ success: false, message: "ログインしてください" });

  if (!req.file)
    return res
      .status(400)
      .json({ success: false, message: "画像がありません" });

  const { lat, lng, title } = req.body;
  const filepath = "/uploads/" + req.file.filename;

  const info = db
    .prepare(
      `INSERT INTO photos (user_email, filepath, latitude, longitude, title, created_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))`
    )
    .run(req.session.user.email, filepath, lat, lng, title || "");

  res.json({ success: true, filepath, id: info.lastInsertRowid });
});

// API: 写真一覧
app.get("/api/photo/list", (req, res) => {
  if (!req.session.user)
    return res
      .status(401)
      .json({ success: false, message: "ログインしてください" });

  const rows = db
    .prepare(
      `SELECT id, filepath, latitude, longitude, title, created_at
     FROM photos
     WHERE user_email = ?
     ORDER BY created_at DESC`
    )
    .all(req.session.user.email);

  res.json({ success: true, photos: rows });
});

// 復元処理
const loadPhotos = async () => {
  const res = await fetch("/api/photo/list");
  const j = await res.json();
  if (!j.success) return;

  j.photos.forEach((p) => {
    const marker = L.marker([p.latitude, p.longitude]).addTo(map);
    marker.bindPopup(p.title || "");
    marker.on("click", () => {
      arImage.style.backgroundImage = `url(${p.filepath})`;
      arPreview.classList.remove("hidden");
    });
    markersById.set(p.id, { marker, data: p });
  });
};

// -------------------------------------------------------
// ★ API: 写真アップロード
// -------------------------------------------------------
app.post("/api/photo/upload", upload.single("image"), (req, res) => {
  if (!req.session.user)
    return res
      .status(401)
      .json({ success: false, message: "ログインしてください" });

  if (!req.file)
    return res
      .status(400)
      .json({ success: false, message: "画像がありません" });

  const { lat, lng } = req.body;
  const filepath = "/uploads/" + req.file.filename;

  db.prepare(
    `INSERT INTO photos (user_email, filepath, latitude, longitude, created_at)
     VALUES (?, ?, ?, ?, datetime('now'))`
  ).run(req.session.user.email, filepath, lat, lng);

  res.json({ success: true, filepath });
});

// -------------------------------------------------------
// ★ API: 自分の写真一覧
// -------------------------------------------------------
app.get("/api/photo/list", (req, res) => {
  if (!req.session.user)
    return res
      .status(401)
      .json({ success: false, message: "ログインしてください" });

  const rows = db
    .prepare(
      `SELECT id, filepath, latitude, longitude, created_at
     FROM photos
     WHERE user_email = ?
     ORDER BY created_at DESC`
    )
    .all(req.session.user.email);

  res.json({ success: true, photos: rows });
});

// -------------------------------------------------------
// ★ API: 写真削除（ユーザー単位、ファイル削除 + DB削除）
// -------------------------------------------------------
app.delete("/api/photo/:id", (req, res) => {
  if (!req.session.user)
    return res
      .status(401)
      .json({ success: false, message: "ログインしてください" });

  const id = req.params.id;

  // ① まずその写真が「自分のものか」を確認
  const row = db
    .prepare("SELECT * FROM photos WHERE id = ? AND user_email = ?")
    .get(id, req.session.user.email);

  if (!row)
    return res.status(404).json({
      success: false,
      message: "写真が見つかりません（または他ユーザーの写真です）",
    });

  // ② ファイル削除
  const filePath = path.join(__dirname, row.filepath.replace(/^\//, ""));
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (err) {
    console.error("file delete error:", err);
  }

  // ③ DBから削除
  db.prepare("DELETE FROM photos WHERE id = ?").run(id);

  return res.json({ success: true });
});

// ----------------------------------
// サーバー起動
// ----------------------------------
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
