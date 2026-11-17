const postsList = document.getElementById('postsList');
const citySub = document.getElementById('citySub');
const feedSearch = document.getElementById('feedSearch');
const feedHobbyFilters = document.getElementById('feedHobbyFilters');
const eventTimeFilter = document.getElementById('eventTimeFilter');
const featuredEvents = document.getElementById('featuredEvents');
const savedInterests = document.getElementById('savedInterests');

let currentUserId = null;
let myCity = null;
let allPosts = [];
let commentCountByPost = {};
let rsvpsByPost = {};      // post_id -> [{user_id, full_name, avatar_url}]
let reactionsByPost = {};  // post_id -> { emoji: count }
let myReactionByPost = {}; // post_id -> emoji (or undefined)
let activeHobbyId = null;

const HOBBY_COLORS = {
  'Badminton': ['#16a085', '#1abc9c'],
  'Cricket': ['#27ae60', '#2ecc71'],
  'Football': ['#2980b9', '#3498db'],
  'Running': ['#d35400', '#e67e22'],
  'Hiking': ['#6d4c41', '#8d6e63'],
  'Yoga': ['#8e44ad', '#9b59b6'],
  'Photography': ['#c0392b', '#e74c3c'],
  'Board games': ['#f39c12', '#f1c40f'],
  'Music jams': ['#8e44ad', '#9b59b6'],
  'Reading circles': ['#16a085', '#1abc9c'],
  'Cycling': ['#0097a7', '#00bcd4'],
  'Dance': ['#c2185b', '#e91e63'],
};
function hobbyColor(name) { return (HOBBY_COLORS[name] || ['#555', '#777'])[0]; }
function hobbyGradient(name) {
  const c = HOBBY_COLORS[name] || ['#555', '#777'];
  return `linear-gradient(135deg, ${c[0]}, ${c[1]})`;
}

const REACTION_EMOJIS = ['👍', '❤️', '💡'];

async function loadFeed() {
  try {
    await loadFeedInner();
  } catch (err) {
    console.error('Feed failed to load:', err);
    postsList.innerHTML = `<p class="empty-note">Something went wrong loading the feed: ${err.message}. Open the browser console (F12) for details.</p>`;
    citySub.textContent = '';
    featuredEvents.innerHTML = `<p class="empty-note" style="padding:10px 0;">Couldn't load.</p>`;
    savedInterests.innerHTML = `<p class="empty-note" style="padding:6px 0;">Couldn't load.</p>`;
  }
}

async function loadFeedInner() {
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) {
    window.location.href = 'login.html';
    return;
  }
  currentUserId = user.id;

  const { data: myProfile } = await supabaseClient
    .from('profiles')
    .select('city')
    .eq('id', user.id)
    .single();

  if (!myProfile) {
    window.location.href = 'complete-profile.html';
    return;
  }
  myCity = myProfile.city;
  citySub.textContent = `Posts from people in ${myCity}`;

  let postsQuery = supabaseClient
    .from('posts')
    .select('id, hobby_id, location, event_time, members_needed, description, image_url, created_at, user_id, hobbies(name, emoji), profiles!user_id(full_name, avatar_url)')
    .ilike('city', myCity.trim())
    .order('created_at', { ascending: false });

  const blockedIds = await getBlockedUserIds(user.id);
  if (blockedIds.length) {
    postsQuery = postsQuery.not('user_id', 'in', `(${blockedIds.join(',')})`);
  }

  const { data: posts, error } = await postsQuery;

  if (error) {
    postsList.innerHTML = `<p class="empty-note">Couldn't load the feed: ${error.message}</p>`;
    return;
  }

  allPosts = posts || [];

  if (allPosts.length === 0) {
    postsList.innerHTML = `<p class="empty-note">No posts in ${myCity} yet. Be the first — hit "+ Quick Post".</p>`;
    feedHobbyFilters.innerHTML = '';
  } else {
    const postIds = allPosts.map(p => p.id);
    await Promise.all([
      loadCommentCounts(postIds),
      loadRsvps(postIds),
      loadReactions(postIds),
    ]);
    renderHobbyFilters();
    renderFiltered();
  }

  loadFeaturedEvents();
  loadMiniMap();
  loadSavedInterests();
}

async function loadCommentCounts(postIds) {
  const { data } = await supabaseClient.from('post_comments').select('id, post_id').in('post_id', postIds);
  commentCountByPost = {};
  (data || []).forEach(c => { commentCountByPost[c.post_id] = (commentCountByPost[c.post_id] || 0) + 1; });
}

async function loadRsvps(postIds) {
  const { data } = await supabaseClient
    .from('post_rsvps')
    .select('post_id, user_id, profiles!user_id(full_name, avatar_url)')
    .in('post_id', postIds);
  rsvpsByPost = {};
  (data || []).forEach(r => {
    if (!rsvpsByPost[r.post_id]) rsvpsByPost[r.post_id] = [];
    rsvpsByPost[r.post_id].push({ user_id: r.user_id, full_name: r.profiles.full_name, avatar_url: r.profiles.avatar_url });
  });
}

async function loadReactions(postIds) {
  const { data } = await supabaseClient.from('post_reactions').select('post_id, user_id, emoji').in('post_id', postIds);
  reactionsByPost = {};
  myReactionByPost = {};
  (data || []).forEach(r => {
    if (!reactionsByPost[r.post_id]) reactionsByPost[r.post_id] = {};
    reactionsByPost[r.post_id][r.emoji] = (reactionsByPost[r.post_id][r.emoji] || 0) + 1;
    if (r.user_id === currentUserId) myReactionByPost[r.post_id] = r.emoji;
  });
}

function renderHobbyFilters() {
  const seen = new Map();
  allPosts.forEach(p => { if (!seen.has(p.hobby_id)) seen.set(p.hobby_id, p.hobbies); });

  const chips = [`<button type="button" class="feed-hobby-chip active" data-hobby="all">All</button>`];
  seen.forEach((hobby, hobbyId) => {
    chips.push(`<button type="button" class="feed-hobby-chip" data-hobby="${hobbyId}" style="background:${hobbyGradient(hobby.name)};">${hobby.emoji || ''} ${hobby.name}</button>`);
  });

  feedHobbyFilters.innerHTML = chips.join('');
  feedHobbyFilters.querySelectorAll('.feed-hobby-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      feedHobbyFilters.querySelectorAll('.feed-hobby-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      activeHobbyId = chip.dataset.hobby === 'all' ? null : parseInt(chip.dataset.hobby, 10);
      renderFiltered();
    });
  });
}

function renderFiltered() {
  const query = feedSearch.value.trim().toLowerCase();
  const timeMode = eventTimeFilter ? eventTimeFilter.value : 'all';
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart); todayEnd.setDate(todayEnd.getDate() + 1);
  const day = now.getDay();
  const daysUntilSaturday = (6 - day + 7) % 7;
  const weekendStart = new Date(todayStart); weekendStart.setDate(weekendStart.getDate() + (day === 0 ? -1 : daysUntilSaturday));
  const weekendEnd = new Date(weekendStart); weekendEnd.setDate(weekendEnd.getDate() + 2);
  const filtered = allPosts.filter(post => {
    if (timeMode !== 'all') {
      if (!post.event_time) return false;
      const eventDate = new Date(post.event_time);
      if (timeMode === 'today' && !(eventDate >= todayStart && eventDate < todayEnd)) return false;
      if (timeMode === 'weekend' && !(eventDate >= weekendStart && eventDate < weekendEnd)) return false;
      if (timeMode === 'upcoming' && eventDate < now) return false;
    }
    if (activeHobbyId !== null && post.hobby_id !== activeHobbyId) return false;
    if (!query) return true;
    const haystack = [post.location, post.description, post.hobbies.name].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(query);
  });

  if (filtered.length === 0) {
    postsList.innerHTML = `<p class="empty-note">No posts match that search.</p>`;
    return;
  }

  postsList.innerHTML = filtered.map(renderPost).join('');
  attachCommentHandlers();
  attachOwnerActionHandlers();
  attachRsvpHandlers();
  attachReactionHandlers();
}

feedSearch.addEventListener('input', renderFiltered);
if (eventTimeFilter) eventTimeFilter.addEventListener('change', renderFiltered);

function renderPost(post) {
  const eventTime = post.event_time
    ? new Date(post.event_time).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : null;
  const postedAgo = timeAgo(post.created_at);
  const commentCount = commentCountByPost[post.id] || 0;
  const color = hobbyColor(post.hobbies.name);

  const rsvps = rsvpsByPost[post.id] || [];
  const iAmIn = rsvps.some(r => r.user_id === currentUserId);
  const avatarStack = rsvps.slice(0, 4).map(r =>
    `<img src="${r.avatar_url || defaultAvatarUri(r.full_name)}" alt="${r.full_name}" title="${r.full_name}">`
  ).join('');
  const additionalJoined = rsvps.filter(r => r.user_id !== post.user_id).length;
  const spotsLeft = post.members_needed ? Math.max(0, post.members_needed - additionalJoined) : null;
  const rsvpText = post.members_needed
    ? `${additionalJoined} joined · ${spotsLeft} spot${spotsLeft === 1 ? '' : 's'} left`
    : `${rsvps.length} confirmed`;

  const reactions = reactionsByPost[post.id] || {};
  const myReaction = myReactionByPost[post.id];
  const reactButtons = REACTION_EMOJIS.map(emoji => {
    const count = reactions[emoji] || 0;
    return `<button type="button" class="react-btn ${myReaction === emoji ? 'mine' : ''}" data-post-id="${post.id}" data-emoji="${emoji}">${emoji}${count > 0 ? `<span class="count">${count}</span>` : ''}</button>`;
  }).join('');

  const isOwner = String(post.user_id) === String(currentUserId);

  return `
    <div class="post-card" data-post-id="${post.id}" style="border-left-color:${color};">
      <div class="post-head">
        <a href="profile-view.html?id=${post.user_id}"><img class="post-avatar" src="${post.profiles.avatar_url || defaultAvatarUri(post.profiles.full_name)}" alt=""></a>
        <a href="profile-view.html?id=${post.user_id}" class="post-author-name">${post.profiles.full_name}</a>
        <span class="post-hobby" style="background:${hobbyGradient(post.hobbies.name)};">${post.hobbies.emoji || ''} ${post.hobbies.name}</span>
      </div>
      <div class="post-meta">
        <span>📍 ${post.location}</span>
        ${eventTime ? `<span>🕐 ${eventTime}</span>` : ''}
        <span class="rsvp-row" data-post-id="${post.id}" title="${iAmIn ? 'Click to cancel your RSVP' : 'Click to confirm you are in'}">
          👥 ${rsvpText}
          <span class="rsvp-avatars">${avatarStack}</span>
        </span>
      </div>
      ${post.description ? `<p class="post-desc">${escapeHtml(post.description)}</p>` : ''}
      ${post.image_url ? `<img class="post-image" src="${post.image_url}" alt="Photo attached to this post">` : ''}
      <p class="post-author">Posted <span class="post-time-ago">${postedAgo}</span></p>
      ${isOwner ? `
        <div class="post-owner-actions">
          <a href="create-post.html?edit=${post.id}">Edit</a>
          <button type="button" class="post-delete-btn" data-post-id="${post.id}">Delete</button>
          <button type="button" class="post-share-btn" data-post-id="${post.id}">Share</button>
        </div>
      ` : `
        <div class="post-owner-actions">
          <button type="button" class="post-share-btn" data-post-id="${post.id}">Share</button>
          <button type="button" class="post-report-btn" data-post-id="${post.id}">Report</button>
          <div class="react-row">${reactButtons}</div>
          <button type="button" class="comment-toggle" data-post-id="${post.id}">View Comments (${commentCount})</button>
        </div>
      `}
      ${isOwner ? `
        <div style="display:flex; align-items:center; margin-top:6px;">
          <div class="react-row">${reactButtons}</div>
          <button type="button" class="comment-toggle" data-post-id="${post.id}">View Comments (${commentCount})</button>
        </div>
      ` : ''}
      <div class="comments-section" id="comments-${post.id}">
        <div class="comments-list">Loading…</div>
        <form class="comment-form" data-post-id="${post.id}">
          <input type="text" placeholder="Add a comment…" required>
          <button type="submit">Post</button>
        </form>
      </div>
    </div>
  `;
}

// ===== RSVP toggle =====
function attachRsvpHandlers() {
  document.querySelectorAll('.rsvp-row').forEach(row => {
    row.addEventListener('click', () => toggleRsvp(row.dataset.postId));
  });
}

async function toggleRsvp(postId) {
  const rsvps = rsvpsByPost[postId] || [];
  const alreadyIn = rsvps.some(r => r.user_id === currentUserId);

  if (alreadyIn) {
    await supabaseClient.from('post_rsvps').delete().eq('post_id', postId).eq('user_id', currentUserId);
  } else {
    const { error } = await supabaseClient.from('post_rsvps').insert({ post_id: postId, user_id: currentUserId });
    if (error) {
      showToast(`Couldn't RSVP: ${error.message}`, 'error');
      return;
    }
  }

  const postIds = allPosts.map(p => p.id);
  await loadRsvps(postIds);
  renderFiltered();
  loadFeaturedEvents();
}

// ===== Reactions =====
function attachReactionHandlers() {
  document.querySelectorAll('.react-btn').forEach(btn => {
    btn.addEventListener('click', () => toggleReaction(btn.dataset.postId, btn.dataset.emoji));
  });
}

async function toggleReaction(postId, emoji) {
  const current = myReactionByPost[postId];

  if (current === emoji) {
    await supabaseClient.from('post_reactions').delete().eq('post_id', postId).eq('user_id', currentUserId);
  } else {
    await supabaseClient.from('post_reactions').upsert(
      { post_id: postId, user_id: currentUserId, emoji },
      { onConflict: 'post_id,user_id' }
    );
  }

  const postIds = allPosts.map(p => p.id);
  await loadReactions(postIds);
  renderFiltered();
}

// ===== Comments (unchanged behavior) =====
function attachCommentHandlers() {
  document.querySelectorAll('.comment-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const postId = btn.dataset.postId;
      const section = document.getElementById(`comments-${postId}`);
      const isOpening = !section.classList.contains('open');
      section.classList.toggle('open');
      if (isOpening) loadComments(postId);
    });
  });

  document.querySelectorAll('.comment-form').forEach(form => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const postId = form.dataset.postId;
      const input = form.querySelector('input');
      const content = input.value.trim();
      if (!content) return;

      const submitBtn = form.querySelector('button');
      submitBtn.disabled = true;

      const { error } = await supabaseClient.from('post_comments').insert({ post_id: postId, user_id: currentUserId, content });
      submitBtn.disabled = false;

      if (error) {
        showToast(`Couldn't post comment: ${error.message}`, 'error');
        return;
      }
      input.value = '';
      loadComments(postId);
      commentCountByPost[postId] = (commentCountByPost[postId] || 0) + 1;
      const btn = document.querySelector(`.comment-toggle[data-post-id="${postId}"]`);
      if (btn) btn.textContent = `View Comments (${commentCountByPost[postId]})`;
    });
  });
}

async function loadComments(postId) {
  const listEl = document.querySelector(`#comments-${postId} .comments-list`);
  listEl.innerHTML = 'Loading…';

  const { data: comments, error } = await supabaseClient
    .from('post_comments')
    .select('id, content, created_at, profiles!user_id(full_name)')
    .eq('post_id', postId)
    .order('created_at', { ascending: true });

  if (error) { listEl.innerHTML = `<p class="empty-note" style="padding:8px 0;">Couldn't load comments.</p>`; return; }
  if (!comments || comments.length === 0) { listEl.innerHTML = `<p class="empty-note" style="padding:8px 0;">No comments yet.</p>`; return; }

  listEl.innerHTML = comments.map(c => `
    <div class="comment-row"><b>${escapeHtml(c.profiles.full_name)}:</b><span>${escapeHtml(c.content)}</span></div>
  `).join('');
}

// ===== Owner actions: Edit/Delete/Share, or Share/Report for others =====
function attachOwnerActionHandlers() {
  document.querySelectorAll('.post-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => confirmDeletePost(btn.dataset.postId));
  });

  document.querySelectorAll('.post-share-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const link = `${window.location.origin}${window.location.pathname.replace('feed.html', '')}feed.html#post-${btn.dataset.postId}`;
      try {
        await navigator.clipboard.writeText(link);
        showToast('Link copied to clipboard!', 'success');
      } catch (e) {
        showToast('Could not copy link.', 'error');
      }
    });
  });

  document.querySelectorAll('.post-report-btn').forEach(btn => {
    btn.addEventListener('click', () => openReportPostModal(btn.dataset.postId));
  });
}

function confirmDeletePost(postId) {
  const overlay = document.createElement('div');
  overlay.style.cssText = `position: fixed; inset: 0; z-index: 1000; background: rgba(0,0,0,0.85); display: flex; align-items: center; justify-content: center; padding: 20px;`;
  overlay.innerHTML = `
    <div style="background: var(--paper); border: 2px solid var(--ink); border-radius: 10px; padding: 22px; max-width: 360px; width: 100%;">
      <h3 style="font-family: var(--font-display); margin-bottom: 10px; font-size: 1.05rem;">Delete this post?</h3>
      <p style="color: var(--ink-soft); font-size: 0.9rem; margin-bottom: 18px;">This can't be undone.</p>
      <div style="display:flex; gap:10px; justify-content:flex-end;">
        <button type="button" id="cancelDeleteBtn" style="font-family: var(--font-body); font-weight:700; font-size:0.88rem; padding:8px 16px; border-radius:6px; border:2px solid var(--ink); background:none; color:var(--ink); cursor:pointer;">Cancel</button>
        <button type="button" id="confirmDeleteBtn" style="font-family: var(--font-body); font-weight:700; font-size:0.88rem; padding:8px 16px; border-radius:6px; border:2px solid var(--ink); background:var(--ink); color:var(--paper); cursor:pointer;">Delete</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#cancelDeleteBtn').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#confirmDeleteBtn').addEventListener('click', async () => {
    const { error } = await supabaseClient.from('posts').delete().eq('id', postId);
    overlay.remove();
    if (error) { showToast(`Couldn't delete post: ${error.message}`, 'error'); return; }
    document.querySelector(`.post-card[data-post-id="${postId}"]`)?.remove();
    showToast('Post deleted.', 'success');
  });
}

function openReportPostModal(postId) {
  const overlay = document.createElement('div');
  overlay.style.cssText = `position: fixed; inset: 0; z-index: 1000; background: rgba(0,0,0,0.85); display: flex; align-items: center; justify-content: center; padding: 20px;`;
  overlay.innerHTML = `
    <div style="background: var(--paper); border: 2px solid var(--ink); border-radius: 10px; padding: 22px; max-width: 380px; width: 100%;">
      <h3 style="font-family: var(--font-display); margin-bottom: 14px; font-size: 1.05rem;">Report this post</h3>
      <select id="postReportReason" style="width:100%; font-family: var(--font-body); font-size: 0.9rem; padding: 10px 12px; border: 2px solid var(--ink); border-radius: 6px; background: var(--cream); color: var(--ink); margin-bottom: 12px;">
        <option value="Spam">Spam</option>
        <option value="Harassment">Harassment or abuse</option>
        <option value="Inappropriate content">Inappropriate content</option>
        <option value="Misleading">Misleading or fake</option>
        <option value="Other">Other</option>
      </select>
      <textarea id="postReportDetails" placeholder="Add any extra detail (optional)" style="width:100%; min-height:60px; font-family: var(--font-body); font-size: 0.88rem; padding: 10px 12px; border: 2px solid var(--ink); border-radius: 6px; background: var(--cream); color: var(--ink); margin-bottom: 16px;"></textarea>
      <div style="display:flex; gap:10px; justify-content:flex-end;">
        <button type="button" id="cancelPostReportBtn" style="font-family: var(--font-body); font-weight:700; font-size:0.85rem; padding:8px 16px; border-radius:6px; border:2px solid var(--ink); background:none; color:var(--ink); cursor:pointer;">Cancel</button>
        <button type="button" id="submitPostReportBtn" style="font-family: var(--font-body); font-weight:700; font-size:0.85rem; padding:8px 16px; border-radius:6px; border:2px solid var(--ink); background:var(--ink); color:var(--paper); cursor:pointer;">Submit</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#cancelPostReportBtn').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#submitPostReportBtn').addEventListener('click', async () => {
    const reason = overlay.querySelector('#postReportReason').value;
    const details = overlay.querySelector('#postReportDetails').value.trim();
    const { error } = await supabaseClient.from('reports').insert({ reporter_id: currentUserId, reported_post_id: postId, reason, details: details || null });
    overlay.remove();
    if (error) { showToast(`Couldn't submit report: ${error.message}`, 'error'); return; }
    showToast('Report submitted. Thanks for flagging this.', 'success');
  });
}

// ===== Featured Events (sidebar) =====
async function loadFeaturedEvents() {
  let query = supabaseClient
    .from('posts')
    .select('id, location, event_time, city, user_id, profiles!user_id(full_name, avatar_url)')
    .ilike('city', myCity.trim())
    .not('event_time', 'is', null)
    .gte('event_time', new Date().toISOString())
    .order('event_time', { ascending: true })
    .limit(3);

  const { data: events, error } = await query;

  if (error || !events || events.length === 0) {
    featuredEvents.innerHTML = `<p class="empty-note" style="padding:10px 0;">No upcoming events yet.</p>`;
    return;
  }

  const postIds = events.map(e => e.id);
  const { data: rsvpData } = await supabaseClient.from('post_rsvps').select('post_id, user_id').in('post_id', postIds);
  const rsvpSetByPost = {};
  (rsvpData || []).forEach(r => {
    if (!rsvpSetByPost[r.post_id]) rsvpSetByPost[r.post_id] = new Set();
    rsvpSetByPost[r.post_id].add(r.user_id);
  });

  featuredEvents.innerHTML = events.map(ev => {
    const d = new Date(ev.event_time);
    const month = d.toLocaleDateString(undefined, { month: 'short' });
    const day = d.getDate();
    const iAmIn = rsvpSetByPost[ev.id]?.has(currentUserId);

    return `
      <div class="event-card">
        <div class="event-date"><span class="month">${month}</span><span class="day">${day}</span></div>
        <div class="event-info">
          <div class="title">${ev.location}</div>
          <div class="sub">${ev.city} · organizer</div>
          <div class="row">
            <img src="${ev.profiles.avatar_url || defaultAvatarUri(ev.profiles.full_name)}" alt="">
            <span style="font-size:0.72rem;">📍</span>
            <button type="button" class="signup-btn ${iAmIn ? 'confirmed' : ''}" data-post-id="${ev.id}">${iAmIn ? 'Signed up ✓' : 'Sign Up'}</button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  featuredEvents.querySelectorAll('.signup-btn').forEach(btn => {
    btn.addEventListener('click', () => toggleRsvp(btn.dataset.postId));
  });
}

// ===== Mini map (sidebar) =====
async function loadMiniMap() {
  const mapEl = document.getElementById('miniMap');
  if (!mapEl) return;

  try {
    const { data: myProfile } = await supabaseClient.from('profiles').select('latitude, longitude').eq('id', currentUserId).single();

    const { data: posts } = await supabaseClient
      .from('posts')
      .select('latitude, longitude')
      .ilike('city', myCity.trim())
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .limit(20);

    const centerLat = myProfile?.latitude || posts?.[0]?.latitude || 22.9734;
    const centerLon = myProfile?.longitude || posts?.[0]?.longitude || 78.6569;

    const miniMap = L.map(mapEl, { zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false }).setView([centerLat, centerLon], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(miniMap);

    if (myProfile?.latitude) {
      L.circle([myProfile.latitude, myProfile.longitude], { radius: 500, color: '#2b6cf6', weight: 1, fillOpacity: 0.08 }).addTo(miniMap);
    }

    (posts || []).forEach(p => L.marker([p.latitude, p.longitude]).addTo(miniMap));
  } catch (err) {
    console.error('Mini map failed:', err);
    mapEl.outerHTML = `<p class="empty-note" style="padding:10px 0;">Map preview unavailable.</p>`;
  }
}

// ===== Saved interests (sidebar) =====
async function loadSavedInterests() {
  const { data } = await supabaseClient
    .from('user_hobbies')
    .select('hobbies(name, emoji)')
    .eq('user_id', currentUserId);

  if (!data || data.length === 0) {
    savedInterests.innerHTML = `<p class="empty-note" style="padding:6px 0;">No hobbies saved yet.</p>`;
    return;
  }

  savedInterests.innerHTML = data.map(row =>
    `<span class="hobby-pill" style="background:${hobbyGradient(row.hobbies.name)};">${row.hobbies.emoji || ''} ${row.hobbies.name}</span>`
  ).join('');
}

// ===== Modals: Guidelines / Help / Feedback =====
function wireModal(linkId, modalId) {
  document.getElementById(linkId)?.addEventListener('click', () => {
    document.getElementById(modalId).classList.add('open');
  });
}
wireModal('guidelinesLink', 'guidelinesModal');
wireModal('helpLink', 'helpModal');
wireModal('feedbackLink', 'feedbackModal');

document.querySelectorAll('.simple-modal-close').forEach(btn => {
  btn.addEventListener('click', () => {
    document.getElementById(btn.dataset.modal).classList.remove('open');
  });
});

document.getElementById('submitFeedbackBtn')?.addEventListener('click', async () => {
  const text = document.getElementById('feedbackText').value.trim();
  if (!text) return;

  const { error } = await supabaseClient.from('feedback').insert({ user_id: currentUserId, message: text });
  document.getElementById('feedbackModal').classList.remove('open');
  document.getElementById('feedbackText').value = '';

  if (error) { showToast(`Couldn't send feedback: ${error.message}`, 'error'); return; }
  showToast('Thanks for the feedback!', 'success');
});

// ===== Helpers =====
function timeAgo(dateStr) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function defaultAvatarUri(name) {
  const initial = (name || '?').charAt(0).toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="100%" height="100%" fill="#333333"/><text x="50%" y="50%" font-family="sans-serif" font-size="18" fill="white" text-anchor="middle" dy=".35em">${initial}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

loadFeed();
