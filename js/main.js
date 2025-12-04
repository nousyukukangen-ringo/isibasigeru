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
  // MAPページ
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

    // Leaflet
    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet/dist/leaflet.js";

    script.onload = () => {
      const map = L.map("map");
      const redIcon = L.icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41]
      });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          map.setView([lat, lng], 16);
          L.marker([lat, lng], { icon: redIcon }).addTo(map).bindPopup("あなたの現在地");
        },
        () => alert("現在地を取得できませんでした")
      );

      // ---------------------------
      // 要素
      // ---------------------------
      const cameraVideo = document.getElementById("camera-video");
      const cameraCanvas = document.getElementById("camera-canvas");
      const startBtn = document.getElementById("camera-start");
      const shootBtn = document.getElementById("camera-shoot");
      const closeBtn = document.getElementById("camera-close");
      const titleSection = document.getElementById("title-section");
      const photoTitleInput = document.getElementById("photo-title");
      const saveTitleBtn = document.getElementById("save-title");
      const arPreview = document.getElementById("ar-preview");
      const arImage = document.getElementById("ar-image");
      const arClose = document.getElementById("ar-close");
      const deleteBtn = document.getElementById("ar-delete");

      let stream;
      let currentPhotoData = null;
      let currentLatLng = null;
      let currentViewingId = null;
      let markersById = new Map();

      // ---------------------------
      // カメラ起動
      // ---------------------------
      startBtn.onclick = async () => {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
            audio: false,
          });
          cameraVideo.srcObject = stream;
          cameraVideo.style.display = "block";
          shootBtn.classList.remove("hidden");
          closeBtn.classList.remove("hidden");
          startBtn.classList.add("hidden");
        } catch (err) {
          alert("カメラを使用できません: " + err.message);
        }
      };

      // ---------------------------
      // カメラ閉じる
      // ---------------------------
      closeBtn.onclick = () => {
        if (stream) {
          stream.getTracks().forEach((t) => t.stop());
        }
        cameraVideo.style.display = "none";
        shootBtn.classList.add("hidden");
        closeBtn.classList.add("hidden");
        startBtn.classList.remove("hidden");
      };
// ---------------------------
// 削除ボタン (サーバーエラー無視版)
// ---------------------------

if (deleteBtn) {
  deleteBtn.onclick = async () => {
    // IDがなければ何もしない
    if (!currentViewingId) return;

    // 1. サーバーに削除命令を送る（エラーが出ても無視する）
    try {
      await fetch("/api/photo/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: currentViewingId }),
      });
    } catch (err) {
      console.log("サーバー通信エラーですが、画面上の削除を続行します");
    }

    // 2. ★ここが重要★
    // サーバーの結果を待たずに、地図からピンを消す
    const target = markersById.get(currentViewingId);
    if (target) {
      map.removeLayer(target.marker);       // 地図からピンを削除
      markersById.delete(currentViewingId); // 管理データから削除
    }

    // 3. 画面を閉じてリセット
    document.getElementById("ar-preview").classList.add("hidden");
    currentViewingId = null;
    
    // (任意) 削除完了メッセージ
    // alert("画面から削除しました"); 
  };
}

      // ---------------------------
      // 撮影
      // ---------------------------
      shootBtn.onclick = () => {
        cameraCanvas.width = 1920;
        cameraCanvas.height = 1080;
        const ctx = cameraCanvas.getContext("2d");
        ctx.drawImage(cameraVideo, 0, 0, cameraCanvas.width, cameraCanvas.height);
        currentPhotoData = cameraCanvas.toDataURL("image/jpeg", 0.9);

        navigator.geolocation.getCurrentPosition(
          (pos) => {
            currentLatLng = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            // カメラUI閉じる
            closeBtn.onclick();
            // タイトル入力表示
            titleSection.classList.remove("hidden");
            photoTitleInput.value = "";
          },
          () => alert("撮影位置の取得に失敗しました")
        );
      };

// タイトル保存
saveTitleBtn.onclick = async () => {
  const title = photoTitleInput.value.trim();
  if (!currentPhotoData) return alert("写真がありません");
  if (!title) return alert("タイトルを入力してください");

  const fd = new FormData();
  const blob = await (await fetch(currentPhotoData)).blob();
  fd.append("image", blob, "photo.jpg");
  fd.append("lat", currentLatLng.lat);
  fd.append("lng", currentLatLng.lng);
  fd.append("title", title);

  const res = await fetch("/api/photo/upload", { method: "POST", body: fd });
  const j = await res.json();
  if (!j.success) return alert(j.message || "保存失敗");

  // マーカー追加
  // マーカー追加
const marker = L.marker([currentLatLng.lat, currentLatLng.lng], { icon: redIcon }).addTo(map);
  marker.bindPopup(title); // マウスオーバーでタイトル表示
  marker.on("click", () => {
    currentViewingId = j.id;
    arImage.style.backgroundImage = `url(${j.filepath})`;
    arPreview.classList.remove("hidden");
  });

  markersById.set(j.id, { marker, data: { title, filepath: j.filepath } });

  // タイトル入力非表示
  titleSection.classList.add("hidden");
  currentPhotoData = null;
  currentLatLng = null;
};

      // ---------------------------
      // AR閉じる
      // ---------------------------
      arClose.onclick = () => {
        arPreview.classList.add("hidden");
      };

      // ---------------------------
      // 写真復元
      // ---------------------------
      const loadPhotos = async () => {
        const res = await fetch("/api/photo/list");
        const j = await res.json();
        if (!j.success) return;
        j.photos.forEach((p) => {
          const marker = L.marker([p.latitude, p.longitude]).addTo(map);
          marker.bindPopup(p.title || "");
          marker.on("click", () => {
            currentViewingId = p.id;
            arImage.style.backgroundImage = `url(${p.filepath})`;
            arPreview.classList.remove("hidden");
          });
          markersById.set(p.id, { marker, data: p });
        });
      };
      loadPhotos();

      // ---------------------------
      // 擬似AR
      // ---------------------------
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
