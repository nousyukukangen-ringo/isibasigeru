document.addEventListener("DOMContentLoaded", () => {
  const appContainer = document.getElementById("app-container");
  let currentUser = null;

  // --------------------------
  // ログアウト
  // --------------------------
  const logout = async () => {
    await fetch("/api/logout", { method: "POST" });
    currentUser = null;
    window.location.hash = "#login";
  };

  // --------------------------
  // login ロジック
  // --------------------------
  const initLoginPage = () => {
    const loginBtn = document.getElementById("login-button");
    const gotoSignup = document.getElementById("goto-signup");

    gotoSignup.addEventListener("click", () => {
      window.location.hash = "#signup";
    });

    loginBtn.addEventListener("click", async () => {
      const email = document.getElementById("login-email").value;
      const password = document.getElementById("login-password").value;

      if (!email || !password) {
        alert("メールアドレスとパスワードを入力してください！");
        return;
      }

      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const result = await res.json();

      if (!result.success) {
        alert(result.message);
        return;
      }

      currentUser = result.user;
      alert("ログイン成功！");
      window.location.hash = "#map";
    });
  };

  // --------------------------
  // signup ロジック
  // --------------------------
  const initSignupPage = () => {
    const signupBtn = document.getElementById("signup-button");
    const gotoLogin = document.getElementById("goto-login");

    gotoLogin.addEventListener("click", () => {
      window.location.hash = "#login";
    });

    signupBtn.addEventListener("click", async () => {
      const email = document.getElementById("signup-email").value;
      const pass1 = document.getElementById("signup-password").value;
      const pass2 = document.getElementById("signup-password2").value;

      if (!email || !pass1 || !pass2) {
        alert("すべての項目を入力してください！");
        return;
      }

      if (pass1 !== pass2) {
        alert("パスワードが一致しません！");
        return;
      }

      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: pass1 }),
      });

      const result = await res.json();

      if (!result.success) {
        alert(result.message);
        return;
      }

      alert("アカウント作成完了！ログインしてください。");
      window.location.hash = "#login";
    });
  };

  // --------------------------
  // map ロジック（ログイン後画面）
  // --------------------------
  const initMapPage = async () => {
    const meRes = await fetch("/api/me");
    const me = await meRes.json();

    if (!me.loggedIn) {
      window.location.hash = "#login";
      return;
    }

    currentUser = me.user;

    document.getElementById("logout-button").addEventListener("click", logout);
  };

  // --------------------------
  // ルーター
  // --------------------------
  const router = async () => {
    const hash = window.location.hash || "#login";
    const page = hash.replace("#", "");

    if (page === "login") {
      const res = await fetch("/pages/login.html");
      appContainer.innerHTML = await res.text();
      initLoginPage();
    } else if (page === "signup") {
      const res = await fetch("/pages/signup.html");
      appContainer.innerHTML = await res.text();
      initSignupPage();
    } else if (page === "map") {
      const meRes = await fetch("/api/me");
      const me = await meRes.json();
      if (!me.loggedIn) {
        window.location.hash = "#login";
        return;
      }
      appContainer.innerHTML = `
        <div class="map-page">
          <h2>ようこそ ${me.user.email} さん</h2>
          <p>きびだんご: ${me.user.kibidango}</p>
          <button id="logout-button">ログアウト</button>
        </div>`;
      initMapPage();
    }
  };

  window.addEventListener("hashchange", router);
  router();
});
