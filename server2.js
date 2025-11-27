// server2.js
require("dotenv").config(); // .env から環境変数読み込み
const express = require("express");
const session = require("express-session");
const path = require("path");
const fs = require("fs-extra");
const bcrypt = require("bcrypt");

const app = express();
const port = process.env.PORT || 3002;

// users.json のパス
const USERS_FILE = path.join(__dirname, "users.json");

// 存在しない場合は空配列で作成
if (!fs.existsSync(USERS_FILE)) {
  fs.writeJSONSync(USERS_FILE, []);
  console.log("Created empty users.json");
}

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
      maxAge: 24 * 60 * 60 * 1000, // 1日
      secure: process.env.COOKIE_SECURE === "true", // HTTPS 環境で true
    },
  })
);

// 静的ファイル提供
app.use("/js", express.static(path.join(__dirname, "js")));
app.use("/pages", express.static(path.join(__dirname, "pages")));
app.use(express.static(path.join(__dirname)));

// ルート: SPA エントリ
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

    const users = await fs.readJSON(USERS_FILE);
    const user = users.find((u) => u.email === email);

    if (!user) {
      return res
        .status(401)
        .json({
          success: false,
          message: "メールアドレスまたはパスワードが無効です",
        });
    }

    // パスワード比較（ハッシュ化済み）
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res
        .status(401)
        .json({
          success: false,
          message: "メールアドレスまたはパスワードが無効です",
        });
    }

    // セッション固定攻撃対策: セッション再生成
    req.session.regenerate((err) => {
      if (err) {
        console.error("Session regenerate error:", err);
        return res
          .status(500)
          .json({ success: false, message: "サーバーエラー" });
      }

      req.session.user = {
        email: user.email,
        kibidango: user.kibidango || 0,
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
    if (!email || !password) {
      return res.status(400).json({ success: false, message: "入力必須です" });
    }

    const users = await fs.readJSON(USERS_FILE);
    if (users.find((u) => u.email === email)) {
      return res
        .status(409)
        .json({ success: false, message: "既に使用されています" });
    }

    // パスワードをハッシュ化して保存
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = { email, password: hashedPassword, kibidango: 0 };
    users.push(newUser);
    await fs.writeJSON(USERS_FILE, users, { spaces: 2 });

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
