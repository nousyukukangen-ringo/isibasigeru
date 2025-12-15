document.addEventListener("DOMContentLoaded", () => {
  const appContainer = document.getElementById("app-container");

  // ==========================================
  // ★グローバル変数（サーバーから取得したデータをここに保管）
  // ==========================================
  
  // 全ユーザーの投稿データ
  let allSnsPosts = []; 
  
  // 自分が「いいね」した投稿IDのリスト
  let myLikedPostIds = new Set();


  // ==========================================
  // ★API通信関数（実際にサーバーへアクセスします）
  // ==========================================
  
  // 1. 投稿データと「いいね」情報を一括取得
  const fetchAllPosts = async () => {
    try {
      const res = await fetch("/api/all_posts"); // サーバーへリクエスト
      if (!res.ok) throw new Error("データ取得失敗");
      
      const json = await res.json();
      if (json.success) {
        // 成功したら変数を更新
        allSnsPosts = json.posts; 
        // サーバーが { my_likes: [1, 5, 10] } のように返してくれる想定
        if (json.my_likes) {
            myLikedPostIds = new Set(json.my_likes);
        }
      }
    } catch (e) {
      console.error("サーバー通信エラー:", e);
      // 本番なのでエラー時はアラートを出すか、静かに失敗させます
      // alert("データの読み込みに失敗しました");
    }
  };

  // 2. ログイン状態の確認
  const fetchMe = async () => {
    try {
        const res = await fetch("/api/me");
        if(res.ok) return await res.json();
    } catch(e) { console.error(e); }
    return { loggedIn: false };
  };

  // 3. ログアウト処理
  const logout = async () => {
    try { await fetch("/api/logout", { method: "POST" }); } catch(e){}
    window.location.hash = "#login";
  };


  // ==========================================
  // ページ初期化処理: ログイン
  // ==========================================
  const initLoginPage = () => {
    const loginBtn = document.getElementById("login-button");
    if(loginBtn) {
        loginBtn.onclick = async () => {
          const email = document.getElementById("login-email").value;
          const password = document.getElementById("login-password").value;

          try {
              const res = await fetch("/api/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
              });
              const result = await res.json();
              
              if (!result.success) {
                  alert(result.message || "ログイン失敗");
                  return;
              }

              // ログイン成功したらすぐに最新データを取得しにいく
              await fetchAllPosts();
              window.location.hash = "#map";

          } catch(e) {
              alert("サーバーエラーが発生しました");
          }
        };
    }
    const signupLink = document.getElementById("goto-signup");
    if(signupLink) signupLink.onclick = () => window.location.hash = "#signup";
  };

  // ==========================================
  // ページ初期化処理: 新規登録
  // ==========================================
  const initSignupPage = () => {
    const signupBtn = document.getElementById("signup-button");
    if(signupBtn) {
        signupBtn.onclick = async () => {
            const email = document.getElementById("signup-email").value;
            const p1 = document.getElementById("signup-password").value;
            const p2 = document.getElementById("signup-password2").value;

            if (p1 !== p2) return alert("パスワードが一致しません");

            try {
                const res = await fetch("/api/signup", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email, password: p1 }),
                });
                const result = await res.json();
                if (!result.success) return alert(result.message);
                
                alert("登録しました。ログインしてください。");
                window.location.hash = "#login";
            } catch(e) {
                alert("通信エラー");
            }
        };
    }
    const loginLink = document.getElementById("goto-login");
    if(loginLink) loginLink.onclick = () => window.location.hash = "#login";
  };


  // ==========================================
  // ★ページ初期化処理: SNS画面 (ここがメイン)
  // ==========================================
  const initSNSPage = async () => {
    // 画面を開いた瞬間にサーバーから最新データを取得
    await fetchAllPosts();

    const feedContainer = document.querySelector('.feed');
    const searchInput = document.querySelector('.search-input');
    
    // --- 描画関数 ---
    const renderFeed = (filterText = "") => {
      if(!feedContainer) return;
      feedContainer.innerHTML = "";

      // 検索フィルタ
      const filteredPosts = allSnsPosts.filter(post => 
        (post.title && post.title.includes(filterText)) || 
        (post.user && post.user.includes(filterText))
      );

      if (filteredPosts.length === 0) {
          feedContainer.innerHTML = "<p style='text-align:center; padding:20px; color:#888;'>投稿がありません</p>";
          return;
      }

      filteredPosts.forEach(post => {
        // いいね状態チェック
        const isLiked = myLikedPostIds.has(post.id);
        const heartIcon = isLiked ? "fas" : "far"; 
        const likedClass = isLiked ? "liked" : "";
        
        // 画像パス (サーバーが返すキー名に合わせてください: filepath か image)
        const imgSrc = post.image || post.filepath || ""; 

        const card = document.createElement('article');
        card.className = 'post-card';
        card.innerHTML = `
          <div class="post-image" style="background-image: url('${imgSrc}'); background-size: cover; background-position: center;">
             ${!imgSrc ? `<span>${post.title}</span>` : ''} 
          </div>
          <div class="post-info">
              <span class="username">${post.user || "ユーザー"}</span>
              <div class="post-actions">
                  <div class="action-btn like-btn ${likedClass}" data-id="${post.id}">
                      <i class="${heartIcon} fa-heart"></i>
                      <span>${(post.likes || 0) + (isLiked ? 0 : 0)}</span>
                  </div>
                  <div class="action-btn comment-btn" data-id="${post.id}">
                      <i class="far fa-comment-dots"></i>
                      <span>コメント</span>
                  </div>
              </div>
          </div>
        `;
        feedContainer.appendChild(card);
      });

      // --- イベント: いいねボタン ---
      document.querySelectorAll('.like-btn').forEach(btn => {
        btn.onclick = async () => {
          const id = parseInt(btn.getAttribute('data-id'));
          const action = myLikedPostIds.has(id) ? "unlike" : "like";

          // UIを即座に更新（体感速度向上）
          if (action === "like") myLikedPostIds.add(id);
          else myLikedPostIds.delete(id);
          renderFeed(searchInput ? searchInput.value : "");

          // サーバーへ送信
          try {
             await fetch("/api/like", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ post_id: id, action: action })
             });
             // 必要ならここで fetchAllPosts() して正確な数値を再取得してもよい
          } catch(e) {
             console.error("いいね送信失敗", e);
             // 失敗したら元に戻す処理などを入れても良い
          }
        };
      });

      // --- イベント: コメントボタン ---
      document.querySelectorAll('.comment-btn').forEach(btn => {
        btn.onclick = () => {
          const id = parseInt(btn.getAttribute('data-id'));
          const post = allSnsPosts.find(p => p.id === id);
          if(post) openSNSCommentModal(post);
        };
      });
    };

    // 初期描画
    renderFeed();

    // 検索イベント
    if(searchInput) {
        searchInput.onkeyup = (e) => renderFeed(e.target.value);
    }

    // 戻るボタン
    const undoBtn = document.querySelector('.footer-btn i.fa-undo');
    if(undoBtn) {
        undoBtn.parentElement.onclick = () => window.location.hash = "#map";
    }

    // --- 投稿ボタン（実際にアップロード） ---
    const playBtn = document.querySelector('.footer-btn i.fa-play');
    const fileInput = document.getElementById('fileInput');
    
    if(playBtn && fileInput) {
        playBtn.parentElement.onclick = () => fileInput.click();
        
        fileInput.onchange = async (e) => {
            if(e.target.files.length === 0) return;
            
            const file = e.target.files[0];
            const fd = new FormData();
            fd.append("image", file);
            fd.append("title", "SNS投稿"); // タイトル入力欄を作る場合はここを変える

            // 位置情報も一緒に送る
            navigator.geolocation.getCurrentPosition(async (pos) => {
                fd.append("lat", pos.coords.latitude);
                fd.append("lng", pos.coords.longitude);
                
                try {
                    const res = await fetch("/api/photo/upload", { method: "POST", body: fd });
                    const j = await res.json();
                    
                    if(j.success) {
                        alert("投稿しました！");
                        // データを再取得してリストを更新
                        await fetchAllPosts();
                        renderFeed();
                    } else {
                        alert("投稿失敗: " + j.message);
                    }
                } catch(err) {
                    alert("アップロード中にエラーが発生しました");
                }
            }, () => {
                alert("位置情報が取得できないため投稿できません");
            });
        };
    }

    // --- コメントモーダル制御 ---
    const modal = document.getElementById('commentModal');
    const modalTitle = document.getElementById('modalTitle');
    const textarea = document.getElementById('commentText');
    
    let commentListDiv = document.getElementById('comment-list-area');
    if (!commentListDiv && modalTitle) {
        commentListDiv = document.createElement('div');
        commentListDiv.id = 'comment-list-area';
        commentListDiv.style.cssText = "text-align:left; margin-bottom:10px; max-height:150px; overflow-y:auto; border-bottom:1px solid #eee;";
        modalTitle.after(commentListDiv);
    }

    let currentPostId = null;

    window.openSNSCommentModal = (post) => {
      currentPostId = post.id;
      modalTitle.innerText = `${post.user || "投稿者"} へのコメント`;
      textarea.value = "";
      
      const comments = post.comments || [];
      commentListDiv.innerHTML = comments.length ? comments.map(c => 
        `<div style="font-size:0.9rem; padding:5px; border-bottom:1px solid #eee;">
           <strong>${c.user}:</strong> ${c.text}
         </div>`
      ).join('') : "<p style='font-size:0.8rem; color:#888;'>コメントなし</p>";
      
      modal.style.display = 'flex';
    };

    window.closeCommentModal = () => {
      modal.style.display = 'none';
    };

    window.submitComment = async () => {
      const text = textarea.value;
      if (!text) return;
      
      try {
          // サーバーへ送信
          const res = await fetch("/api/comment", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ post_id: currentPostId, text: text })
          });
          const j = await res.json();

          if(j.success) {
              alert("コメントしました");
              closeCommentModal();
              // 最新データを再取得して反映
              await fetchAllPosts(); 
              renderFeed(searchInput ? searchInput.value : "");
          } else {
              alert("エラー: " + j.message);
          }
      } catch(e) {
          alert("送信エラー");
      }
    };
  };


  // ==========================================
  // ★ページ初期化処理: マップ画面
  // ==========================================
  const initMapPage = async () => {
    // マップ表示時も最新データを取得
    await fetchAllPosts();

    const logoutBtn = document.getElementById("logout-button");
    if(logoutBtn) logoutBtn.onclick = logout;

    const snsBtn = document.getElementById("goto-sns");
    if(snsBtn) snsBtn.onclick = () => window.location.hash = "#sns";
    
    const folderBtn = document.getElementById("goto-folder");
    if(folderBtn) folderBtn.onclick = () => alert("フォルダ機能は未実装");

    // Leaflet読み込み
    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet/dist/leaflet.js";

    script.onload = () => {
      if(!document.getElementById("map")) return;

      const map = L.map("map");
      
      // マーカーアイコン定義
      const redIcon = L.icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
        iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
      });
      const blueIcon = new L.Icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
        iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
      });
      // ★いいね用アイコン（黄色）
      const yellowIcon = new L.Icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-gold.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
        iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);

      // 現在地へ移動
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          map.setView([lat, lng], 14);
          L.marker([lat, lng], { icon: redIcon }).addTo(map).bindPopup("現在地");
        },
        () => {
             // 取得失敗時はデフォルト位置（東京駅）
             map.setView([35.681236, 139.767125], 14);
        }
      );

      // ==========================================
      // ★マップ上にピンを立てる処理
      // ==========================================
      
      // 1. 全投稿データから「いいね」したものだけ抽出して黄色ピンを立てる
      if(allSnsPosts.length > 0) {
          allSnsPosts.forEach(post => {
              // 自分がいいねしている ＆ 位置情報がある場合
              if (myLikedPostIds.has(post.id) && post.lat && post.lng) {
                  const marker = L.marker([post.lat, post.lng], { icon: yellowIcon }).addTo(map);
                  const imgSrc = post.image || post.filepath || "";
                  
                  marker.bindPopup(`
                      <b>${post.title || "No Title"}</b><br>
                      by ${post.user || "User"}<br>
                      ${imgSrc ? `<img src="${imgSrc}" width="100" style="margin-top:5px;">` : ''}
                  `);
              }
              // ついでに「自分の投稿」も青ピンで立てても良い
              // ここでは既存のAPI(photo/list)を使っている部分は統合してもOK
          });
      }

      // --- 以下、カメラ・AR・既存マーカー表示機能 ---
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

      // カメラ起動
      if(startBtn) {
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
            } catch (err) { alert("カメラエラー: " + err.message); }
          };
      }

      // カメラ停止
      if(closeBtn) {
          closeBtn.onclick = () => {
            if (stream) stream.getTracks().forEach((t) => t.stop());
            cameraVideo.style.display = "none";
            shootBtn.classList.add("hidden");
            closeBtn.classList.add("hidden");
            startBtn.classList.remove("hidden");
          };
      }

      // 撮影
      if(shootBtn) {
          shootBtn.onclick = () => {
            cameraCanvas.width = 1920;
            cameraCanvas.height = 1080;
            const ctx = cameraCanvas.getContext("2d");
            ctx.drawImage(cameraVideo, 0, 0, cameraCanvas.width, cameraCanvas.height);
            currentPhotoData = cameraCanvas.toDataURL("image/jpeg", 0.9);
    
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                currentLatLng = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                closeBtn.onclick();
                titleSection.classList.remove("hidden");
                photoTitleInput.value = "";
              },
              () => alert("位置情報エラー")
            );
          };
      }

      // 撮影データ保存
      if(saveTitleBtn) {
          saveTitleBtn.onclick = async () => {
            const title = photoTitleInput.value.trim();
            if (!currentPhotoData || !title) return alert("データ不足");
    
            const fd = new FormData();
            const blob = await (await fetch(currentPhotoData)).blob();
            fd.append("image", blob, "photo.jpg");
            fd.append("lat", currentLatLng.lat);
            fd.append("lng", currentLatLng.lng);
            fd.append("title", title);

            try {
                const res = await fetch("/api/photo/upload", { method: "POST", body: fd });
                const j = await res.json();
                if(!j.success) throw new Error(j.message);
                
                // 成功したらマップに追加
                const marker = L.marker([currentLatLng.lat, currentLatLng.lng], { icon: blueIcon }).addTo(map);
                marker.bindPopup(title);
                marker.on("click", () => {
                  currentViewingId = j.id; // サーバーが返すID
                  if(arImage) arImage.style.backgroundImage = `url(${j.filepath})`;
                  if(arPreview) arPreview.classList.remove("hidden");
                });
                markersById.set(j.id, { marker, data: { title, filepath: j.filepath } });
                
                // 全投稿リストも更新しておく
                await fetchAllPosts(); 

            } catch(e) {
                alert("保存失敗: " + e.message);
            }
            
            titleSection.classList.add("hidden");
            currentPhotoData = null;
            currentLatLng = null;
          };
      }

      // AR閉じる
      if(arClose) arClose.onclick = () => arPreview.classList.add("hidden");
      
      // 削除ボタン
      if(deleteBtn) {
          deleteBtn.onclick = async () => {
              if(!currentViewingId) return;
              try {
                  await fetch("/api/photo/delete", {
                      method: "POST",
                      headers: {"Content-Type":"application/json"},
                      body: JSON.stringify({id: currentViewingId})
                  });
                  // マーカー削除
                  const target = markersById.get(currentViewingId);
                  if(target) map.removeLayer(target.marker);
                  arPreview.classList.add("hidden");
                  currentViewingId = null;
                  await fetchAllPosts(); // リスト更新
              } catch(e) { alert("削除失敗"); }
          };
      }

      // 自分の過去の投稿読み込み（青ピン）
      const loadMyPhotos = async () => {
        try {
            const res = await fetch("/api/photo/list");
            const j = await res.json();
            if (!j.success) return;
            j.photos.forEach((p) => {
              // 重複防止：allSnsPostsですでに表示されているIDはスキップする処理などを入れてもよい
              const marker = L.marker([p.latitude, p.longitude], { icon: blueIcon }).addTo(map);
              marker.bindPopup(p.title || "");
              marker.on("click", () => {
                currentViewingId = p.id;
                if(arImage) arImage.style.backgroundImage = `url(${p.filepath})`;
                if(arPreview) arPreview.classList.remove("hidden");
              });
              markersById.set(p.id, { marker, data: p });
            });
        } catch(e) {}
      };
      loadMyPhotos();

      // ジャイロ (擬似AR)
      window.addEventListener("deviceorientation", (event) => {
        if (!arPreview || arPreview.classList.contains("hidden")) return;
        const gamma = event.gamma ?? 0;
        const beta = event.beta ?? 0;
        const x = ((beta + 90) / 180) * 100;
        const y = ((gamma + 45) / 90) * 100;
        if(arImage) arImage.style.backgroundPosition = `${x}% ${y}%`;
      });
    };

    document.body.appendChild(script);
  };


  // ==========================================
  // ルーティング (画面切り替え)
  // ==========================================
  const router = async () => {
    const hash = window.location.hash || "#login";
    const page = hash.replace("#", "");

    try {
        let htmlPath = "";
        if (page === "login") htmlPath = "/pages/login.html";
        else if (page === "signup") htmlPath = "/pages/signup.html";
        else if (page === "map") htmlPath = "/pages/map.html";
        else if (page === "sns") htmlPath = "/pages/sns.html";
        
        if(htmlPath) {
            const res = await fetch(htmlPath);
            if(res.ok) {
                appContainer.innerHTML = await res.text();
                // 各ページの初期化関数を実行
                if (page === "login") initLoginPage();
                else if (page === "signup") initSignupPage();
                else if (page === "map") initMapPage();
                else if (page === "sns") initSNSPage();
            } else {
                appContainer.innerHTML = "<h1>Error: 404 Not Found</h1><p>ファイルが見つかりません: " + htmlPath + "</p>";
            }
        }
    } catch(e) {
        console.error("Routing Error", e);
    }
  };

  window.addEventListener("hashchange", router);
  router(); // 初回実行
});