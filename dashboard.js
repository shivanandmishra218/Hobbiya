const profileHeader = document.getElementById('profileHeader');
const postsGrid = document.getElementById('postsGrid');
const requestsList = document.getElementById('requestsList');
const connectionsList = document.getElementById('connectionsList');
const logoutBtn = document.getElementById('logoutBtn');
let currentUserId = null;

async function loadDashboard() {
  const { data: { user } } = await supabaseClient.auth.getUser();

  if (!user) {
    window.location.href = 'login.html';
    return;
  }
  currentUserId = user.id;

  const { data: profile } = await supabaseClient
    .from('profiles')
    .select('full_name, city, gender, date_of_birth, avatar_url')
    .eq('id', user.id)
    .single();

  if (!profile) {
    window.location.href = 'complete-profile.html';
    return;
  }

  const { data: userHobbies } = await supabaseClient
    .from('user_hobbies')
    .select('hobbies(name, emoji)')
    .eq('user_id', user.id);

  const { count: postsCount } = await supabaseClient
    .from('posts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id);

  const { count: connectionsCount } = await supabaseClient
    .from('connections')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'accepted')
    .or(`requester_id.eq.${user.id},receiver_id.eq.${user.id}`);

  const hobbyTags = (userHobbies || [])
    .map(row => `<span>${row.hobbies.emoji || ''} ${row.hobbies.name}</span>`)
    .join('');

  const age = calculateAge(profile.date_of_birth);
  const avatarSrc = profile.avatar_url || defaultAvatar(profile.full_name);
  const hobbiesCount = (userHobbies || []).length;

  profileHeader.innerHTML = `
    <div class="ig-header">
      <img class="ig-avatar" src="${avatarSrc}" alt="${profile.full_name}">
      <div class="ig-info">
        <div class="ig-name-row">
          <h1>${profile.full_name}</h1>
          <a href="complete-profile.html" class="edit-profile-btn">Edit profile</a>
        </div>
        <div class="ig-stats">
          <div><b>${postsCount || 0}</b><span>Posts</span></div>
          <div><b>${connectionsCount || 0}</b><span>Connections</span></div>
          <div><b>${hobbiesCount}</b><span>Hobbies</span></div>
        </div>
        <div class="ig-bio">
          <strong>📍 ${profile.city}</strong>
          ${age !== null ? ` · ${age} yrs` : ''}
          ${profile.gender ? ` · ${profile.gender}` : ''}
          <div class="hobby-tags">${hobbyTags}</div>
        </div>
      </div>
    </div>
  `;

  loadPostsGrid();
  loadRequests();
  loadConnections();
}
loadDashboard();

// ===== Posts grid (Instagram-style tiles) =====
async function loadPostsGrid() {
  const { data: posts, error } = await supabaseClient
    .from('posts')
    .select('id, location, event_time, image_url, hobbies(name, emoji)')
    .eq('user_id', currentUserId)
    .order('created_at', { ascending: false });

  if (error) {
    postsGrid.innerHTML = `<p class="empty-note">Couldn't load posts: ${error.message}</p>`;
    return;
  }

  if (!posts || posts.length === 0) {
    postsGrid.innerHTML = `<p class="empty-note">You haven't posted anything yet. <a href="create-post.html">Create your first post</a>.</p>`;
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
            ${when ? `<span class="when">${when}</span>` : ''}
          </div>
        </div>
      `;
    }

    return `
      <div class="ig-post-tile">
        <span class="emoji">${post.hobbies.emoji || '📌'}</span>
        <span class="loc">${post.location}</span>
        ${when ? `<span class="when">${when}</span>` : ''}
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

// Simple placeholder avatar (initial letter) when no photo was uploaded
function defaultAvatar(name) {
  const initial = (name || '?').charAt(0).toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="110" height="110"><rect width="100%" height="100%" fill="#333333"/><text x="50%" y="50%" font-family="sans-serif" font-size="44" fill="white" text-anchor="middle" dy=".35em">${initial}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

// ===== Incoming pending requests =====
async function loadRequests() {
  const { data, error } = await supabaseClient
    .from('connections')
    .select('id, status, requester:requester_id(id, full_name, city)')
    .eq('receiver_id', currentUserId)
    .eq('status', 'pending');

  if (error) {
    requestsList.innerHTML = `<p class="empty-note">Couldn't load requests: ${error.message}</p>`;
    return;
  }

  if (!data || data.length === 0) {
    requestsList.innerHTML = `<p class="empty-note">No requests right now.</p>`;
    return;
  }

  requestsList.innerHTML = data.map(req => `
    <div class="request-row">
      <div class="info"><b>${req.requester.full_name}</b> · ${req.requester.city}</div>
      <div class="request-actions">
        <button class="accept-btn" data-id="${req.id}" data-action="accepted">Accept</button>
        <button class="decline-btn" data-id="${req.id}" data-action="declined">Decline</button>
      </div>
    </div>
  `).join('');

  requestsList.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const newStatus = btn.dataset.action;
      btn.closest('.request-row').style.opacity = '0.5';

      const { error } = await supabaseClient
        .from('connections')
        .update({ status: newStatus })
        .eq('id', id);

      if (error) {
        showToast(`Couldn't update request: ${error.message}`, 'error');
        return;
      }

      showToast(newStatus === 'accepted' ? 'Request accepted!' : 'Request declined', 'success');
      loadDashboard();
    });
  });
}

// ===== Accepted connections =====
async function loadConnections() {
  const { data, error } = await supabaseClient
    .from('connections')
    .select('id, requester:requester_id(id, full_name, city, avatar_url), receiver:receiver_id(id, full_name, city, avatar_url)')
    .eq('status', 'accepted')
    .or(`requester_id.eq.${currentUserId},receiver_id.eq.${currentUserId}`);

  if (error) {
    connectionsList.innerHTML = `<p class="empty-note">Couldn't load connections: ${error.message}</p>`;
    return;
  }

  if (!data || data.length === 0) {
    connectionsList.innerHTML = `<p class="empty-note">No connections yet — head to Browse to find people.</p>`;
    return;
  }

  connectionsList.innerHTML = data.map(c => {
    const other = c.requester.id === currentUserId ? c.receiver : c.requester;
    const avatarSrc = other.avatar_url || defaultAvatar(other.full_name);
    return `
      <div class="connection-row">
        <a href="profile-view.html?id=${other.id}" style="display:flex; align-items:center; gap:10px; text-decoration:none; color:inherit;">
          <img src="${avatarSrc}" alt="${other.full_name}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;border:2px solid var(--ink);">
          <div class="info"><b>${other.full_name}</b> · ${other.city}</div>
        </a>
        <span class="empty-note">Connected ✓</span>
      </div>
    `;
  }).join('');
}

logoutBtn.addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
  window.location.href = 'index.html';
});
