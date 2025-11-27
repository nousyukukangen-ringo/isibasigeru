require("dotenv").config();
const express = require("express");
const session = require("express-session");
const path = require("path");
const bcrypt = require("bcrypt");
const Database = require("better-sqlite3");

const app = express();
const port = process.env.PORT || 3002;

// SQLite DB のパス
const DB_FILE = path.join(__dirname, "users.db");
const db = new Database(DB_FILE);

// テーブル作成（存在しなければ）
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

// ミドルウェア
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// セッション設定
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

// 静的ファイル提供
app.use("/js", express.static(path.join(__dirname, "js")));
app.use("/pages", express.static(path.join(__dirname, "pages")));
app.use(express.static(path.join(__dirname)));

// ルート: SPA
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// --- API: ログイン ---
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ success: false, message: "入力必須です" });

    const stmt = db.prepare("SELECT * FROM users WHERE email = ?");
    const user = stmt.get(email);

    if (!user) {
      return res
        .status(401)
        .json({
          success: false,
          message: "メールアドレスまたはパスワードが無効です",
        });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res
        .status(401)
        .json({
          success: false,
          message: "メールアドレスまたはパスワードが無効です",
        });
    }

    // セッション固定攻撃対策
    req.session.regenerate((err) => {
      if (err) {
        console.error("Session regenerate error:", err);
        return res
          .status(500)
          .json({ success: false, message: "サーバーエラー" });
      }

      req.session.user = {
        email: user.email,
        kibidango: user.kibidango,
        isAdmin: false,
      };
      return res.json({ success: true, user: req.session.user });
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ success: false, message: "サーバーエラー" });
  }
});

// --- API: サインアップ ---
app.post("/api/signup", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ success: false, message: "入力必須です" });

    const existsStmt = db.prepare("SELECT * FROM users WHERE email = ?");
    if (existsStmt.get(email)) {
      return res
        .status(409)
        .json({ success: false, message: "既に使用されています" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const insertStmt = db.prepare(
      "INSERT INTO users (email, password, kibidango) VALUES (?, ?, 0)"
    );
    insertStmt.run(email, hashedPassword);

    console.log("New user:", email);
    return res.json({
      success: true,
      message: "アカウント作成完了！ログインしてください。",
    });
  } catch (err) {
    console.error("Signup error:", err);
    return res.status(500).json({ success: false, message: "サーバーエラー" });
  }
});

// --- API: セッション確認 ---
app.get("/api/me", (req, res) => {
  if (!req.session.user) return res.json({ loggedIn: false });
  return res.json({ loggedIn: true, user: req.session.user });
});

// --- API: ログアウト ---
app.post("/api/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Session destroy error:", err);
      return res
        .status(500)
        .json({ success: false, message: "ログアウトできませんでした" });
    }
    res.json({ success: true });
  });
});

// サーバー起動
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
