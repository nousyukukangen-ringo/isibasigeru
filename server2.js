const express = require("express");
const session = require("express-session");
const path = require("path");
const fs = require("fs-extra");

const app = express();
const port = 3002;

// JSONファイル
const USERS_FILE = path.join(__dirname, "users.json");

// 初期ユーザー作成（無ければ自動作成）
if (!fs.existsSync(USERS_FILE)) {
  fs.writeJSONSync(USERS_FILE, [
    { email: "test@ex.com", password: "test", kibidango: 0 },
  ]);
}

// ミドルウェア
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // フォーム送信用

// セッション設定
app.use(
  session({
    secret: "super-secret-key",
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }, // 1日保持
  })
);

// 静的ファイル
app.use("/js", express.static(path.join(__dirname, "js")));
app.use("/pages", express.static(path.join(__dirname, "pages")));

// --------------------------------------------------
// ルートでログイン画面を返す
// --------------------------------------------------
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "pages", "login.html"));
});

// --------------------------------------------------
// 🔐 ログインAPI
// --------------------------------------------------
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: "入力必須です" });
  }

  const users = await fs.readJSON(USERS_FILE);

  // 管理者ログイン
  if (email === "admin@example.com" && password === "adminpass") {
    req.session.user = { email, isAdmin: true };
    return res.json({ success: true, isAdmin: true });
  }

  const user = users.find((u) => u.email === email && u.password === password);

  if (!user) {
    return res.status(401).json({
      success: false,
      message: "メールアドレスまたはパスワードが無効です",
    });
  }

  // セッションへ保存
  req.session.user = { email: user.email, kibidango: user.kibidango, isAdmin: false };

  return res.json({ success: true, user: req.session.user });
});

// --------------------------------------------------
// 🆕 新規登録API
// --------------------------------------------------
app.post("/api/signup", async (req, res) => {
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

  console.log("✨ 新規ユーザー追加:", newUser);

  return res.json({ success: true, message: "アカウント作成完了！ログインしてください。" });
});

// --------------------------------------------------
// 🔍 セッション確認
// --------------------------------------------------
app.get("/api/me", (req, res) => {
  if (!req.session.user) return res.json({ loggedIn: false });
  return res.json({ loggedIn: true, user: req.session.user });
});

// --------------------------------------------------
// 🚪 ログアウト
// --------------------------------------------------
app.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

// --------------------------------------------------
// 起動
// --------------------------------------------------
app.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
});
