document.addEventListener("DOMContentLoaded", () => {
  const app = document.getElementById("app-container");
  let allPosts = [],
    myLikes = new Set();

  // --- APIヘルパー ---
  const api = {
    get: async (u) => (await fetch(u)).json(),
    post: async (u, b) =>
      (
        await fetch(u, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(b),
        })
      ).json(),
    form: async (u, f) => (await fetch(u, { method: "POST", body: f })).json(),
    del: async (u) => (await fetch(u, { method: "DELETE" })).json(),
  };

  // --- 全投稿・いいね同期 ---
  const sync = async () => {
    try {
      const j = await api.get("/api/all_posts");
      if (j.success) {
        allPosts = j.posts;
        myLikes = new Set(j.my_likes || []);
      }
    } catch (e) {
      console.error("Sync Error", e);
    }
  };

  // --- 認証 (Login / Signup) ---
  const initAuth = (type) => {
    const isS = type === "signup";
    const btn = document.getElementById(isS ? "signup-button" : "login-button");
    if (!btn) return;
    btn.onclick = async () => {
      const email = document.getElementById(
        isS ? "signup-email" : "login-email"
      ).value;
      const pass = document.getElementById(
        isS ? "signup-password" : "login-password"
      ).value;
      if (isS && pass !== document.getElementById("signup-password2").value)
        return alert("不一致");
      const j = await api.post(isS ? "/api/signup" : "/api/login", {
        email,
        password: pass,
      });
      if (j.success) {
        if (!isS) {
          await sync();
          location.hash = "#map";
        } else location.hash = "#login";
      } else alert(j.message);
    };
    document.getElementById(isS ? "goto-login" : "goto-signup").onclick = () =>
      (location.hash = isS ? "#login" : "#signup");
  };
  const initSNS = async () => {
    // 1. サーバーから最新の全ユーザー投稿を同期
    await sync();

    const feed = document.querySelector(".feed");
    const searchInput = document.querySelector(".search-input");
    const openBtn = document.getElementById("open-post-selector");
    const selectorModal = document.getElementById("postSelectorModal");
    const selectionGrid = document.getElementById("my-folder-selection");
    const commentModal = document.getElementById("commentModal");

    // --- 🎨 描画エンジン: render関数 ---
    const render = (query = "") => {
      if (!feed) return;
      feed.innerHTML = "";

      // ① 検索フィルタリング & ② 最新順(降順)にソート
      const displayPosts = allPosts
        .filter(
          (p) =>
            (p.caption || "").toLowerCase().includes(query.toLowerCase()) ||
            (p.user || "").toLowerCase().includes(query.toLowerCase())
        )
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      if (displayPosts.length === 0) {
        feed.innerHTML = `<p class="empty-msg">投稿が見つからないぜ、ブラザー！</p>`;
        return;
      }

      displayPosts.forEach((p) => {
        const liked = myLikes.has(p.id);
        const card = document.createElement("article");
        card.className = "post-card";

        // 本人確認フラグ（削除ボタン）
        const deleteBtnHtml = p.is_mine
          ? `<button class="action-btn del-post-btn" title="削除"><i class="fas fa-trash"></i></button>`
          : "";

        card.innerHTML = `
        <div class="post-image" style="background-image:url('${
          p.filepath
        }')"></div>
        <div class="post-info">
          <div>
            <span class="username">@${p.user || "Unknown"}</span>
            <p class="post-caption">${p.caption || ""}</p>
          </div>
          <div class="post-actions">
            <button class="action-btn like-btn ${liked ? "liked" : ""}">
              <i class="${liked ? "fas" : "far"} fa-heart"></i>
            </button>
            ${deleteBtnHtml}
          </div>
        </div>`;

        // いいね！ボタン
        card.querySelector(".like-btn").onclick = async () => {
          await api.post("/api/like", {
            post_id: p.id,
            action: liked ? "unlike" : "like",
          });
          await sync();
          render(searchInput.value);
        };

        // 削除ボタン
        if (p.is_mine) {
          card.querySelector(".del-post-btn").onclick = async () => {
            if (!confirm("この作品をSNSから撤去するかい？")) return;
            const res = await api.post("/api/sns/delete", { post_id: p.id });
            if (res.success) {
              await sync();
              render(searchInput.value);
            }
          };
        }
        feed.appendChild(card);
      });
    };

    // --- 📂 投稿フロー ---
    if (openBtn) {
      openBtn.onclick = async () => {
        selectorModal.style.display = "flex";
        selectionGrid.innerHTML = "ロード中だ...";
        const j = await api.get("/api/photo/list");
        if (j.success && j.photos.length > 0) {
          selectionGrid.innerHTML = "";
          j.photos.forEach((photo) => {
            const thumb = document.createElement("div");
            thumb.className = "selectable-thumb";
            thumb.style.backgroundImage = `url(${photo.filepath})`;
            thumb.onclick = () => {
              selectorModal.style.display = "none";
              openPublishModal(photo);
            };
            selectionGrid.appendChild(thumb);
          });
        } else {
          selectionGrid.innerHTML = "<p>フォルダが空だぜ！</p>";
        }
      };
    }

    // --- 🚀 【重要】最終投稿：ここが動画の不具合を直す心臓部だ！ ---
    const openPublishModal = (photo) => {
      const preview = document.getElementById("selected-preview");
      if (preview) preview.style.backgroundImage = `url(${photo.filepath})`;
      commentModal.style.display = "flex";

      const finalPostBtn = document.getElementById("final-post-btn");

      // イベントが重複しないよう、onclickを直接上書きするぜ
      finalPostBtn.onclick = async () => {
        const caption = document.getElementById("commentText").value;

        // 1. ボタンをロックして「送ってる感」を出す
        finalPostBtn.disabled = true;
        finalPostBtn.innerText = "シェア中...";

        try {
          const res = await api.post("/api/sns/post", {
            photo_id: photo.id,
            caption: caption,
          });

          if (res.success) {
            // 2. 成功したら後片付け
            document.getElementById("commentText").value = "";
            commentModal.style.display = "none";

            // 3. 最新状態を反映
            await sync();
            render();
            alert("世界にシェアしたぜ、ブラザー！");
          } else {
            alert("ミスっちまった： " + res.message);
          }
        } catch (err) {
          console.error(err);
          alert("通信エラーだ、もう一度頼む！");
        } finally {
          // 4. 最後に必ずボタンを元に戻す
          finalPostBtn.disabled = false;
          finalPostBtn.innerText = "シェアする";
        }
      };
    };

    // 🔍 検索
    if (searchInput) searchInput.oninput = (e) => render(e.target.value);

    render();
    document.getElementById("back-map").onclick = () =>
      (location.hash = "#map");
  };

  // モーダルクローズ関数
  window.closePostSelector = () =>
    (document.getElementById("postSelectorModal").style.display = "none");
  window.closeCommentModal = () =>
    (document.getElementById("commentModal").style.display = "none");
  // --- マップページ ---
  // --- マップページ ---
const initMapPage = async () => {
  console.log("🚀 Mission Start: initMapPage");
  const loadingScreen = document.getElementById('loading-screen');
  
  // 【セーフティ】万が一のフリーズ防止（3秒で強制開放）
  const forceUnlock = setTimeout(() => {
    loadingScreen?.classList.add('loading-hidden');
  }, 3000);

  // --- 1. 同期・ログアウト・遷移設定 ---
  await sync();
  
  document.getElementById("logout-button").onclick = async () => {
    await fetch("/api/logout", { method: "POST" });
    location.hash = "#login";
  };
  document.getElementById("goto-sns").onclick = () => (location.hash = "#sns");
  document.getElementById("goto-folder").onclick = () => (location.hash = "#folder");

  // --- 2. フッターボタンの切り替えロジック ---
  const startBtn = document.getElementById("camera-start");
  const closeBtn = document.getElementById("camera-close");
  const footerDefault = document.getElementById("footer-default");
  const footerCamera = document.getElementById("footer-camera");
  const video = document.getElementById("camera-video");

  if (startBtn) {
    startBtn.onclick = () => {
      footerDefault?.classList.add("hidden");
      footerCamera?.classList.remove("hidden");
      if (video) video.style.display = "block";
      if (window.startCamera) window.startCamera();
    };
  }

  if (closeBtn) {
    closeBtn.onclick = () => {
      footerDefault?.classList.remove("hidden");
      footerCamera?.classList.add("hidden");
      if (video) video.style.display = "none";
      if (window.stopCamera) window.stopCamera();
    };
  }

  // --- 3. 地図 (Leaflet) の初期化 ---
  const script = document.createElement("script");
  script.src = "https://unpkg.com/leaflet/dist/leaflet.js";
  script.onload = () => {
    const map = L.map("map");
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);

    // アイコン設定
    const redIcon = L.icon({
      iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png",
      shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png",
      iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
    });
    const bIcon = L.icon({
      iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png",
      iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34]
    });
    const yIcon = L.icon({
      iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-gold.png",
      iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34]
    });

    // 現在地取得
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude, lng = pos.coords.longitude;
        map.setView([lat, lng], 14);
        L.marker([lat, lng], { icon: redIcon }).addTo(map).bindPopup("現在地");
      },
      () => { map.setView([35.68, 139.76], 14); }
    );

    // お気に入りマーカー表示
    allPosts.forEach((p) => {
      if (myLikes.has(p.id) && p.lat && p.lng) {
        L.marker([p.lat, p.lng], { icon: yIcon }).addTo(map)
          .bindPopup(`<b>${p.title}</b><br><img src="${p.image || p.filepath}" width="80">`);
      }
    });

    // 写真リスト取得 & マーカー設置
    api.get("/api/photo/list").then((j) => {
      if (j.success) {
        j.photos.forEach((p) => {
          const m = L.marker([p.latitude, p.longitude], { icon: bIcon }).addTo(map);
          m.on("click", () => {
            const ar = document.getElementById("ar-preview");
            if (ar) {
              document.getElementById("ar-image").style.backgroundImage = `url(${p.filepath})`;
              ar.classList.remove("hidden");
            }
            document.getElementById("ar-delete").onclick = async () => {
              if (!confirm("この投稿を削除しますか？")) return;
              await api.post("/api/photo/delete", { id: p.id });
              map.removeLayer(m);
              ar.classList.add("hidden");
            };
            document.getElementById("ar-close").onclick = () => ar.classList.add("hidden");
          });
        });
      }
      
      // 【重要】全てのマーカー設置が終わったらロード画面を消す！
      clearTimeout(forceUnlock);
      setTimeout(() => {
        loadingScreen?.classList.add('loading-hidden');
        map.invalidateSize(); // 地図の表示崩れを直す
      }, 500);
    });

    initCameraSystem();
  };
  document.body.appendChild(script);
};
  // --- フォルダページ (編集機能付き) ---
  const initFolderPage = async () => {
    const j = await api.get("/api/photo/list"),
      list = document.getElementById("folder-list");
    const modal = document.getElementById("preview-modal"),
      img = document.getElementById("preview-image");
    const editCanvas = document.getElementById("edit-canvas"),
      editTools = document.getElementById("edit-tools");
    const editBtn = document.getElementById("preview-edit"),
      saveBtn = document.getElementById("preview-save");
    const ctx = editCanvas.getContext("2d");

    let drawing = false,
      currentColor = "#ff0000",
      currentPhotoId = null;

    if (!j.success || !list) return;

    list.innerHTML = "";
    j.photos.forEach((p) => {
      const card = document.createElement("div");
      card.className = "photo-card";
      card.innerHTML = `<div class="photo-thumb" style="background-image:url('${
        p.filepath
      }')"></div><div class="photo-title">${p.title || ""}</div>`;

      card.onclick = () => {
        currentPhotoId = p.id;
        img.src = p.filepath;
        img.classList.remove("hidden");
        editCanvas.classList.add("hidden");
        editTools.classList.add("hidden");
        saveBtn.classList.add("hidden");
        editBtn.classList.remove("hidden");
        document.getElementById("preview-title").innerText = p.title || "";
        modal.classList.remove("hidden");

        // 削除ボタン設定
        document.getElementById("preview-delete").onclick = async () => {
          if (!confirm("削除しますか？")) return;
          await api.del(`/api/photo/${p.id}`);
          modal.classList.add("hidden");
          initFolderPage();
        };
      };
      list.appendChild(card);
    });

    // 🎨 編集モード開始
    editBtn.onclick = () => {
      // キャンバスのサイズを画像の表示サイズに合わせる
      editCanvas.width = img.naturalWidth;
      editCanvas.height = img.naturalHeight;
      // 元画像をキャンバスに描く
      ctx.drawImage(img, 0, 0);

      img.classList.add("hidden");
      editCanvas.classList.remove("hidden");
      editTools.classList.remove("hidden");
      editBtn.classList.add("hidden");
      saveBtn.classList.remove("hidden");

      // お絵描き設定
      ctx.strokeStyle = currentColor;
      ctx.lineWidth = Math.max(editCanvas.width / 50, 5);
      ctx.lineCap = "round";
    };

    // お絵描きロジック
    const getPos = (e) => {
      const rect = editCanvas.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      return {
        x: (clientX - rect.left) * (editCanvas.width / rect.width),
        y: (clientY - rect.top) * (editCanvas.height / rect.height),
      };
    };
    const start = (e) => {
      e.preventDefault();
      drawing = true;
      ctx.beginPath();
      const p = getPos(e);
      ctx.moveTo(p.x, p.y);
    };
    const move = (e) => {
      if (!drawing) return;
      e.preventDefault();
      const p = getPos(e);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    };
    const stop = () => {
      drawing = false;
    };

    editCanvas.addEventListener("mousedown", start);
    editCanvas.addEventListener("mousemove", move);
    window.addEventListener("mouseup", stop);
    editCanvas.addEventListener("touchstart", start, { passive: false });
    editCanvas.addEventListener("touchmove", move, { passive: false });
    editCanvas.addEventListener("touchend", stop);

    // 色選択
    document.querySelectorAll(".swatch").forEach((s) => {
      s.onclick = () => {
        document.querySelector(".swatch.active")?.classList.remove("active");
        s.classList.add("active");
        currentColor = s.dataset.color;
        ctx.strokeStyle = currentColor;
      };
    });

    // 💾 上書き保存
    saveBtn.onclick = async () => {
      const data = editCanvas.toDataURL("image/jpeg", 0.8);
      const blob = await (await fetch(data)).blob();
      const fd = new FormData();
      fd.append("image", blob, "edited.jpg");
      fd.append("photo_id", currentPhotoId); // サーバー側でIDを受け取って上書きする処理が必要

      alert("アートを保存中だ...");
      // 新規投稿として扱うか、上書きAPIを叩くか。
      // ここでは、お前の既存の /api/photo/upload を流用する想定だ（必要に応じてサーバー側も調整してくれ）。
      const res = await api.form("/api/photo/upload", fd);
      if (res.success) {
        modal.classList.add("hidden");
        initFolderPage();
      }
    };

    document.getElementById("preview-close").onclick = () =>
      modal.classList.add("hidden");
    document.getElementById("back-map").onclick = () =>
      (location.hash = "#map");
  };

  // --- ★進化したカメラ撮影＆落書きロジック ---
  const initCameraSystem = () => {
    const v = document.getElementById("camera-video"),
      can = document.getElementById("camera-canvas");
    const sBtn = document.getElementById("camera-start"),
      shBtn = document.getElementById("camera-shoot");
    const cBtn = document.getElementById("camera-close"),
      saveEditBtn = document.getElementById("camera-save-edit");
    const tools = document.getElementById("graffiti-tools"),
      titleSec = document.getElementById("title-section");
    const ctx = can.getContext("2d");

    let drawing = false,
      currentColor = "#ff0000";

    // カメラ開始
    if (sBtn)
      sBtn.onclick = async () => {
        v.srcObject = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        v.style.display = "block";
        sBtn.classList.add("hidden");
        shBtn.classList.remove("hidden");
        cBtn.classList.remove("hidden");
      };

    // 撮影：映像をキャンバスに固めて編集モードへ
    if (shBtn)
      shBtn.onclick = () => {
        can.width = v.videoWidth;
        can.height = v.videoHeight;
        ctx.drawImage(v, 0, 0, can.width, can.height);
        v.style.display = "none";
        can.classList.remove("hidden");
        shBtn.classList.add("hidden");
        if (saveEditBtn) saveEditBtn.classList.remove("hidden");
        if (titleSec) titleSec.classList.remove("hidden");
        if (tools) tools.classList.remove("hidden");
        // お絵描き初期設定
        ctx.strokeStyle = currentColor;
        ctx.lineWidth = 6;
        ctx.lineCap = "round";
      };

    // お絵描きロジック
    const getPos = (e) => {
      const rect = can.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      return {
        x: (clientX - rect.left) * (can.width / rect.width),
        y: (clientY - rect.top) * (can.height / rect.height),
      };
    };
    const start = (e) => {
      if (can.classList.contains("hidden")) return;
      e.preventDefault();
      drawing = true;
      ctx.beginPath();
      const p = getPos(e);
      ctx.moveTo(p.x, p.y);
    };
    const move = (e) => {
      if (!drawing) return;
      e.preventDefault();
      const p = getPos(e);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    };
    const stop = () => {
      drawing = false;
    };

    can.addEventListener("mousedown", start);
    can.addEventListener("mousemove", move);
    window.addEventListener("mouseup", stop);
    can.addEventListener("touchstart", start, { passive: false });
    can.addEventListener("touchmove", move, { passive: false });
    can.addEventListener("touchend", stop);

    // パレット＆クリア
    document.querySelectorAll(".swatch").forEach((s) => {
      s.onclick = () => {
        document.querySelector(".swatch.active")?.classList.remove("active");
        s.classList.add("active");
        currentColor = s.dataset.color;
        ctx.strokeStyle = currentColor;
      };
    });
    const clearBtn = document.getElementById("camera-clear");
    if (clearBtn)
      clearBtn.onclick = () => ctx.drawImage(v, 0, 0, can.width, can.height);

    // 保存
    if (saveEditBtn)
      saveEditBtn.onclick = async () => {
        const title = document.getElementById("photo-title").value || "無題";
        const data = can.toDataURL("image/jpeg", 0.8);
        navigator.geolocation.getCurrentPosition(async (pos) => {
          const fd = new FormData();
          const blob = await (await fetch(data)).blob();
          fd.append("image", blob, "art.jpg");
          fd.append("lat", pos.coords.latitude);
          fd.append("lng", pos.coords.longitude);
          fd.append("title", title);
          const res = await api.form("/api/photo/upload", fd);
          if (res.success) location.reload();
        });
      };

    if (cBtn) cBtn.onclick = () => location.reload();
  };

  // --- コメントモーダル ---
  const openCommentModal = (p) => {
    const m = document.getElementById("commentModal"),
      l = document.getElementById("comment-list-area"),
      t = document.getElementById("commentText");
    document.getElementById("modalTitle").innerText = `${p.user}へのコメント`;
    l.innerHTML =
      (p.comments || [])
        .map((c) => `<div><b>${c.user}:</b> ${c.text}</div>`)
        .join("") || "コメントなし";
    m.style.display = "flex";
    document.getElementById("submit-comment-btn").onclick = async () => {
      if (!t.value) return;
      await api.post("/api/comment", { post_id: p.id, text: t.value });
      m.style.display = "none";
      await sync();
      if (location.hash === "#sns") initSNS();
    };
  };

  // --- ルーティング ---
  const router = async () => {
    const page = (location.hash || "#login").replace("#", "");
    const res = await fetch(`/pages/${page}.html`);
    if (!res.ok) return;
    app.innerHTML = await res.text();
    if (page === "login") initAuth("login");
    else if (page === "signup") initAuth("signup");
    else if (page === "map") initMapPage();
    else if (page === "sns") initSNS();
    else if (page === "folder") initFolderPage();
  };

  window.closeCommentModal = () =>
    (document.getElementById("commentModal").style.display = "none");
  window.addEventListener("hashchange", router);
  router();

  // ARジャイロ連動
  window.addEventListener("deviceorientation", (e) => {
    const ar = document.getElementById("ar-preview"),
      img = document.getElementById("ar-image");
    if (ar && !ar.classList.contains("hidden")) {
      const x = ((e.beta + 90) / 180) * 100,
        y = ((e.gamma + 45) / 90) * 100;
      if (img) img.style.backgroundPosition = `${x}% ${y}%`;
    }
  });
});