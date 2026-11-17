const conversationsList = document.getElementById('conversationsList');
const logoutBtn = document.getElementById('logoutBtn');
let currentUserId = null;

async function loadInbox() {
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) {
    window.location.href = 'login.html';
    return;
  }
  currentUserId = user.id;

  const { data: connections, error } = await supabaseClient
    .from('connections')
    .select('id, requester:requester_id(id, full_name, avatar_url), receiver:receiver_id(id, full_name, avatar_url)')
    .eq('status', 'accepted')
    .or(`requester_id.eq.${currentUserId},receiver_id.eq.${currentUserId}`);

  if (error) {
    conversationsList.innerHTML = `<p class="empty-note">Couldn't load messages: ${error.message}</p>`;
    return;
  }

  if (!connections || connections.length === 0) {
    conversationsList.innerHTML = `<p class="empty-note">No conversations yet — connect with someone on Browse first.</p>`;
    return;
  }

  const connectionIds = connections.map(c => c.id);

  const { data: allMessages } = await supabaseClient
    .from('messages')
    .select('id, connection_id, sender_id, content, image_url, created_at, read_at')
    .in('connection_id', connectionIds)
    .order('created_at', { ascending: true });

  const byConnection = {};
  (allMessages || []).forEach(m => {
    if (!byConnection[m.connection_id]) byConnection[m.connection_id] = [];
    byConnection[m.connection_id].push(m);
  });

  const rows = connections.map(c => {
    const other = c.requester.id === currentUserId ? c.receiver : c.requester;
    const msgs = byConnection[c.id] || [];
    const last = msgs[msgs.length - 1] || null;
    const unreadCount = msgs.filter(m => m.sender_id !== currentUserId && !m.read_at).length;

    return { connectionId: c.id, other, last, unreadCount };
  });

  // Most recently active conversations first
  rows.sort((a, b) => {
    const timeA = a.last ? new Date(a.last.created_at).getTime() : 0;
    const timeB = b.last ? new Date(b.last.created_at).getTime() : 0;
    return timeB - timeA;
  });

  conversationsList.innerHTML = rows.map(renderRow).join('');
}

function renderRow(row) {
  const avatarSrc = row.other.avatar_url || defaultAvatar(row.other.full_name);
  let preview = 'Say hi 👋';
  let timeLabel = '';

  if (row.last) {
    preview = row.last.content ? escapeHtml(row.last.content) : '📷 Photo';
    timeLabel = timeAgo(row.last.created_at);
  }

  return `
    <a href="chat.html?id=${row.connectionId}" class="convo-row">
      <img src="${avatarSrc}" alt="${row.other.full_name}">
      <div class="convo-info">
        <div class="convo-name">${row.other.full_name}</div>
        <div class="convo-preview ${row.unreadCount > 0 ? 'unread' : ''}">${preview}</div>
      </div>
      <div style="display:flex; flex-direction:column; align-items:flex-end; gap:6px;">
        <span class="convo-time">${timeLabel}</span>
        ${row.unreadCount > 0 ? `<span class="unread-dot"></span>` : ''}
      </div>
    </a>
  `;
}

function timeAgo(dateStr) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function defaultAvatar(name) {
  const initial = (name || '?').charAt(0).toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="52" height="52"><rect width="100%" height="100%" fill="#333333"/><text x="50%" y="50%" font-family="sans-serif" font-size="22" fill="white" text-anchor="middle" dy=".35em">${initial}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

logoutBtn.addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
  window.location.href = 'index.html';
});

loadInbox();
