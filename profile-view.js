const profileHeader = document.getElementById('profileHeader');
const postsGrid = document.getElementById('postsGrid');
const reportModal = document.getElementById('reportModal');
const reportModalTitle = document.getElementById('reportModalTitle');
const reportReasonFields = document.getElementById('reportReasonFields');
const blockConfirmText = document.getElementById('blockConfirmText');
const cancelReportBtn = document.getElementById('cancelReportBtn');
const confirmReportBtn = document.getElementById('confirmReportBtn');

let currentUserId = null;
let viewedUserId = null;
let viewedUserName = '';
let modalMode = null; // 'report' or 'block'

function getIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('id');
}

async function loadProfile() {
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) {
    window.location.href = 'login.html';
    return;
  }
  currentUserId = user.id;

  viewedUserId = getIdFromUrl();
  if (!viewedUserId) {
    profileHeader.innerHTML = `<p class="empty-note">No profile specified.</p>`;
    return;
  }

  if (viewedUserId === currentUserId) {
    window.location.href = 'dashboard.html';
    return;
  }

  // If either person has blocked the other, don't show anything about them
  const blocked = await isBlockedEitherWay(currentUserId, viewedUserId);
  if (blocked) {
    profileHeader.innerHTML = `<p class="empty-note">This profile isn't available.</p>`;
    postsGrid.innerHTML = '';
    return;
  }

  const { data: profile, error } = await supabaseClient
    .from('profiles')
    .select('full_name, city, gender, date_of_birth, avatar_url')
    .eq('id', viewedUserId)
    .single();

  if (error || !profile) {
    profileHeader.innerHTML = `<p class="empty-note">This profile couldn't be found.</p>`;
    postsGrid.innerHTML = '';
    return;
  }

  viewedUserName = profile.full_name;

  const { data: userHobbies } = await supabaseClient
    .from('user_hobbies')
    .select('hobbies(name, emoji)')
    .eq('user_id', viewedUserId);

  const { count: postsCount } = await supabaseClient
    .from('posts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', viewedUserId);

  const { data: connection } = await supabaseClient
    .from('connections')
    .select('id, status, requester_id, receiver_id')
    .or(`and(requester_id.eq.${currentUserId},receiver_id.eq.${viewedUserId}),and(requester_id.eq.${viewedUserId},receiver_id.eq.${currentUserId})`)
    .maybeSingle();

  const hobbyTags = (userHobbies || [])
    .map(row => `<span>${row.hobbies.emoji || ''} ${row.hobbies.name}</span>`)
    .join('');

  const age = calculateAge(profile.date_of_birth);
  const avatarSrc = profile.avatar_url || defaultAvatar(profile.full_name);

  profileHeader.innerHTML = `
    <div class="ig-header">
      <img class="ig-avatar" src="${avatarSrc}" alt="${profile.full_name}">
      <div class="ig-info">
        <div class="ig-name-row">
          <h1>${profile.full_name}</h1>
          ${renderActionButton(connection)}
          <button type="button" class="action-btn" id="moreMenuBtn" title="Report or block">⋯</button>
        </div>
        <div class="ig-stats">
          <div><b>${postsCount || 0}</b><span>Posts</span></div>
          <div><b>${(userHobbies || []).length}</b><span>Hobbies</span></div>
        </div>
        <div class="ig-bio">
          <strong>📍 ${profile.city}</strong>
          ${age !== null ? ` · ${age} yrs` : ''}
          ${profile.gender ? ` · ${profile.gender}` : ''}
          <div class="hobby-tags">${hobbyTags || ''}</div>
        </div>
      </div>
    </div>
  `;

  attachActionHandler(connection);
  attachMoreMenu();
  loadPostsGrid();
}
loadProfile();

function renderActionButton(connection) {
  if (!connection) {
    return `<button type="button" class="action-btn primary" id="connectBtn">Connect</button>`;
  }
  if (connection.status === 'accepted') {
    return `<a href="chat.html?id=${connection.id}" class="action-btn primary">Message</a>`;
  }
  if (connection.status === 'pending' && connection.requester_id === currentUserId) {
    return `<button type="button" class="action-btn" disabled>Requested</button>`;
  }
  if (connection.status === 'pending' && connection.receiver_id === currentUserId) {
    return `<a href="dashboard.html" class="action-btn primary">Respond to request</a>`;
  }
  return `<button type="button" class="action-btn primary" id="connectBtn">Connect</button>`;
}

function attachActionHandler(connection) {
  const connectBtn = document.getElementById('connectBtn');
  if (!connectBtn) return;

  connectBtn.addEventListener('click', async () => {
    connectBtn.disabled = true;
    connectBtn.textContent = 'Sending…';

    const { error } = await supabaseClient.from('connections').insert({
      requester_id: currentUserId,
      receiver_id: viewedUserId,
      status: 'pending',
    });

    if (error) {
      showToast(`Couldn't send request: ${error.message}`, 'error');
      connectBtn.disabled = false;
      connectBtn.textContent = 'Connect';
      return;
    }

    connectBtn.textContent = 'Requested';
    showToast('Request sent!', 'success');
  });
}

// ===== Report / Block menu =====
function attachMoreMenu() {
  const moreMenuBtn = document.getElementById('moreMenuBtn');
  if (!moreMenuBtn) return;

  // Build a small dropdown the first time it's needed
  const dropdown = document.createElement('div');
  dropdown.style.cssText = `
    position: absolute; background: var(--paper); border: 2px solid var(--ink);
    border-radius: 8px; overflow: hidden; z-index: 50; display: none; min-width: 140px;
  `;
  dropdown.innerHTML = `
    <button type="button" id="reportOptionBtn" style="display:block; width:100%; text-align:left; padding:10px 14px; background:none; border:none; color:var(--ink); font-family:var(--font-body); font-size:0.9rem; cursor:pointer;">🚩 Report</button>
    <button type="button" id="blockOptionBtn" style="display:block; width:100%; text-align:left; padding:10px 14px; background:none; border:none; color:var(--ink); font-family:var(--font-body); font-size:0.9rem; cursor:pointer; border-top:1px solid rgba(255,255,255,0.1);">🚫 Block</button>
  `;
  moreMenuBtn.parentElement.style.position = 'relative';
  moreMenuBtn.parentElement.appendChild(dropdown);

  moreMenuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = dropdown.style.display === 'block';
    dropdown.style.display = isOpen ? 'none' : 'block';
    dropdown.style.top = `${moreMenuBtn.offsetTop + moreMenuBtn.offsetHeight + 4}px`;
    dropdown.style.left = `${moreMenuBtn.offsetLeft}px`;
  });

  document.addEventListener('click', () => { dropdown.style.display = 'none'; });

  dropdown.querySelector('#reportOptionBtn').addEventListener('click', () => {
    dropdown.style.display = 'none';
    openModal('report');
  });
  dropdown.querySelector('#blockOptionBtn').addEventListener('click', () => {
    dropdown.style.display = 'none';
    openModal('block');
  });
}

function openModal(mode) {
  modalMode = mode;
  if (mode === 'report') {
    reportModalTitle.textContent = `Report ${viewedUserName}`;
    reportReasonFields.style.display = 'block';
    blockConfirmText.style.display = 'none';
    confirmReportBtn.textContent = 'Submit report';
  } else {
    reportModalTitle.textContent = `Block ${viewedUserName}?`;
    reportReasonFields.style.display = 'none';
    blockConfirmText.style.display = 'block';
    blockConfirmText.textContent = `They won't be able to message you or see your profile, and you won't see theirs. You can't undo this from here.`;
    confirmReportBtn.textContent = 'Block';
  }
  reportModal.style.display = 'flex';
}

cancelReportBtn.addEventListener('click', () => {
  reportModal.style.display = 'none';
});

confirmReportBtn.addEventListener('click', async () => {
  confirmReportBtn.disabled = true;

  if (modalMode === 'report') {
    const reason = document.getElementById('reportReason').value;
    const details = document.getElementById('reportDetails').value.trim();

    const { error } = await supabaseClient.from('reports').insert({
      reporter_id: currentUserId,
      reported_user_id: viewedUserId,
      reason,
      details: details || null,
    });

    confirmReportBtn.disabled = false;
    reportModal.style.display = 'none';

    if (error) {
      showToast(`Couldn't submit report: ${error.message}`, 'error');
      return;
    }
    showToast('Report submitted. Thanks for flagging this.', 'success');
  } else {
    const { error } = await supabaseClient.from('blocks').insert({
      blocker_id: currentUserId,
      blocked_id: viewedUserId,
    });

    confirmReportBtn.disabled = false;
    reportModal.style.display = 'none';

    if (error) {
      showToast(`Couldn't block: ${error.message}`, 'error');
      return;
    }
    showToast(`${viewedUserName} has been blocked.`, 'success');
    setTimeout(() => { window.location.href = 'browse.html'; }, 1200);
  }
});

async function loadPostsGrid() {
  const { data: posts, error } = await supabaseClient
    .from('posts')
    .select('id, location, event_time, image_url, hobbies(name, emoji)')
    .eq('user_id', viewedUserId)
    .order('created_at', { ascending: false });

  if (error) {
    postsGrid.innerHTML = `<p class="empty-note">Couldn't load posts.</p>`;
    return;
  }

  if (!posts || posts.length === 0) {
    postsGrid.innerHTML = `<p class="empty-note">No posts yet.</p>`;
    return;
  }

  postsGrid.innerHTML = posts.map(post => {
    const when = post.event_time
      ? new Date(post.event_time).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      : '';

    if (post.image_url) {
      return `
        <div class="ig-post-tile ig-post-tile-photo" style="background-image:url('${post.image_url}')">
          <div class="ig-post-tile-overlay">
            <span class="loc">${post.location}</span>
          </div>
        </div>
      `;
    }

    return `
      <div class="ig-post-tile">
        <span class="emoji">${post.hobbies.emoji || '📌'}</span>
        <span class="loc">${post.location}</span>
        ${when ? `<span class="when" style="font-size:0.62rem;color:var(--ink-soft);">${when}</span>` : ''}
      </div>
    `;
  }).join('');
}

function calculateAge(dobStr) {
  if (!dobStr) return null;
  const dob = new Date(dobStr);
  const diffMs = Date.now() - dob.getTime();
  return Math.abs(new Date(diffMs).getUTCFullYear() - 1970);
}

function defaultAvatar(name) {
  const initial = (name || '?').charAt(0).toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="110" height="110"><rect width="100%" height="100%" fill="#333333"/><text x="50%" y="50%" font-family="sans-serif" font-size="44" fill="white" text-anchor="middle" dy=".35em">${initial}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
