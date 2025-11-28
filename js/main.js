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

  // -----------------------------------------------------
  // MAPページ（撮影機能＋ピン＋ARプレビュー＋復元）
  // -----------------------------------------------------
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

    // Leaflet ロード
    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet/dist/leaflet.js";

    script.onload = () => {
      const map = L.map("map");

      // ベースレイヤー
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
      }).addTo(map);

      // 現在地にカメラを移動
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          map.setView([lat, lng], 16);
          L.marker([lat, lng]).addTo(map).bindPopup("あなたの現在地");
        },
        () => alert("現在地を取得できませんでした")
      );

      // ---- 撮影UIの要素 ----
      const video = document.getElementById("camera-video");
      const canvas = document.getElementById("camera-canvas");
      const cameraStart = document.getElementById("camera-start");
      const cameraShoot = document.getElementById("camera-shoot");

      const arPreview = document.getElementById("ar-preview");
      const arImage = document.getElementById("ar-image");
      const arClose = document.getElementById("ar-close");

      let stream = null;

      // ---------------------------------------------
      // カメラ起動（あなたが提示したコードを統合）
      // ---------------------------------------------
      async function startCamera() {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: "environment",
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            },
            audio: false,
          });

          video.srcObject = stream;
          video.style.display = "block";
          video.play();
          cameraShoot.style.display = "inline-block";
        } catch (err) {
          alert("カメラを使用できません: " + err.message);
        }
      }

      // ---------------------------------------------
      // 撮影（あなたが提示したコードを統合）
      // ---------------------------------------------
      function takePhoto() {
        const ctx = canvas.getContext("2d");

        // 解像度固定
        canvas.width = 1920;
        canvas.height = 1080;

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const imageData = canvas.toDataURL("image/jpeg", 0.9);
        return imageData;
      }

      // ---------------------------------------------
      // 撮影後 → ピン → サーバー保存 → プレビュー
      // ---------------------------------------------
      async function onTakePhoto() {
        const imageData = takePhoto();

        navigator.geolocation.getCurrentPosition(async (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;

          // ピン設置
          const marker = L.marker([lat, lng]).addTo(map);
          marker.on("click", () => {
            arImage.style.backgroundImage = `url(${imageData})`;
            arPreview.classList.remove("hidden");
          });

          // base64 → Blob
          const blob = await (await fetch(imageData)).blob();

          const fd = new FormData();
          fd.append("image", blob, "photo.jpg");
          fd.append("lat", lat);
          fd.append("lng", lng);

          await fetch("/api/photo/upload", {
            method: "POST",
            body: fd,
          });

          alert("保存しました");
        });
      }

      // ---------------------------------------------
      // イベント登録
      // ---------------------------------------------
      cameraStart.onclick = startCamera;
      cameraShoot.onclick = onTakePhoto;

      arClose.onclick = () => {
        arPreview.classList.add("hidden");
      };

      // ---------------------------------------------
      // マーカー復元
      // ---------------------------------------------
      async function restoreMarkers() {
        const res = await fetch("/api/photo/list");
        const j = await res.json();
        if (!j.success) return;

        j.photos.forEach((p) => {
          const marker = L.marker([p.latitude, p.longitude]).addTo(map);
          marker.on("click", () => {
            arImage.style.backgroundImage = `url(${p.filepath})`;
            arPreview.classList.remove("hidden");
          });
        });
      }

      restoreMarkers();

      // ---------------------------------------------
      // 擬似AR（端末の傾きで画像を動かす）
      // ---------------------------------------------
      window.addEventListener("deviceorientation", (event) => {
        if (arPreview.classList.contains("hidden")) return;

        const gamma = event.gamma ?? 0;
        const beta = event.beta ?? 0;

        const x = ((beta + 90) / 180) * 100;
        const y = ((gamma + 45) / 90) * 100;

        arImage.style.backgroundPosition = `${x}% ${y}%`;
      });
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
