document.addEventListener("DOMContentLoaded", () => {
  const appContainer = document.getElementById("app-container");
  let currentUser = null; // { email, isAdmin, kibidango }

  // --- ログアウト処理 ---
  const logout = () => {
    currentUser = null;
    window.location.hash = "#login";
  };

  // --- ログインページ初期化 ---
  const initLoginPage = () => {
    const loginForm = document.getElementById("login-form");
    if (!loginForm) return;

    loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const email = event.target.email.value;
      const password = event.target.password.value;

      try {
        const response = await fetch("/api/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });

        const result = await response.json();

        if (result.success) {
          currentUser = {
            email,
            isAdmin: result.isAdmin,
            kibidango: (result.user && result.user.kibidango) || 0,
          };

          alert("ログイン成功");
          window.location.hash = "#map";
        } else {
          alert(`ログイン失敗: ${result.message}`);
        }
      } catch (error) {
        console.error("Login error:", error);
        alert("ログイン処理中にエラーが発生しました。");
      }
    });
  };

  // --- 簡易マップページ（ログイン成功後に遷移） ---
  const initMapPage = () => {
    appContainer.innerHTML = `
            <div class="map-page">
                <h2>ようこそ ${currentUser?.email || "ゲスト"} さん</h2>
                <p>ログインに成功しました。</p>
                <button id="logout-button">ログアウト</button>
            </div>
        `;
    document.getElementById("logout-button").addEventListener("click", logout);
  };

  // --- ルーター処理 ---
  const router = async () => {
    const hash = window.location.hash || "#login";
    const page = hash.replace("#", "");

    if (page === "login") {
      try {
        const response = await fetch("pages/login.html");
        const html = await response.text();
        appContainer.innerHTML = html;
        initLoginPage();
      } catch (error) {
        appContainer.innerHTML = "<p>login.html の読み込みに失敗しました。</p>";
      }
    } else if (page === "map") {
      if (!currentUser) {
        alert("ログインしていません。");
        window.location.hash = "#login";
        return;
      }
      initMapPage();
    } else {
      appContainer.innerHTML = "<h2>404 - ページが見つかりません</h2>";
    }
  };

  window.addEventListener("hashchange", router);
  router();
});
