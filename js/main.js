document.addEventListener("DOMContentLoaded", () => {
  const appContainer = document.getElementById("app-container");

  // ---------------------------
  // API: /api/me
  // ---------------------------
  const fetchMe = async () => {
    const res = await fetch("/api/me");
    return res.json();
  };

  // ---------------------------
  // ログアウト
  // ---------------------------
  const logout = async () => {
    await fetch("/api/logout", { method: "POST" });
    window.location.hash = "#login";
  };

  // ---------------------------
  // LOGIN ページ
  // ---------------------------
  const initLoginPage = () => {
    document.getElementById("login-button").onclick = async () => {
      const email = document.getElementById("login-email").value;
      const password = document.getElementById("login-password").value;

      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const result = await res.json();
      if (!result.success) return alert(result.message);

      window.location.hash = "#map";
    };

    document.getElementById("goto-signup").onclick = () => {
      window.location.hash = "#signup";
    };
  };

  // ---------------------------
  // SIGNUP ページ
  // ---------------------------
  const initSignupPage = () => {
    document.getElementById("signup-button").onclick = async () => {
      const email = document.getElementById("signup-email").value;
      const p1 = document.getElementById("signup-password").value;
      const p2 = document.getElementById("signup-password2").value;

      if (p1 !== p2) return alert("パスワードが一致しません");

      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: p1 }),
      });

      const result = await res.json();
      if (!result.success) return alert(result.message);

      window.location.hash = "#login";
    };

    document.getElementById("goto-login").onclick = () => {
      window.location.hash = "#login";
    };
  };

  // ---------------------------
  // MAP ページ
  // ---------------------------
  const initMapPage = async () => {
    const me = await fetchMe();
    if (!me.loggedIn) return (window.location.hash = "#login");

    // ログアウト
    document.getElementById("logout-button").onclick = logout;

    // 仮ボタン
    document.getElementById("goto-sns").onclick = () =>
      alert("SNSページは後で作ります");
    document.getElementById("goto-folder").onclick = () =>
      alert("フォルダページは後で作ります");

    // Leaflet JS をロード
    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet/dist/leaflet.js";

    script.onload = () => {
      const map = L.map("map");

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;

          map.setView([lat, lng], 16);

          L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19,
          }).addTo(map);

          L.marker([lat, lng]).addTo(map).bindPopup("あなたの現在地");
        },
        () => alert("現在地を取得できませんでした")
      );
    };

    document.body.appendChild(script);
  };

  // ---------------------------
  // Router
  // ---------------------------
  const router = async () => {
    const hash = window.location.hash || "#login";
    const page = hash.replace("#", "");

    if (page === "login") {
      appContainer.innerHTML = await (await fetch("/pages/login.html")).text();
      initLoginPage();
    } else if (page === "signup") {
      appContainer.innerHTML = await (await fetch("/pages/signup.html")).text();
      initSignupPage();
    } else if (page === "map") {
      const me = await fetchMe();
      if (!me.loggedIn) return (window.location.hash = "#login");

      appContainer.innerHTML = await (await fetch("/pages/map.html")).text();
      initMapPage();
    }
  };

  window.addEventListener("hashchange", router);
  router();
});
