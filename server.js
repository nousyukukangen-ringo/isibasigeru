// server.js (厨房のプログラム)
const express = require('express');
const app = express();
const path = require('path');
const multer = require('multer'); // 画像アップロード用

// 設定
app.use(express.json());
app.use(express.static(__dirname)); // 今のフォルダ内のファイルを公開

// --- 擬似データベース（メモリ上に保存） ---
let posts = [
    {
        id: 1,
        user: "初期ユーザーA",
        title: "テスト投稿: 東京駅",
        image: "https://via.placeholder.com/400x300/4A76C7/FFFFFF?text=Tokyo+Station",
        lat: 35.681236, lng: 139.767125,
        likes: 5,
        comments: [{ user: "Bさん", text: "いいですね！" }]
    },
    {
        id: 2,
        user: "初期ユーザーB",
        title: "テスト投稿: 大阪城",
        image: "https://via.placeholder.com/400x300/e67e22/FFFFFF?text=Osaka+Castle",
        lat: 34.687315, lng: 135.526201,
        likes: 10,
        comments: []
    }
];
let userLikes = { "me": [1] };

// --- API (注文を受ける窓口) ---

// 1. 全投稿取得
app.get('/api/all_posts', (req, res) => {
    res.json({ 
        success: true, 
        posts: posts,
        my_likes: userLikes["me"] || []
    });
});

// 2. いいね機能
app.post('/api/like', (req, res) => {
    const { post_id, action } = req.body;
    const post = posts.find(p => p.id === post_id);
    if (post) {
        if (action === 'like') {
            post.likes++;
            if(!userLikes["me"]) userLikes["me"] = [];
            userLikes["me"].push(post_id);
        } else {
            post.likes--;
            if(userLikes["me"]) userLikes["me"] = userLikes["me"].filter(id => id !== post_id);
        }
    }
    res.json({ success: true });
});

// 3. コメント機能
app.post('/api/comment', (req, res) => {
    const { post_id, text } = req.body;
    const post = posts.find(p => p.id === post_id);
    if (post) post.comments.push({ user: "自分", text });
    res.json({ success: true });
});

// 4. 画像アップロード機能（簡易版）
const upload = multer(); 
app.post('/api/photo/upload', upload.single('image'), (req, res) => {
    const { title, lat, lng } = req.body;
    const newPost = {
        id: Date.now(),
        user: "自分",
        title: title || "新規投稿",
        // 緑色のダミー画像を返す
        image: "https://via.placeholder.com/400x300/16a085/FFFFFF?text=New+Upload", 
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        likes: 0,
        comments: []
    };
    posts.unshift(newPost);
    res.json({ success: true, id: newPost.id, filepath: newPost.image });
});

// その他のAPI
app.get('/api/me', (req, res) => res.json({ loggedIn: true, user: "TestUser" }));
app.post('/api/login', (req, res) => res.json({ success: true }));
app.post('/api/logout', (req, res) => res.json({ success: true }));
app.get('/api/photo/list', (req, res) => res.json({ success: true, photos: [] }));

// サーバー起動
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`サーバーが起動しました！`);
    console.log(`http://localhost:${PORT} にアクセスしてください`);
});