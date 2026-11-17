const messagesList = document.getElementById('messagesList');
const composerForm = document.getElementById('composerForm');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const otherAvatar = document.getElementById('otherAvatar');
const otherName = document.getElementById('otherName');
const otherCity = document.getElementById('otherCity');

const emojiToggleBtn = document.getElementById('emojiToggleBtn');
const emojiPanel = document.getElementById('emojiPanel');
const imageToggleBtn = document.getElementById('imageToggleBtn');
const imageInput = document.getElementById('imageInput');
const imagePreviewBar = document.getElementById('imagePreviewBar');
const imagePreviewImg = document.getElementById('imagePreviewImg');
const removePreviewBtn = document.getElementById('removePreviewBtn');

let currentUserId = null;
let mode = null; // 'connection' or 'group'
let connectionId = null;
let groupId = null;
let selectedImageFile = null;
let groupMemberIds = []; // for group "Seen by N" calculation
let groupReadsMap = {};  // user_id -> last_read_at, for group "Seen by N"

const EMOJIS = ['😀','😂','😍','😊','😉','😎','🤔','😅','😢','😭','😡','👍','👎','🙏','👏','💪','🔥','🎉','❤️','💯',
  '🏸','🏏','⚽','🏃','🥾','🧘','📷','🎲','🎸','📚','🚴','💃','😴','🤝','✅','❌','⏰','📍','☀️','🌧️'];

function getParams() {
  const params = new URLSearchParams(window.location.search);
  return { id: params.get('id'), group: params.get('group') };
}

async function init() {
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) {
    window.location.href = 'login.html';
    return;
  }
  currentUserId = user.id;

  const { id, group } = getParams();

  if (group) {
    mode = 'group';
    groupId = group;
    await initGroup();
  } else if (id) {
    mode = 'connection';
    connectionId = id;
    await initConnection();
  } else {
    messagesList.innerHTML = `<p class="empty-note">No conversation selected. Go back to Messages and pick someone to chat with.</p>`;
    composerForm.style.display = 'none';
    return;
  }

  await loadMessages();
  await markDelivered();
  await markRead();
  subscribeToNewMessages();
  setupEmojiPicker();
}
init();

async function initConnection() {
  const { data: connection, error: connError } = await supabaseClient
    .from('connections')
    .select('id, status, requester:requester_id(id, full_name, city, avatar_url), receiver:receiver_id(id, full_name, city, avatar_url)')
    .eq('id', connectionId)
    .single();

  if (connError || !connection) {
    messagesList.innerHTML = `<p class="empty-note">Couldn't load this conversation.</p>`;
    composerForm.style.display = 'none';
    throw new Error('stop');
  }

  const isMine = connection.requester.id === currentUserId || connection.receiver.id === currentUserId;
  if (!isMine || connection.status !== 'accepted') {
    messagesList.innerHTML = `<p class="empty-note">This conversation isn't available.</p>`;
    composerForm.style.display = 'none';
    throw new Error('stop');
  }

  const other = connection.requester.id === currentUserId ? connection.receiver : connection.requester;

  const blocked = await isBlockedEitherWay(currentUserId, other.id);
  if (blocked) {
    messagesList.innerHTML = `<p class="empty-note">This conversation isn't available.</p>`;
    composerForm.style.display = 'none';
    otherName.textContent = 'Unavailable';
    otherCity.textContent = '';
    throw new Error('stop');
  }

  otherName.textContent = other.full_name;
  otherCity.textContent = `📍 ${other.city}`;
  otherAvatar.src = other.avatar_url || defaultAvatar(other.full_name);

  const headerProfileLink = document.getElementById('headerProfileLink');
  if (headerProfileLink) headerProfileLink.href = `profile-view.html?id=${other.id}`;

  window.__activeChatConnectionId = connectionId;
}

async function initGroup() {
  const { data: group, error: groupError } = await supabaseClient
    .from('chat_groups')
    .select('id, name')
    .eq('id', groupId)
    .single();

  if (groupError || !group) {
    messagesList.innerHTML = `<p class="empty-note">Couldn't load this group.</p>`;
    composerForm.style.display = 'none';
    throw new Error('stop');
  }

  const { data: members } = await supabaseClient
    .from('group_members')
    .select('user_id')
    .eq('group_id', groupId);

  groupMemberIds = (members || []).map(m => m.user_id);

  otherName.textContent = group.name;
  otherCity.textContent = `${groupMemberIds.length} member${groupMemberIds.length === 1 ? '' : 's'}`;
  otherAvatar.src = groupAvatarDataUri();

  const headerProfileLink = document.getElementById('headerProfileLink');
  if (headerProfileLink) headerProfileLink.style.cursor = 'default';
  headerProfileLink?.addEventListener('click', (e) => e.preventDefault());

  await refreshGroupReads();

  window.__activeChatGroupId = groupId;
}

async function refreshGroupReads() {
  const { data: reads } = await supabaseClient
    .from('group_reads')
    .select('user_id, last_read_at')
    .eq('group_id', groupId);
  groupReadsMap = {};
  (reads || []).forEach(r => { groupReadsMap[r.user_id] = r.last_read_at; });
}

async function loadMessages() {
  const columns = mode === 'group'
    ? 'id, sender_id, content, image_url, created_at, edited_at, deleted, profiles(full_name)'
    : 'id, sender_id, content, image_url, created_at, edited_at, deleted, read_at, delivered_at';

  const query = supabaseClient.from('messages').select(columns).order('created_at', { ascending: true });

  const { data: messages, error } = mode === 'group'
    ? await query.eq('group_id', groupId)
    : await query.eq('connection_id', connectionId);

  if (error) {
    messagesList.innerHTML = `<p class="empty-note">Couldn't load messages: ${error.message}</p>`;
    return;
  }

  if (!messages || messages.length === 0) {
    messagesList.innerHTML = `<p class="empty-note">No messages yet — say hi 👋</p>`;
    return;
  }

  messagesList.innerHTML = messages.map(renderMessage).join('');
  scrollToBottom();
  attachBubbleMenus();
}

function renderMessage(msg) {
  const mine = msg.sender_id === currentUserId;
  const time = new Date(msg.created_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const senderLabel = (mode === 'group' && !mine && msg.profiles)
    ? `<div class="msg-sender-label">${escapeHtml(msg.profiles.full_name)}</div>`
    : '';

  if (msg.deleted) {
    return `
      <div class="msg-row ${mine ? 'mine' : 'theirs'}" id="msg-${msg.id}">
        <div class="msg-bubble msg-deleted">
          ${senderLabel}
          <div><em>This message was deleted</em></div>
          <span class="msg-time">${time}</span>
        </div>
      </div>
    `;
  }

  const content = msg.content ? `<div>${escapeHtml(msg.content)}</div>` : '';
  const image = msg.image_url ? `<img src="${msg.image_url}" alt="Shared image">` : '';
  const editedLabel = msg.edited_at ? ' · edited' : '';
  const menuBtn = mine ? `<button type="button" class="msg-menu-btn" data-msg-id="${msg.id}" aria-label="Message options">⋯</button>` : '';
  const status = mine ? renderStatus(msg) : '';

  return `
    <div class="msg-row ${mine ? 'mine' : 'theirs'}" id="msg-${msg.id}">
      <div class="msg-bubble" data-content="${msg.content ? escapeHtml(msg.content).replace(/"/g, '&quot;') : ''}">
        ${menuBtn}
        ${senderLabel}
        <div class="msg-content-area">
          ${content}
          ${image}
        </div>
        <span class="msg-time">${time}${editedLabel}${status}</span>
      </div>
    </div>
  `;
}

// WhatsApp-style ticks (1:1) or a "Seen by N" label (groups)
function renderStatus(msg) {
  if (mode === 'connection') {
    if (msg.read_at) {
      return ` <span class="msg-ticks read" title="Read">✓✓</span>`;
    }
    if (msg.delivered_at) {
      return ` <span class="msg-ticks delivered" title="Delivered">✓✓</span>`;
    }
    return ` <span class="msg-ticks" title="Sent">✓</span>`;
  }
  // group
  const seenCount = groupMemberIds.filter(uid => {
    if (uid === msg.sender_id) return false;
    const lastRead = groupReadsMap[uid];
    return lastRead && new Date(lastRead) >= new Date(msg.created_at);
  }).length;
  return seenCount > 0
    ? ` <span class="msg-ticks read" title="Seen">✓✓ Seen by ${seenCount}</span>`
    : ` <span class="msg-ticks" title="Sent">✓ Sent</span>`;
}

function scrollToBottom() {
  messagesList.scrollTop = messagesList.scrollHeight;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function defaultAvatar(name) {
  const initial = (name || '?').charAt(0).toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="100%" height="100%" fill="#333333"/><text x="50%" y="50%" font-family="sans-serif" font-size="18" fill="white" text-anchor="middle" dy=".35em">${initial}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function groupAvatarDataUri() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="100%" height="100%" fill="#333333"/><text x="50%" y="50%" font-family="sans-serif" font-size="18" fill="white" text-anchor="middle" dy=".35em">👥</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

// Marks this conversation as read via secure RPC functions (not a raw table
// update — those are now sender-only, so read receipts go through functions
// that verify the caller is really a participant first).
async function markRead() {
  if (mode === 'connection') {
    await supabaseClient.rpc('mark_connection_messages_read', { p_connection_id: connectionId });
  } else {
    await supabaseClient.rpc('mark_group_read', { p_group_id: groupId });
  }
}

// Marks the other person's messages as "delivered" — this genuinely means
// they've reached my browser (I have them loaded), separate from "read"
// which only happens once I actually open this exact conversation.
async function markDelivered() {
  if (mode === 'connection') {
    await supabaseClient.rpc('mark_connection_messages_delivered', { p_connection_id: connectionId });
  }
}

// ===== Realtime: new messages, edits, unsends, and read receipts =====
function subscribeToNewMessages() {
  const filter = mode === 'group' ? `group_id=eq.${groupId}` : `connection_id=eq.${connectionId}`;

  supabaseClient
    .channel(`messages-${mode}-${mode === 'group' ? groupId : connectionId}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
      filter,
    }, async (payload) => {
      const msg = payload.new;
      if (msg.sender_id === currentUserId && document.getElementById(`msg-${msg.id}`)) return;

      if (mode === 'group' && msg.sender_id !== currentUserId) {
        const { data: profile } = await supabaseClient
          .from('profiles').select('full_name').eq('id', msg.sender_id).single();
        msg.profiles = profile;
      }

      const emptyNote = messagesList.querySelector('.empty-note');
      if (emptyNote) emptyNote.remove();

      messagesList.insertAdjacentHTML('beforeend', renderMessage(msg));
      scrollToBottom();
      attachBubbleMenus();
      markDelivered();
      markRead();
    })
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'messages',
      filter,
    }, (payload) => {
      // Someone edited/unsent a message, or our own message got marked as read — re-render that bubble
      const msg = payload.new;
      const row = document.getElementById(`msg-${msg.id}`);
      if (row) row.outerHTML = renderMessage(msg);
      attachBubbleMenus();
    })
    .subscribe();

  // For groups: when anyone's read-state changes, refresh ticks on my sent messages
  if (mode === 'group') {
    supabaseClient
      .channel(`group-reads-${groupId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'group_reads',
        filter: `group_id=eq.${groupId}`,
      }, async () => {
        await refreshGroupReads();
        loadMessages();
      })
      .subscribe();
  }
}

// ===== Edit / Unsend menu on your own messages =====
function attachBubbleMenus() {
  document.querySelectorAll('.msg-menu-btn').forEach(btn => {
    if (btn.dataset.wired) return;
    btn.dataset.wired = 'true';

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeAllBubbleMenus();

      const menu = document.createElement('div');
      menu.className = 'msg-menu-dropdown';
      menu.innerHTML = `
        <button type="button" data-action="edit">Edit</button>
        <button type="button" data-action="unsend">Unsend</button>
      `;
      btn.parentElement.appendChild(menu);

      menu.querySelector('[data-action="edit"]').addEventListener('click', () => {
        menu.remove();
        startEditing(btn.dataset.msgId);
      });
      menu.querySelector('[data-action="unsend"]').addEventListener('click', () => {
        menu.remove();
        unsendMessage(btn.dataset.msgId);
      });
    });
  });
}

function closeAllBubbleMenus() {
  document.querySelectorAll('.msg-menu-dropdown').forEach(m => m.remove());
}
document.addEventListener('click', closeAllBubbleMenus);

function startEditing(msgId) {
  const row = document.getElementById(`msg-${msgId}`);
  const bubble = row.querySelector('.msg-bubble');
  const contentArea = bubble.querySelector('.msg-content-area');
  const currentText = bubble.dataset.content || '';

  contentArea.innerHTML = `
    <input type="text" class="edit-input" value="${currentText}" style="width:100%; font-family:inherit; font-size:0.94rem; padding:4px 6px; border-radius:6px; border:1px solid rgba(255,255,255,0.3); background:rgba(0,0,0,0.2); color:inherit;">
    <div style="display:flex; gap:8px; margin-top:6px;">
      <button type="button" class="edit-save-btn" style="font-size:0.78rem; font-weight:700; background:none; border:none; color:inherit; text-decoration:underline; cursor:pointer;">Save</button>
      <button type="button" class="edit-cancel-btn" style="font-size:0.78rem; background:none; border:none; color:inherit; opacity:0.7; cursor:pointer;">Cancel</button>
    </div>
  `;

  const input = contentArea.querySelector('.edit-input');
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);

  contentArea.querySelector('.edit-save-btn').addEventListener('click', async () => {
    const newText = input.value.trim();
    if (!newText) return;

    const { error } = await supabaseClient
      .from('messages')
      .update({ content: newText, edited_at: new Date().toISOString() })
      .eq('id', msgId);

    if (error) {
      showToast(`Couldn't edit message: ${error.message}`, 'error');
      return;
    }
    loadMessages();
  });

  contentArea.querySelector('.edit-cancel-btn').addEventListener('click', () => {
    loadMessages();
  });
}

async function unsendMessage(msgId) {
  const { error } = await supabaseClient
    .from('messages')
    .update({ deleted: true, content: null, image_url: null })
    .eq('id', msgId);

  if (error) {
    showToast(`Couldn't unsend: ${error.message}`, 'error');
    return;
  }
  loadMessages();
}

// ===== Emoji panel =====
function setupEmojiPicker() {
  emojiPanel.innerHTML = EMOJIS.map(e => `<button type="button">${e}</button>`).join('');
  emojiPanel.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      messageInput.value += btn.textContent;
      messageInput.focus();
    });
  });
}

emojiToggleBtn.addEventListener('click', () => {
  emojiPanel.classList.toggle('open');
});

document.addEventListener('click', (e) => {
  if (!emojiPanel.contains(e.target) && e.target !== emojiToggleBtn) {
    emojiPanel.classList.remove('open');
  }
});

// ===== Image attach =====
imageToggleBtn.addEventListener('click', () => imageInput.click());

imageInput.addEventListener('change', () => {
  const file = imageInput.files[0];
  if (!file) return;
  selectedImageFile = file;
  imagePreviewImg.src = URL.createObjectURL(file);
  imagePreviewBar.classList.add('show');
});

removePreviewBtn.addEventListener('click', () => {
  selectedImageFile = null;
  imageInput.value = '';
  imagePreviewBar.classList.remove('show');
});

// ===== Send message (text and/or image) =====
composerForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const text = messageInput.value.trim();
  if (!text && !selectedImageFile) return;

  sendBtn.disabled = true;

  let imageUrl = null;
  if (selectedImageFile) {
    const folder = mode === 'group' ? `group-${groupId}` : connectionId;
    const filePath = `${folder}/${Date.now()}-${selectedImageFile.name}`;
    const { error: uploadError } = await supabaseClient.storage
      .from('chat-images')
      .upload(filePath, selectedImageFile);

    if (uploadError) {
      showToast(`Couldn't send image: ${uploadError.message}`, 'error');
      sendBtn.disabled = false;
      return;
    }
    const { data } = supabaseClient.storage.from('chat-images').getPublicUrl(filePath);
    imageUrl = data.publicUrl;
  }

  const payload = {
    sender_id: currentUserId,
    content: text || null,
    image_url: imageUrl,
  };
  if (mode === 'group') {
    payload.group_id = groupId;
  } else {
    payload.connection_id = connectionId;
  }

  const { data: inserted, error } = await supabaseClient
    .from('messages')
    .insert(payload)
    .select()
    .single();

  sendBtn.disabled = false;

  if (error) {
    showToast(`Couldn't send message: ${error.message}`, 'error');
    return;
  }

  const emptyNote = messagesList.querySelector('.empty-note');
  if (emptyNote) emptyNote.remove();
  messagesList.insertAdjacentHTML('beforeend', renderMessage(inserted));
  scrollToBottom();
  attachBubbleMenus();

  messageInput.value = '';
  selectedImageFile = null;
  imageInput.value = '';
  imagePreviewBar.classList.remove('show');
});
