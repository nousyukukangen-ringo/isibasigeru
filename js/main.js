document.addEventListener("DOMContentLoaded", () => {
  const app = document.getElementById("app-container");
  let allPosts = [],
    myLikes = new Set();

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
    // 🔥 ここを強化！レスポンスがJSONじゃない場合も考慮するぜ
    del: async (u) => {
      const res = await fetch(u, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
      return res.json();
    },
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

    const feed = document.getElementById("sns-feed");
    const searchInput = document.getElementById("sns-search");
    const openBtn = document.getElementById("open-post-selector");
    const selectorModal = document.getElementById("postSelectorModal");
    const selectionGrid = document.getElementById("my-folder-selection");
    const commentModal = document.getElementById("commentModal");

    // モーダルを閉じる関数（グローバルに公開するか、ここで紐付けるぜ）
    window.closePostSelector = () => selectorModal.style.display = "none";
    window.closeCommentModal = () => commentModal.style.display = "none";

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
        feed.innerHTML = `<p class="empty-msg" style="text-align:center; padding:20px;">瓦版が見つからないぜ、ブラザー！</p>`;
        return;
      }

      displayPosts.forEach((p) => {
        const liked = myLikes.has(p.id);
        const card = document.createElement("article");
        card.className = "post-card";

        // 本人確認フラグ（削除ボタン：ゴミ箱アイコン）
        const deleteBtnHtml = p.is_mine
          ? `<button class="action-btn del-post-btn" title="撤去"><i class="fas fa-trash"></i></button>`
          : "";

        card.innerHTML = `
          <div class="post-header">
            <span class="username">@${p.user || "名無しの権兵衛"}</span>
          </div>
          <div class="post-image" style="background-image:url('${p.filepath}')"></div>
          <div class="post-footer">
            <div class="post-actions">
              <button class="action-btn like-btn ${liked ? "liked" : ""}">
                <i class="${liked ? "fas" : "far"} fa-heart"></i>
                <span class="like-count">${p.likes || 0}</span>
              </button>
              ${deleteBtnHtml}
            </div>
            <div class="post-caption"><b>@${p.user}</b> ${p.caption || ""}</div>
          </div>`;

        // 🔥 いいね！ボタン
        card.querySelector(".like-btn").onclick = async () => {
          try {
            await api.post("/api/like", {
              post_id: p.id,
              action: liked ? "unlike" : "like",
            });
            await sync(); // 同期して最新のmyLikesとallPostsを取得
            render(searchInput.value); // 再描画
          } catch (err) {
            console.error("いいねに失敗だぜ", err);
          }
        };

        // 🗑️ 削除ボタン
        if (p.is_mine) {
          card.querySelector(".del-post-btn").onclick = async () => {
            if (!confirm("この瓦版を剥がして処分するかい？")) return;
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

    // --- 📂 投稿フロー：蔵から写真を選ぶ ---
    if (openBtn) {
      openBtn.onclick = async () => {
        selectorModal.style.display = "flex";
        selectionGrid.innerHTML = '<p class="loading-msg">蔵を物色中...</p>';
        
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
          selectionGrid.innerHTML = "<p style='grid-column: 1/-1; text-align:center;'>蔵が空だ！まずは写し絵を撮ってきな！</p>";
        }
      };
    }

    // --- 🚀 最終投稿：キャプションを添えて世界へ ---
    const openPublishModal = (photo) => {
      const preview = document.getElementById("selected-preview");
      if (preview) preview.style.backgroundImage = `url(${photo.filepath})`;
      commentModal.style.display = "flex";

      const finalPostBtn = document.getElementById("final-post-btn");

      finalPostBtn.onclick = async () => {
        const caption = document.getElementById("commentText").value;

        finalPostBtn.disabled = true;
        finalPostBtn.innerText = "シェア中...";

        try {
          const res = await api.post("/api/sns/post", {
            photo_id: photo.id,
            caption: caption,
          });

          if (res.success) {
            document.getElementById("commentText").value = "";
            commentModal.style.display = "none";
            await sync();
            render();
            alert("世界に瓦版を貼ったぜ、ブラザー！");
          } else {
            alert("しくじった： " + res.message);
          }
        } catch (err) {
          alert("通信エラーだ、もう一度頼む！");
        } finally {
          finalPostBtn.disabled = false;
          finalPostBtn.innerText = "シェアする";
        }
      };
    };

    // 🔍 検索
    if (searchInput) {
      searchInput.oninput = (e) => render(e.target.value);
    }

    // 🗺️ 地図へ戻る
    const backMapBtn = document.getElementById("back-map");
    if (backMapBtn) {
      backMapBtn.onclick = () => (location.hash = "#map");
    }

    render();
  };
  // モーダルクローズ関数
  window.closePostSelector = () =>
    (document.getElementById("postSelectorModal").style.display = "none");
  window.closeCommentModal = () =>
    (document.getElementById("commentModal").style.display = "none");
  // ==========================================
  // 1. 巡礼地図ページの初期化 (initMapPage)
  // ==========================================
const initMapPage = async () => {
    console.log("🚀 システム起動：地図とUIの準備を開始します");
    const loadingScreen = document.getElementById("loading-screen");

    // データの同期（ここで最新の latitude, longitude を含む allPosts を取得）
    await sync();

    // --- UI要素の取得 ---
    const footerDefault = document.getElementById("footer-default");
    const footerCamera = document.getElementById("footer-camera");
    const startBtn = document.getElementById("camera-start");
    const closeBtn = document.getElementById("camera-close");
    const shootBtn = document.getElementById("camera-shoot");
    const saveBtn = document.getElementById("camera-save-edit");
    const video = document.getElementById("camera-video");
    const canvas = document.getElementById("camera-canvas");
    const tools = document.getElementById("graffiti-tools");

    // --- モード切替：写し絵（カメラ）開始 ---
    if (startBtn) {
      startBtn.onclick = async () => {
        footerDefault?.classList.add("hidden");
        footerCamera?.classList.remove("hidden");
        shootBtn?.classList.remove("hidden");
        saveBtn?.classList.add("hidden");

        if (video) {
          video.style.display = "block";
          try {
            const stream = await navigator.mediaDevices.getUserMedia({
              video: { facingMode: "environment" },
            });
            video.srcObject = stream;
          } catch (err) {
            alert("カメラが起動できねぇぜ！");
          }
        }
      };
    }

    // --- モード切替：中止して地図に戻る ---
    if (closeBtn) {
      closeBtn.onclick = () => {
        if (video && video.srcObject) {
          video.srcObject.getTracks().forEach((track) => track.stop());
        }
        location.reload();
      };
    }

    // --- 地図 (Leaflet) のセットアップ ---
    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet/dist/leaflet.js";
    script.onload = async () => {
      const map = L.map("map");
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);

      // ピンのアイコン定義
      const icons = {
        red: L.icon({
          iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png",
          shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png",
          iconSize: [25, 41], iconAnchor: [12, 41],
        }),
        blue: L.icon({
          iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png",
          shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png",
          iconSize: [25, 41], iconAnchor: [12, 41],
        }),
        yellow: L.icon({
          iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-gold.png",
          shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png",
          iconSize: [25, 41], iconAnchor: [12, 41],
        }),
      };

      // ① 現在地（赤ピン）
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          map.setView([latitude, longitude], 15);
          L.marker([latitude, longitude], { icon: icons.red })
            .addTo(map)
            .bindPopup("おぬしの現在地");
        },
        () => map.setView([35.6812, 139.7671], 13)
      );

      // 🔥 ② 【修正完了】いいねした投稿（黄ピン）
      allPosts.forEach((p) => {
        // サーバーが送ってくれる latitude / longitude を直接使う
        const lat = p.latitude;
        const lng = p.longitude;

        if (myLikes.has(p.id) && lat && lng) {
          const yellowMarker = L.marker([lat, lng], { icon: icons.yellow }).addTo(map);
          
          yellowMarker.on("click", () => {
            const ar = document.getElementById("ar-preview");
            const arImg = document.getElementById("ar-image");
            const arDeleteBtn = document.getElementById("ar-delete");

            if (ar && arImg) {
              arImg.style.backgroundImage = `url(${p.filepath})`;
              ar.classList.remove("hidden");
              
              // 他人の投稿なので削除ボタンは隠す
              if (arDeleteBtn) arDeleteBtn.classList.add("hidden");
            }
          });
        }
      });

      // ③ 自分の撮った写し絵（青ピン）
      const j = await api.get("/api/photo/list");
      if (j.success) {
        j.photos.forEach((p) => {
          const lat = p.latitude || p.lat;
          const lng = p.longitude || p.lng;
          if (lat && lng) {
            const m = L.marker([lat, lng], { icon: icons.blue }).addTo(map);
            
            m.on("click", () => {
              const ar = document.getElementById("ar-preview");
              const arImg = document.getElementById("ar-image");
              const arDeleteBtn = document.getElementById("ar-delete");

              if (ar && arImg) {
                arImg.style.backgroundImage = `url(${p.filepath})`;
                ar.classList.remove("hidden");

                if (arDeleteBtn) {
                  arDeleteBtn.classList.remove("hidden"); // 自分のは表示
                  arDeleteBtn.onclick = async () => {
                    if (!confirm("この場所の記録を蔵から抹消するかい、ブラザー？")) return;
                    try {
                      const res = await api.del(`/api/photo/${p.id}`);
                      if (res.success) {
                        ar.classList.add("hidden");
                        map.removeLayer(m);
                        alert("抹消したぜ！");
                      }
                    } catch (err) {
                      alert("削除に失敗したぜ。");
                    }
                  };
                }
              }
            });
          }
        });
      }

      setTimeout(() => {
        map.invalidateSize();
        loadingScreen?.classList.add("loading-hidden");
      }, 500);

      initCameraSystem();
    };
    document.body.appendChild(script);

    // --- 各種ボタンイベントの紐付け ---
    document.getElementById("logout-button").onclick = async () => {
      await api.post("/api/logout");
      location.hash = "#login";
    };
    document.getElementById("goto-sns").onclick = () => (location.hash = "#sns");
    document.getElementById("goto-folder").onclick = () => (location.hash = "#folder");
    
    const arClose = document.getElementById("ar-close");
    if (arClose) {
        arClose.onclick = () => document.getElementById("ar-preview").classList.add("hidden");
    }
  };
  // ==========================================
  // 2. 撮影・落書き・保存 (initCameraSystem)
  // ==========================================
const initCameraSystem = () => {
    const v = document.getElementById("camera-video"),
      can = document.getElementById("camera-canvas"),
      shBtn = document.getElementById("camera-shoot"),
      saveBtn = document.getElementById("camera-save-edit"),
      tools = document.getElementById("graffiti-tools");
    const ctx = can.getContext("2d");
    let drawing = false;

    // --- 📸 撮影ボタン ---
    if (shBtn) {
      shBtn.onclick = () => {
        can.width = v.videoWidth;
        can.height = v.videoHeight;
        ctx.drawImage(v, 0, 0, can.width, can.height);
        v.style.display = "none";
        can.classList.remove("hidden");
        shBtn.classList.add("hidden");
        saveBtn?.classList.remove("hidden");
        tools?.classList.remove("hidden");
        ctx.strokeStyle = "#e63946";
        ctx.lineWidth = 6;
        ctx.lineCap = "round";
      };
    }

    // --- 💾 保存ボタン（名前入力 & 地図へ反映） ---
    if (saveBtn) {
      saveBtn.onclick = async () => {
        // 1. 写し絵に名を授けるぜ
        const photoTitle = prompt("この写し絵に名を付けるなら？", "思い出の場所");
        
        // キャンセルされたら保存を中止するぜ
        if (photoTitle === null) return; 

        saveBtn.innerText = "保存中...";
        saveBtn.disabled = true; // 二重送信防止だ

        const data = can.toDataURL("image/jpeg", 0.8);
        
        navigator.geolocation.getCurrentPosition(async (pos) => {
          try {
            const fd = new FormData();
            const blob = await (await fetch(data)).blob();
            
            fd.append("image", blob, "shie.jpg");
            fd.append("lat", pos.coords.latitude);
            fd.append("lng", pos.coords.longitude);
            fd.append("title", photoTitle || "無題の写し絵"); // 名前をセット！

            const res = await api.form("/api/photo/upload", fd);
            
            if (res.success) {
              alert(`「${photoTitle || "無題の写し絵"}」を蔵に収め、地図に記したぜ！`);
              
              // 2. 地図のページへ戻り、最新のピンを読み込むためにリロードするぜ
              location.hash = "#map"; 
              location.reload(); 
            } else {
              alert("保存に失敗したぜ： " + res.message);
            }
          } catch (err) {
            console.error(err);
            alert("通信エラーだ、ブラザー！");
          } finally {
            saveBtn.innerText = "保存";
            saveBtn.disabled = false;
          }
        }, (err) => {
          alert("位置情報が許可されてねぇみたいだぜ！設定を見てくれ。");
          saveBtn.innerText = "保存";
          saveBtn.disabled = false;
        });
      };
    }

    // --- 🎨 お絵描きロジック ---
    const getPos = (e) => {
      const rect = can.getBoundingClientRect();
      const cx = e.touches ? e.touches[0].clientX : e.clientX;
      const cy = e.touches ? e.touches[0].clientY : e.clientY;
      return {
        x: (cx - rect.left) * (can.width / rect.width),
        y: (cy - rect.top) * (can.height / rect.height),
      };
    };

    can.addEventListener("touchstart", (e) => {
      e.preventDefault();
      drawing = true;
      ctx.beginPath();
      const p = getPos(e);
      ctx.moveTo(p.x, p.y);
    }, { passive: false });

    can.addEventListener("touchmove", (e) => {
      if (!drawing) return;
      e.preventDefault();
      const p = getPos(e);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }, { passive: false });

    can.addEventListener("touchend", () => (drawing = false));

    // 色変更
    document.querySelectorAll(".swatch").forEach((s) => {
      s.onclick = () => {
        ctx.strokeStyle = s.dataset.color;
        // アクティブな色の見た目を変える
        document.querySelectorAll(".swatch").forEach(sw => sw.classList.remove("active"));
        s.classList.add("active");
      };
    });

    // 筆を洗う（クリア）
    document.getElementById("camera-clear").onclick = () => {
      if(confirm("描き直すかい、ブラザー？")) {
        ctx.drawImage(v, 0, 0, can.width, can.height);
      }
    };
  };
const initFolderPage = async () => {
  const j = await api.get("/api/photo/list"),
    list = document.getElementById("folder-list");
  const modal = document.getElementById("preview-modal"),
    img = document.getElementById("preview-image");
  const editCanvas = document.getElementById("edit-canvas"),
    editTools = document.getElementById("edit-tools");
  const editBtn = document.getElementById("preview-edit"),
    saveBtn = document.getElementById("preview-save"),
    deleteBtn = document.getElementById("preview-delete"); // HTMLにいたこいつを確実に捕まえる

  const ctx = editCanvas.getContext("2d");

  let drawing = false,
    currentColor = "#ff0000",
    currentPhotoId = null; // 👈 ここに「今見てる写真のID」を記憶させるぜ

  if (!j.success || !list) return;

  list.innerHTML = "";
  j.photos.forEach((p) => {
    const card = document.createElement("div");
    card.className = "photo-card";
    card.innerHTML = `<div class="photo-thumb" style="background-image:url('${p.filepath}')"></div><div class="photo-title">${p.title || ""}</div>`;

    card.onclick = () => {
      // 1. まず今選んだ写真のIDをセット！
      currentPhotoId = p.id;
      
      // 2. 表示のリセット
      img.src = p.filepath;
      img.classList.remove("hidden");
      editCanvas.classList.add("hidden");
      editTools.classList.add("hidden");
      saveBtn.classList.add("hidden");
      editBtn.classList.remove("hidden");
      document.getElementById("preview-title").innerText = p.title || "";
      modal.classList.remove("hidden");
    };
    list.appendChild(card);
  });

  // 🔥 削除ボタンの処理（ループの外に置くことで、イベントの重複を防ぐぜ！）
  deleteBtn.onclick = async () => {
    if (!currentPhotoId) return; // IDがなきゃ始まらねぇ
    if (!confirm("この作品を蔵から永久に抹消していいのかい、ブラザー？")) return;

    try {
      // HTMLの構造に合わせて確実にDELETEリクエストを送る
      const res = await api.del(`/api/photo/${currentPhotoId}`);
      if (res.success) {
        modal.classList.add("hidden");
        await initFolderPage(); // 蔵（リスト）を更新
      } else {
        alert("しくじった！削除できなかったぜ。");
      }
    } catch (err) {
      console.error("Delete Error:", err);
      alert("通信エラーだ！サーバーに届いてねぇぜ。");
    }
  };

  // --- お絵描き関連（ここは変更なしでOKだ！） ---
  editBtn.onclick = () => {
    editCanvas.width = img.naturalWidth;
    editCanvas.height = img.naturalHeight;
    ctx.drawImage(img, 0, 0);
    img.classList.add("hidden");
    editCanvas.classList.remove("hidden");
    editTools.classList.remove("hidden");
    editBtn.classList.add("hidden");
    saveBtn.classList.remove("hidden");
    ctx.strokeStyle = currentColor;
    ctx.lineWidth = Math.max(editCanvas.width / 50, 5);
    ctx.lineCap = "round";
  };

  // ... (以下、描画ロジックや保存処理などは今のままで大丈夫だぜ！)
  
  // 保存ボタンも currentPhotoId を使うように書き換わってるか確認してくれよな！
  saveBtn.onclick = async () => {
    const data = editCanvas.toDataURL("image/jpeg", 0.8);
    const blob = await (await fetch(data)).blob();
    const fd = new FormData();
    fd.append("image", blob, "edited.jpg");
    fd.append("photo_id", currentPhotoId); // 👈 ここでも使う
    const res = await api.form("/api/photo/upload", fd);
    if (res.success) { modal.classList.add("hidden"); initFolderPage(); }
  };

  document.getElementById("preview-close").onclick = () => modal.classList.add("hidden");
  document.getElementById("back-map").onclick = () => (location.hash = "#map");
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
