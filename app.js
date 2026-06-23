// ============================================
// CONFIGURAÇÃO DO FIREBASE
// ============================================
const firebaseConfig = {
    apiKey: "AIzaSyB9GkSqTIZ0kbVsba_WOdQeVAETrF9qna0",
    authDomain: "wzzm-ce3fc.firebaseapp.com",
    projectId: "wzzm-ce3fc",
    storageBucket: "wzzm-ce3fc.appspot.com",
    messagingSenderId: "249427877153",
    appId: "1:249427877153:web:0e4297294794a5aadeb260"
};

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

// ============================================
// VARIÁVEIS GLOBAIS
// ============================================
let currentUser = null;
let currentFeed = 'for-you';
let lastDoc = null;
let loading = false;
let hasMore = true;
let currentCategoryFilter = null;
let currentViewingProfile = null;
let currentViewingPost = null;
let isBanned = false;
let notifications = [];
let unreadCount = 0;
let notificationListener = null;

// Categorias
const categories = ['Geral', 'Tecnologia', 'Ciência', 'Arte', 'Música', 'Esportes', 'Games', 'Educação', 'Política', 'Entretenimento'];

// Cores das categorias
const categoryColors = {
    'Geral': '#666', 'Tecnologia': '#2196f3', 'Ciência': '#4caf50',
    'Arte': '#9c27b0', 'Música': '#f44336', 'Esportes': '#ff9800',
    'Games': '#795548', 'Educação': '#00bcd4', 'Política': '#607d8b',
    'Entretenimento': '#e91e63'
};

// ============================================
// FUNÇÕES DE UTILIDADE
// ============================================
function getInitials(name) {
    if (!name) return '?';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length-1][0]).toUpperCase();
    return name.substring(0, 2).toUpperCase();
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getTimeAgo(date) {
    if (!date) return 'agora';
    if (date.toDate) date = date.toDate();
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 60) return 'agora';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
}

function extractLinks(text) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const matches = text.match(urlRegex);
    return matches ? matches[0] : null;
}

function removeLinks(text) {
    return text.replace(/(https?:\/\/[^\s]+)/g, '').trim();
}

// ============================================
// NOTIFICAÇÕES
// ============================================
async function loadNotifications() {
    if (!currentUser) return;
    try {
        const snapshot = await db.collection('notifications')
            .where('userId', '==', currentUser.uid)
            .orderBy('timestamp', 'desc')
            .limit(50)
            .get();
        notifications = [];
        snapshot.forEach(doc => {
            notifications.push({ 
                id: doc.id, 
                ...doc.data(),
                timestamp: doc.data().timestamp || new Date()
            });
        });
        unreadCount = notifications.filter(n => !n.lida).length;
        updateNotificationBadge();
        renderNotifications();
    } catch (error) {
        console.error('Erro ao carregar notificações:', error);
    }
}

function updateNotificationBadge() {
    const badge = document.getElementById('notifBadge');
    if (badge) {
        if (unreadCount > 0) {
            badge.style.display = 'flex';
            badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
        } else {
            badge.style.display = 'none';
        }
    }
}

function renderNotifications() {
    const list = document.getElementById('notificationList');
    if (!list) return;
    if (notifications.length === 0) {
        list.innerHTML = `<div class="notification-empty"><span class="material-icons">notifications_off</span><p>Nenhuma notificação</p></div>`;
        return;
    }
    list.innerHTML = notifications.slice(0, 10).map(notif => `
        <div class="notification-item ${notif.lida ? '' : 'unread'}" onclick="markAsRead('${notif.id}')">
            <div class="notif-title">${escapeHtml(notif.titulo || 'Notificação')}</div>
            <div class="notif-message">${escapeHtml(notif.mensagem || '')}</div>
            <div class="notif-time">${getTimeAgo(notif.timestamp)}</div>
        </div>
    `).join('');
}

async function markAsRead(id) {
    if (!id) return;
    try {
        await db.collection('notifications').doc(id).update({ lida: true });
        const notif = notifications.find(n => n.id === id);
        if (notif && !notif.lida) { notif.lida = true; unreadCount--; updateNotificationBadge(); renderNotifications(); }
    } catch (error) { console.error('Erro:', error); }
}

async function markAllAsRead(event) {
    if (event) event.stopPropagation();
    if (unreadCount === 0) return;
    try {
        const batch = db.batch();
        notifications.filter(n => !n.lida).forEach(n => batch.update(db.collection('notifications').doc(n.id), { lida: true }));
        await batch.commit();
        notifications.forEach(n => n.lida = true);
        unreadCount = 0;
        updateNotificationBadge();
        renderNotifications();
    } catch (error) { console.error('Erro:', error); }
}

function toggleNotifications(event) {
    if (event) event.stopPropagation();
    const dropdown = document.getElementById('notifDropdown');
    if (dropdown) {
        dropdown.classList.toggle('show');
        if (dropdown.classList.contains('show')) loadNotifications();
    }
}

document.addEventListener('click', function(e) {
    if (!e.target.closest('.notification-bell')) {
        const dropdown = document.getElementById('notifDropdown');
        if (dropdown) dropdown.classList.remove('show');
    }
});

function listenNotifications() {
    if (notificationListener) { notificationListener(); notificationListener = null; }
    if (!currentUser) return;
    notificationListener = db.collection('notifications')
        .where('userId', '==', currentUser.uid)
        .orderBy('timestamp', 'desc')
        .limit(50)
        .onSnapshot((snapshot) => {
            notifications = [];
            snapshot.forEach(doc => notifications.push({ id: doc.id, ...doc.data(), timestamp: doc.data().timestamp || new Date() }));
            unreadCount = notifications.filter(n => !n.lida).length;
            updateNotificationBadge();
            renderNotifications();
        }, (error) => console.error('Erro no listener:', error));
}

// ============================================
// REGISTRO DE USUÁRIO
// ============================================
async function registerUser(user) {
    try {
        const uid = user.uid;
        
        // Tenta escrever na coleção 'users'
        try {
            const userRef = db.collection('users').doc(uid);
            const userDoc = await userRef.get();
            const existingData = userDoc.exists ? userDoc.data() : {};
            
            const userData = {
                uid: uid,
                email: user.email || '',
                name: user.displayName || 'Usuário',
                profilePictureUrl: user.photoURL || '',
                isAdmin: existingData.isAdmin || false,
                isBan: existingData.isBan || false,
                isBanned: existingData.isBanned || false,
                isTeacher: false,
                isTeatcher: false,
                createdAt: existingData.createdAt || firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                lastLoginAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            await userRef.set(userData, { merge: true });
            console.log(`Usuário ${uid} registrado na coleção users`);
        } catch (error) {
            console.warn('Erro ao escrever na coleção users:', error.message);
        }
        
        // Tenta escrever na coleção 'usuários'
        try {
            const userRef = db.collection('usuários').doc(uid);
            const userDoc = await userRef.get();
            const existingData = userDoc.exists ? userDoc.data() : {};
            
            const userData = {
                uid: uid,
                email: user.email || '',
                name: user.displayName || 'Usuário',
                profilePictureUrl: user.photoURL || '',
                isAdmin: existingData.isAdmin || false,
                isBan: existingData.isBan || false,
                isBanned: existingData.isBanned || false,
                isTeacher: false,
                isTeatcher: false,
                createdAt: existingData.createdAt || firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                lastLoginAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            await userRef.set(userData, { merge: true });
            console.log(`Usuário ${uid} registrado na coleção usuários`);
        } catch (error) {
            console.warn('Erro ao escrever na coleção usuários:', error.message);
        }
        
        return true;
    } catch (error) {
        console.error('Erro ao registrar usuário:', error);
        return false;
    }
}

// ============================================
// VERIFICAÇÃO DE BANIMENTO
// ============================================
async function checkIfUserIsBanned(user) {
    if (!user) return false;
    
    try {
        // Tenta ler da coleção 'users'
        try {
            const userDoc = await db.collection('users').doc(user.uid).get();
            if (userDoc.exists) {
                const data = userDoc.data();
                if (data.isBanned === true || data.isBan === true) {
                    console.log('⚠️ Usuário banido detectado na coleção users');
                    return true;
                }
            }
        } catch (error) {
            console.warn('Erro ao ler coleção users:', error.message);
        }
        
        // Tenta ler da coleção 'usuários'
        try {
            const userDoc = await db.collection('usuários').doc(user.uid).get();
            if (userDoc.exists) {
                const data = userDoc.data();
                if (data.isBanned === true || data.isBan === true) {
                    console.log('⚠️ Usuário banido detectado na coleção usuários');
                    return true;
                }
            }
        } catch (error) {
            console.warn('Erro ao ler coleção usuários:', error.message);
        }
    } catch (error) {
        console.log("Erro ao verificar banimento:", error);
    }
    
    return false;
}

// ============================================
// FUNÇÃO PARA USUÁRIO BANIDO
// ============================================
function showBannedScreen(reason = 'Violação das políticas de uso') {
    const overlay = document.getElementById('bannedOverlay');
    if (!overlay) {
        console.warn('Overlay de banido não encontrado');
        alert('⚠️ Sua conta foi banida. Motivo: ' + reason);
        return;
    }
    
    const details = document.getElementById('banDetails');
    if (details) {
        details.textContent = `Motivo: ${reason}`;
    }
    overlay.classList.add('show');
    
    const appContainer = document.querySelector('.app-container');
    if (appContainer) {
        appContainer.style.opacity = '0.3';
        appContainer.style.pointerEvents = 'none';
    }
    
    const header = document.querySelector('.header');
    if (header) {
        header.style.opacity = '0.3';
        header.style.pointerEvents = 'none';
    }
    
    const footer = document.querySelector('.site-footer');
    if (footer) {
        footer.style.opacity = '0.3';
        footer.style.pointerEvents = 'none';
    }
    
    console.log('⚠️ Usuário banido detectado:', reason);
}

function removeBannedOverlay() {
    const overlay = document.getElementById('bannedOverlay');
    if (overlay) {
        overlay.classList.remove('show');
    }
    
    const appContainer = document.querySelector('.app-container');
    if (appContainer) {
        appContainer.style.opacity = '1';
        appContainer.style.pointerEvents = 'auto';
    }
    
    const header = document.querySelector('.header');
    if (header) {
        header.style.opacity = '1';
        header.style.pointerEvents = 'auto';
    }
    
    const footer = document.querySelector('.site-footer');
    if (footer) {
        footer.style.opacity = '1';
        footer.style.pointerEvents = 'auto';
    }
}

async function logoutBanned() {
    try { 
        await auth.signOut(); 
        location.reload(); 
    } catch (e) { 
        location.reload(); 
    }
}

// ============================================
// AUTENTICAÇÃO - UI
// ============================================
function updateUI() {
    const avatar = document.getElementById('userAvatar');
    const name = document.getElementById('userName');
    const email = document.getElementById('userEmail');
    const badge = document.getElementById('userBadge');
    const btnLogin = document.getElementById('btnLogin');
    const btnLogout = document.getElementById('btnLogout');
    
    if (currentUser && !isBanned) {
        let displayName = currentUser.displayName || (currentUser.email ? currentUser.email.split('@')[0] : 'Usuário');
        if (avatar) {
            if (currentUser.photoURL) {
                avatar.innerHTML = `<img src="${currentUser.photoURL}" alt="Avatar">`;
            } else {
                avatar.textContent = getInitials(displayName);
            }
        }
        if (name) name.textContent = displayName.length > 20 ? displayName.substring(0,17)+'...' : displayName;
        if (email) email.textContent = currentUser.email || '';
        if (badge) {
            let badges = '';
            if (isBanned) badges += '<span class="badge-banned">🚫 Banido</span> ';
            badge.innerHTML = badges;
        }
        if (btnLogin) btnLogin.style.display = 'none';
        if (btnLogout) btnLogout.style.display = 'inline-block';
    } else {
        if (avatar) avatar.innerHTML = '👤';
        if (name) name.textContent = 'Visitante';
        if (email) email.textContent = '';
        if (badge) badge.innerHTML = '';
        if (btnLogin) btnLogin.style.display = 'inline-block';
        if (btnLogout) btnLogout.style.display = 'none';
    }
}

function showLoginModal() { 
    const modal = document.getElementById('login-modal');
    if (modal) {
        modal.style.display = 'flex';
        modal.classList.add('show');
    } else {
        console.warn('Modal de login não encontrado');
        alert('Por favor, faça login clicando no botão "Entrar"');
    }
}

function closeLoginModal() { 
    const modal = document.getElementById('login-modal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('show');
    }
}

async function loginWithGoogle() {
    try {
        const provider = new firebase.auth.GoogleAuthProvider();
        const result = await auth.signInWithPopup(provider);
        currentUser = result.user;
        
        await registerUser(currentUser);
        
        isBanned = await checkIfUserIsBanned(currentUser);
        if (isBanned) { 
            showBannedScreen('Sua conta foi banida por violação das políticas de uso.');
            await auth.signOut(); 
            updateUI(); 
            return; 
        }
        
        updateUI();
        closeLoginModal();
        await loadNotifications();
        listenNotifications();
        renderMainApp();
    } catch (error) {
        console.error('Erro no login:', error);
        alert('Erro ao fazer login: ' + error.message);
    }
}

async function logout() {
    try {
        await auth.signOut();
        currentUser = null;
        isBanned = false;
        if (notificationListener) { notificationListener(); notificationListener = null; }
        notifications = [];
        unreadCount = 0;
        updateNotificationBadge();
        updateUI();
        renderWelcomeScreen();
    } catch (error) {
        console.error('Erro no logout:', error);
        alert('Erro ao sair: ' + error.message);
    }
}

// ============================================
// CRIAÇÃO DE POST
// ============================================
async function createPost(conteudo, link = null, categoria = 'Geral') {
    if (!currentUser || isBanned) {
        if (isBanned) {
            alert('Sua conta está banida. Não é possível postar.');
        } else {
            alert('Faça login para postar!');
        }
        return false;
    }

    let postText = conteudo.trim();
    let extractedLink = link || extractLinks(postText);
    if (!extractedLink) postText = removeLinks(postText);

    if (postText.length > 127) {
        alert('O texto deve ter no máximo 127 caracteres!');
        return false;
    }

    if (postText.length === 0 && !extractedLink) {
        alert('Digite algo para postar!');
        return false;
    }

    try {
        const postData = {
            userId: currentUser.uid,
            userNome: currentUser.displayName || currentUser.email.split('@')[0],
            userEmail: currentUser.email,
            userAvatar: currentUser.photoURL || null,
            conteudo: postText.substring(0, 127),
            categoria: categoria,
            link: extractedLink,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            likes: 0,
            comentarios: 0,
            usuariosQueCurtiram: []
        };
        await db.collection('Bemtevi').add(postData);
        return true;
    } catch (error) {
        console.error('Erro ao postar:', error);
        alert('Erro ao postar. Tente novamente.');
        return false;
    }
}

// ============================================
// LIKE
// ============================================
async function likePost(postId) {
    if (!currentUser || isBanned) {
        if (isBanned) {
            alert('Sua conta está banida.');
        } else {
            alert('Faça login para curtir!');
        }
        return;
    }

    const postRef = db.collection('Bemtevi').doc(postId);
    const postDoc = await postRef.get();
    const usuariosQueCurtiram = postDoc.data()?.usuariosQueCurtiram || [];

    if (usuariosQueCurtiram.includes(currentUser.uid)) {
        await postRef.update({
            likes: firebase.firestore.FieldValue.increment(-1),
            usuariosQueCurtiram: firebase.firestore.FieldValue.arrayRemove(currentUser.uid)
        });
    } else {
        await postRef.update({
            likes: firebase.firestore.FieldValue.increment(1),
            usuariosQueCurtiram: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
        });
    }
    refreshFeed();
}

// ============================================
// COMENTÁRIOS
// ============================================
async function openComments(postId, postUserId, postUserNome) {
    if (isBanned) {
        alert('Sua conta está banida.');
        return;
    }
    currentViewingPost = { id: postId, userId: postUserId, userNome: postUserNome };
    
    const modal = document.getElementById('comments-modal');
    const container = document.getElementById('comments-container');
    if (!modal || !container) return;
    
    container.innerHTML = '<div class="loading">Carregando comentários...</div>';
    modal.style.display = 'flex';

    try {
        const snapshot = await db.collection('Bemtevi').doc(postId)
            .collection('comentarios')
            .orderBy('createdAt', 'desc')
            .get();

        if (snapshot.empty) {
            container.innerHTML = '<div class="loading">Nenhum comentário ainda. Seja o primeiro!</div>';
        } else {
            container.innerHTML = '';
            snapshot.forEach(doc => {
                const comment = doc.data();
                const commentDate = comment.createdAt?.toDate() || new Date();
                container.innerHTML += `
                    <div class="comment-item">
                        <div class="comment-avatar">${comment.userNome?.charAt(0).toUpperCase() || '?'}</div>
                        <div class="comment-content">
                            <div class="comment-name">${escapeHtml(comment.userNome)}</div>
                            <div class="comment-text">${escapeHtml(comment.conteudo)}</div>
                            <div class="comment-time">${getTimeAgo(commentDate)}</div>
                        </div>
                    </div>
                `;
            });
        }
    } catch (error) {
        console.error('Erro:', error);
        container.innerHTML = '<div class="loading">Erro ao carregar comentários</div>';
    }
}

async function sendComment() {
    if (isBanned) {
        alert('Sua conta está banida. Não é possível comentar.');
        return;
    }
    const commentInput = document.getElementById('comment-input');
    if (!commentInput) return;
    
    const commentText = commentInput.value.trim();
    if (!commentText) {
        alert('Digite um comentário!');
        return;
    }

    if (commentText.length > 280) {
        alert('Comentário muito longo! Máximo 280 caracteres.');
        return;
    }

    try {
        await db.collection('Bemtevi').doc(currentViewingPost.id).collection('comentarios').add({
            userId: currentUser.uid,
            userNome: currentUser.displayName || currentUser.email.split('@')[0],
            conteudo: commentText,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        await db.collection('Bemtevi').doc(currentViewingPost.id).update({
            comentarios: firebase.firestore.FieldValue.increment(1)
        });

        commentInput.value = '';
        await openComments(currentViewingPost.id, currentViewingPost.userId, currentViewingPost.userNome);
        refreshFeed();
    } catch (error) {
        console.error('Erro ao comentar:', error);
        alert('Erro ao enviar comentário.');
    }
}

// ============================================
// PERFIL E SEGUIR
// ============================================
async function openProfile(userId, userName) {
    if (isBanned) {
        alert('Sua conta está banida.');
        return;
    }
    currentViewingProfile = userId;
    
    try {
        const userDoc = await db.collection('usuarios').doc(userId).get();
        const userData = userDoc.exists ? userDoc.data() : { nome: userName, seguidores: [], seguindo: [] };
        
        let isFollowing = false;
        if (currentUser && userId !== currentUser.uid && !isBanned) {
            const followDoc = await db.collection('usuarios').doc(currentUser.uid)
                .collection('seguindo').doc(userId).get();
            isFollowing = followDoc.exists;
        }

        const postsSnapshot = await db.collection('Bemtevi')
            .where('userId', '==', userId)
            .orderBy('createdAt', 'desc')
            .limit(10)
            .get();

        let postsHtml = '';
        postsSnapshot.forEach(doc => {
            const post = doc.data();
            postsHtml += `
                <div class="post-card" style="padding:15px;">
                    <div class="post-content" style="padding-left:0">
                        ${escapeHtml(post.conteudo)}
                        ${post.link ? `<a href="${post.link}" target="_blank" class="post-link" style="margin-top:8px;">🔗 ${post.link.substring(0, 40)}</a>` : ''}
                    </div>
                    <div class="post-stats" style="padding-left:0">
                        <span>❤️ ${post.likes || 0}</span>
                        <span>💬 ${post.comentarios || 0}</span>
                    </div>
                </div>
            `;
        });

        const modal = document.getElementById('profile-modal');
        const content = document.getElementById('profile-content');
        if (!modal || !content) return;
        
        content.innerHTML = `
            <div class="profile-header">
                <div class="profile-avatar">${(userData.nome || userName)?.charAt(0).toUpperCase() || '?'}</div>
                <h3>${escapeHtml(userData.nome || userName)}</h3>
                <div style="opacity:0.8;">@${userId.substring(0, 8)}</div>
                ${currentUser && userId !== currentUser.uid && !isBanned ? `
                    <button class="follow-btn ${isFollowing ? 'following' : ''}" onclick="toggleFollow('${userId}')">
                        ${isFollowing ? '✓ Seguindo' : '+ Seguir'}
                    </button>
                ` : ''}
                <div class="profile-stats">
                    <div><div class="stat-number">${userData.seguidores?.length || 0}</div><div>Seguidores</div></div>
                    <div><div class="stat-number">${userData.seguindo?.length || 0}</div><div>Seguindo</div></div>
                    <div><div class="stat-number">${postsSnapshot.size}</div><div>Posts</div></div>
                </div>
            </div>
            <h4 style="margin: 20px 0 10px; color:#ffffff;">📝 Últimas postagens</h4>
            <div id="profile-posts">${postsHtml || '<div class="loading">Nenhuma postagem ainda.</div>'}</div>
        `;
        modal.style.display = 'flex';
    } catch (error) {
        console.error('Erro ao abrir perfil:', error);
        alert('Erro ao carregar perfil');
    }
}

async function toggleFollow(userIdToFollow) {
    if (!currentUser || userIdToFollow === currentUser.uid || isBanned) {
        if (isBanned) {
            alert('Sua conta está banida.');
        }
        return;
    }

    try {
        const followingRef = db.collection('usuarios').doc(currentUser.uid).collection('seguindo').doc(userIdToFollow);
        const followersRef = db.collection('usuarios').doc(userIdToFollow).collection('seguidores').doc(currentUser.uid);
        
        const followingDoc = await followingRef.get();

        if (followingDoc.exists) {
            await followingRef.delete();
            await followersRef.delete();
            console.log('Deixou de seguir com sucesso');
        } else {
            await followingRef.set({
                userId: userIdToFollow,
                seguidoDesde: firebase.firestore.FieldValue.serverTimestamp()
            });
            await followersRef.set({
                seguidorId: currentUser.uid,
                seguidoDesde: firebase.firestore.FieldValue.serverTimestamp()
            });
            console.log('Seguiu com sucesso');
        }

        if (currentViewingProfile === userIdToFollow) {
            await openProfile(userIdToFollow, '');
        }
        await loadSuggestions();
        await refreshFeed();
        
    } catch (error) {
        console.error('Erro detalhado ao seguir:', error);
        if (error.code === 'permission-denied') {
            alert('Erro de permissão. Por favor, recarregue a página e tente novamente.');
        } else {
            alert('Erro ao seguir usuário: ' + error.message);
        }
    }
}

// ============================================
// SUGESTÕES
// ============================================
async function loadSuggestions() {
    if (!currentUser || isBanned) return;

    const container = document.getElementById('suggestions-container');
    if (!container) return;

    try {
        const followingSnapshot = await db.collection('usuarios').doc(currentUser.uid).collection('seguindo').get();
        const followingIds = followingSnapshot.docs.map(doc => doc.id);
        followingIds.push(currentUser.uid);

        const usersSnapshot = await db.collection('usuarios').limit(10).get();
        const suggestions = usersSnapshot.docs.filter(doc => !followingIds.includes(doc.id)).slice(0, 5);

        if (suggestions.length === 0) {
            container.innerHTML = '<div style="text-align:center; color:#888888;">Nenhuma sugestão no momento</div>';
            return;
        }

        container.innerHTML = suggestions.map(doc => {
            const userData = doc.data();
            return `
                <div class="suggestion-user">
                    <div class="suggestion-info" onclick="openProfile('${doc.id}', '${userData.nome}')">
                        <div class="suggestion-avatar">${userData.nome?.charAt(0).toUpperCase() || '?'}</div>
                        <div>
                            <div style="font-weight:600; font-size:14px; color:#ffffff;">${escapeHtml(userData.nome || 'Usuário')}</div>
                            <div style="font-size:11px; color:#888888;">@${doc.id.substring(0, 8)}</div>
                        </div>
                    </div>
                    <button class="follow-small-btn" onclick="toggleFollow('${doc.id}')">Seguir</button>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('Erro ao carregar sugestões:', error);
        container.innerHTML = '<div style="text-align:center; color:#888888;">Erro ao carregar sugestões</div>';
    }
}

// ============================================
// CARREGAR POSTS
// ============================================
async function loadPosts(reset = false) {
    if (loading || isBanned) return;
    if (reset) {
        lastDoc = null;
        hasMore = true;
        const postsContainer = document.getElementById('posts-container');
        if (postsContainer) postsContainer.innerHTML = '';
    }
    if (!hasMore) return;

    loading = true;
    const loadingIndicator = document.getElementById('loading-indicator');
    if (loadingIndicator) loadingIndicator.style.display = 'block';

    try {
        let query = db.collection('Bemtevi').orderBy('createdAt', 'desc');

        if (currentFeed === 'my-posts' && currentUser) {
            query = db.collection('Bemtevi').where('userId', '==', currentUser.uid).orderBy('createdAt', 'desc');
        } else if (currentCategoryFilter) {
            query = db.collection('Bemtevi').where('categoria', '==', currentCategoryFilter).orderBy('createdAt', 'desc');
        }

        if (lastDoc) query = query.startAfter(lastDoc);
        const snapshot = await query.limit(20).get();

        const postsContainer = document.getElementById('posts-container');
        if (!postsContainer) {
            loading = false;
            return;
        }

        if (snapshot.empty) {
            hasMore = false;
            if (reset && postsContainer.children.length === 0) {
                postsContainer.innerHTML = '<div class="loading">Nenhuma postagem encontrada!</div>';
            }
            loading = false;
            if (loadingIndicator) loadingIndicator.style.display = 'none';
            return;
        }

        lastDoc = snapshot.docs[snapshot.docs.length - 1];
        hasMore = snapshot.docs.length === 20;

        snapshot.forEach(doc => {
            const post = { id: doc.id, ...doc.data() };
            const postDate = post.createdAt?.toDate() || new Date();
            const isLiked = currentUser && post.usuariosQueCurtiram?.includes(currentUser.uid) && !isBanned;
            
            const postHtml = `
                <div class="post-card">
                    <div class="post-header" onclick="openProfile('${post.userId}', '${post.userNome}')">
                        <div class="post-avatar-img">${post.userNome?.charAt(0).toUpperCase() || '?'}</div>
                        <div>
                            <span class="post-user-name">${escapeHtml(post.userNome)}</span>
                            <span class="post-user-id">@${post.userId?.substring(0, 8)}</span>
                            <span class="post-time">• ${getTimeAgo(postDate)}</span>
                        </div>
                    </div>
                    <div class="post-category" style="background:${categoryColors[post.categoria] || '#666'}20; color:${categoryColors[post.categoria] || '#666'}">
                        ${post.categoria || 'Geral'}
                    </div>
                    <div class="post-content">
                        ${escapeHtml(post.conteudo)}
                        ${post.link ? `<a href="${post.link}" target="_blank" class="post-link" onclick="event.stopPropagation()">🔗 ${post.link.substring(0, 50)}${post.link.length > 50 ? '...' : ''}</a>` : ''}
                    </div>
                    <div class="post-stats">
                        <span class="stat-action ${isLiked ? 'liked' : ''}" onclick="likePost('${post.id}')">
                            <span class="material-icons" style="font-size:18px;">${isLiked ? 'favorite' : 'favorite_border'}</span> ${post.likes || 0}
                        </span>
                        <span class="stat-action" onclick="openComments('${post.id}', '${post.userId}', '${post.userNome}')">
                            <span class="material-icons" style="font-size:18px;">chat_bubble_outline</span> ${post.comentarios || 0}
                        </span>
                        <span class="stat-action" onclick="sharePost('${post.id}')">
                            <span class="material-icons" style="font-size:18px;">share</span>
                        </span>
                    </div>
                </div>
            `;
            postsContainer.insertAdjacentHTML('beforeend', postHtml);
        });
    } catch (error) {
        console.error('Erro ao carregar posts:', error);
        const postsContainer = document.getElementById('posts-container');
        if (postsContainer) {
            postsContainer.innerHTML = '<div class="loading">Erro ao carregar posts. Recarregue a página.</div>';
        }
    } finally {
        loading = false;
        const loadingIndicator = document.getElementById('loading-indicator');
        if (loadingIndicator) loadingIndicator.style.display = 'none';
    }
}

async function sharePost(postId) {
    try {
        await navigator.clipboard.writeText(`${window.location.origin}/post/${postId}`);
        alert('Link copiado!');
    } catch (error) {
        alert('Erro ao copiar link.');
    }
}

function refreshFeed() {
    lastDoc = null;
    hasMore = true;
    loadPosts(true);
}

// ============================================
// RENDERIZAÇÃO
// ============================================
function renderMainApp() {
    const container = document.getElementById('app');
    if (!container) return;
    
    container.innerHTML = `
        <div class="app-container">
            <div class="sidebar-left">
                <div class="card">
                    <div class="logo">
                        <span class="logo-icon">🐦</span>
                        <span class="logo-text">Bemtevi</span>
                    </div>
                    <ul class="nav-menu">
                        <li class="nav-item ${currentFeed === 'for-you' ? 'active' : ''}" onclick="changeFeed('for-you')">
                            <span class="material-icons">home</span> Para Você
                        </li>
                        <li class="nav-item ${currentFeed === 'my-posts' ? 'active' : ''}" onclick="changeFeed('my-posts')">
                            <span class="material-icons">person</span> Minhas Postagens
                        </li>
                    </ul>
                    <div style="margin-top:20px; padding-top:20px; border-top:1px solid #2a2a2a; cursor:pointer;" onclick="openProfile('${currentUser.uid}', '${currentUser.displayName || currentUser.email.split('@')[0]}')">
                        <div style="display:flex; align-items:center; gap:12px;">
                            <div class="post-avatar" style="width:40px; height:40px;">${currentUser.displayName?.charAt(0).toUpperCase() || currentUser.email.charAt(0).toUpperCase()}</div>
                            <div>
                                <div style="font-weight:600; color:#ffffff;">${escapeHtml(currentUser.displayName || currentUser.email.split('@')[0])}</div>
                                <div style="font-size:12px; color:#888888;">@${currentUser.uid.substring(0, 8)}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div>
                <div class="feed-header"><div class="feed-title">📱 Feed</div></div>
                <div class="post-box">
                    <div class="post-input-area">
                        <div class="post-avatar">${currentUser.displayName?.charAt(0).toUpperCase() || currentUser.email.charAt(0).toUpperCase()}</div>
                        <div class="post-input-container">
                            <textarea id="postText" class="post-input" rows="3" placeholder="O que está acontecendo? (Máx. 127 caracteres)" maxlength="127"></textarea>
                            <div id="charCounter" class="char-counter">0/127</div>
                            <div class="post-actions">
                                <select id="postCategory" class="btn-secondary">${categories.map(cat => `<option value="${cat}">📁 ${cat}</option>`).join('')}</select>
                                <input type="text" id="postLink" class="btn-secondary" placeholder="🔗 Link (opcional)" style="width:200px;">
                                <button class="btn-primary" onclick="submitPost()">Postar 🚀</button>
                            </div>
                        </div>
                    </div>
                </div>
                <div id="posts-container" class="posts-container"></div>
                <div id="loading-indicator" class="loading" style="display:none;">Carregando mais posts...</div>
            </div>

            <div class="sidebar-right">
                <div class="card">
                    <div class="box-title" style="font-weight:700; margin-bottom:15px;">📂 Categorias</div>
                    ${categories.map(cat => `<span class="category-chip ${currentCategoryFilter === cat ? 'selected' : ''}" onclick="filterByCategory('${cat}')">${cat}</span>`).join('')}
                    <span class="category-chip ${!currentCategoryFilter ? 'selected' : ''}" onclick="clearCategoryFilter()">Todos</span>
                </div>
                <div class="card">
                    <div class="box-title" style="font-weight:700; margin-bottom:15px;">👥 Sugestões</div>
                    <div id="suggestions-container"></div>
                </div>
            </div>
        </div>
    `;

    const postText = document.getElementById('postText');
    if (postText) {
        postText.addEventListener('input', function() {
            const len = this.value.length;
            const counter = document.getElementById('charCounter');
            if (counter) {
                counter.innerHTML = `${len}/127`;
                counter.className = len > 110 ? 'char-counter warning' : len > 120 ? 'char-counter danger' : 'char-counter';
            }
        });
    }

    loadPosts(true);
    loadSuggestions();
    
    window.removeEventListener('scroll', handleScroll);
    window.addEventListener('scroll', handleScroll);
}

function handleScroll() {
    if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 500) {
        loadPosts();
    }
}

function renderWelcomeScreen() {
    const container = document.getElementById('app');
    if (!container) return;
    
    container.innerHTML = `
        <div class="login-container">
            <div class="login-box">
                <div class="logo" style="justify-content:center; margin-bottom:30px;">
                    <span class="logo-icon">🐦</span>
                    <span class="logo-text">Bemtevi</span>
                </div>
                <h2 style="margin-bottom:20px;">Bem-vindo!</h2>
                <p style="color:#aaaaaa; margin-bottom:30px;">Uma rede social livre e colaborativa</p>
                <button id="google-login-welcome" class="btn-primary" style="width:100%;">🔑 Entrar com Google</button>
                <div style="margin-top:20px; font-size:12px; color:#666666;">Postagens de até 127 caracteres • Comentários • Curtidas</div>
            </div>
        </div>
    `;
    
    const loginBtn = document.getElementById('google-login-welcome');
    if (loginBtn) loginBtn.addEventListener('click', loginWithGoogle);
}

// ============================================
// FUNÇÕES GLOBAIS (expostas para HTML)
// ============================================
window.changeFeed = function(feed) {
    if (isBanned) return;
    currentFeed = feed;
    currentCategoryFilter = null;
    lastDoc = null;
    hasMore = true;
    renderMainApp();
};

window.filterByCategory = function(category) {
    if (isBanned) return;
    currentCategoryFilter = category;
    currentFeed = 'for-you';
    lastDoc = null;
    hasMore = true;
    renderMainApp();
};

window.clearCategoryFilter = function() {
    if (isBanned) return;
    currentCategoryFilter = null;
    lastDoc = null;
    hasMore = true;
    renderMainApp();
};

window.submitPost = async function() {
    if (isBanned) {
        alert('Sua conta está banida. Não é possível postar.');
        return;
    }
    const text = document.getElementById('postText')?.value;
    const link = document.getElementById('postLink')?.value;
    const category = document.getElementById('postCategory')?.value || 'Geral';
    if (await createPost(text, link, category)) {
        const postText = document.getElementById('postText');
        const postLink = document.getElementById('postLink');
        if (postText) postText.value = '';
        if (postLink) postLink.value = '';
        refreshFeed();
    }
};

window.closeModal = function(id) {
    const modal = document.getElementById(id);
    if (modal) modal.style.display = 'none';
};

window.toggleFollow = toggleFollow;
window.openProfile = openProfile;
window.openComments = openComments;
window.sendComment = sendComment;
window.likePost = likePost;
window.sharePost = sharePost;
window.logout = logout;
window.logoutBanned = logoutBanned;
window.showLoginModal = showLoginModal;
window.loginWithGoogle = loginWithGoogle;
window.markAllAsRead = markAllAsRead;
window.toggleNotifications = toggleNotifications;

// ============================================
// INICIALIZAÇÃO
// ============================================
document.addEventListener('DOMContentLoaded', function() {
    const googleBtn = document.getElementById('google-login-btn');
    if (googleBtn) googleBtn.addEventListener('click', loginWithGoogle);
});

auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        await registerUser(user);
        isBanned = await checkIfUserIsBanned(user);
        if (isBanned) { 
            showBannedScreen('Sua conta foi banida por violação das políticas de uso.');
            await auth.signOut(); 
            updateUI(); 
            return; 
        }
        updateUI();
        await loadNotifications();
        listenNotifications();
        renderMainApp();
    } else {
        currentUser = null;
        isBanned = false;
        updateUI();
        if (notificationListener) { notificationListener(); notificationListener = null; }
        notifications = [];
        unreadCount = 0;
        updateNotificationBadge();
        removeBannedOverlay();
        renderWelcomeScreen();
    }
});

console.log('🐦 Bemtevi - Rede Social Beta inicializada com sucesso!');
console.log('🔔 Notificações integradas via coleção "notifications"');
//saida
