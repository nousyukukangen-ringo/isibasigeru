// server2.js
const express = require("express");
const session = require("express-session");
const path = require("path");
const fs = require("fs-extra");

const app = express();
const port = 3002;

// users.json のパス（永続化）
const USERS_FILE = path.join(__dirname, "users.json");

// 存在しない場合は空配列で作成（テストユーザーは作らない）
if (!fs.existsSync(USERS_FILE)) {
  fs.writeJSONSync(USERS_FILE, []);
  console.log("Created empty users.json");
}

// ミドルウェア
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// セッション設定（開発用のシンプル設定）
app.use(
  session({
    secret: "super-secret-key-change-this",
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }, // 1日
  })
);

// 静的ファイル提供（あなたの構成に合わせる）
app.use("/js", express.static(path.join(__dirname, "js")));       // main.js 等
app.use("/pages", express.static(path.join(__dirname, "pages"))); // login.html, signup.html 等
app.use(express.static(path.join(__dirname))); // その他 root 配下の静的ファイル

// ルート: SPA エントリ（index.html を返す）
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// --- API: ログイン ---
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: "入力必須です" });
    }

    // 管理者の簡易チェック（必要なければ除去可能）
    if (email === "admin@example.com" && password === "adminpass") {
      req.session.user = { email, isAdmin: true };
      return res.json({ success: true, isAdmin: true, user: req.session.user });
    }

    const users = await fs.readJSON(USERS_FILE);
    const user = users.find((u) => u.email === email && u.password === password);

    if (!user) {
      return res.status(401).json({ success: false, message: "メールアドレスまたはパスワードが無効です" });
    }

    // セッションに保存（必要な情報だけ）
    req.session.user = { email: user.email, kibidango: user.kibidango || 0, isAdmin: false };

    return res.json({ success: true, user: req.session.user });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ success: false, message: "サーバーエラー" });
  }
});

// --- API: サインアップ ---
app.post("/api/signup", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: "入力必須です" });
    }

    const users = await fs.readJSON(USERS_FILE);
    if (users.find((u) => u.email === email)) {
      return res.status(409).json({ success: false, message: "既に使用されています" });
    }

    const newUser = { email, password, kibidango: 0 };
    users.push(newUser);
    await fs.writeJSON(USERS_FILE, users, { spaces: 2 });

    console.log("New user:", email);
    return res.json({ success: true, message: "アカウント作成完了！ログインしてください。" });
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
      return res.status(500).json({ success: false, message: "ログアウトできませんでした" });
    }
    res.json({ success: true });
  });
});

// サーバー起動
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
