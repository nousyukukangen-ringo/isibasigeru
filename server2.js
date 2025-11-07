// server2.js
const express = require("express");
const path = require("path");

const app = express();
const port = 3002;

// --- 簡易ユーザーデータ（メモリ上） ---
const users = [{ email: "test@ex.com", password: "test", kibidango: 0 }];

// --- ミドルウェア ---
app.use(express.json()); // JSONボディを解釈
app.use(express.static(__dirname)); 
app.use("/pages", express.static(path.join(__dirname, "pages"))); // /pages/login.html など読み込み用

// --- ログインAPI ---
app.post("/api/login", (req, res) => {
  const { email, password } = req.body;

  // 管理者ログイン例
  if (email === "admin@example.com" && password === "adminpass") {
    return res.json({ success: true, isAdmin: true });
  }

  // デモ用「パスワード変更が必要」なアカウント
  if (password === "kurasiki") {
    return res.json({ success: true, requiresPasswordChange: true });
  }

  // 通常ユーザーログイン
  const user = users.find((u) => u.email === email && u.password === password);
  if (user) {
    return res.json({
      success: true,
      isAdmin: false,
      user: { email: user.email, kibidango: user.kibidango },
    });
  }

  // ログイン失敗
  res.status(401).json({
    success: false,
    message: "メールアドレスまたはパスワードが無効です。",
  });
});

// --- サインアップAPI（任意で利用可） ---
app.post("/api/signup", (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res
      .status(400)
      .json({
        success: false,
        message: "メールアドレスとパスワードは必須です。",
      });
  }

  if (users.find((u) => u.email === email)) {
    return res
      .status(409)
      .json({
        success: false,
        message: "このメールアドレスは既に使用されています。",
      });
  }

  users.push({ email, password, kibidango: 0 });
  console.log("New user signed up:", { email });

  res.json({
    success: true,
    message: "アカウントが正常に作成されました。ログインしてください。",
  });
});

// --- サーバー起動 ---
app.listen(port, () => {
  console.log(`✅ Login server running at http://localhost:${port}`);
});
