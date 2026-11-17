const peopleGrid = document.getElementById('peopleGrid');
const searchInput = document.getElementById('searchInput');
const logoutBtn = document.getElementById('logoutBtn');
let currentUserId = null;
let allPeople = [];
let allConnections = [];

async function loadPeople() {
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

  // Other people in the same city, with their hobbies
  let peopleQuery = supabaseClient
    .from('profiles')
    .select('id, full_name, city, gender, date_of_birth, avatar_url, user_hobbies(hobbies(name, emoji))')
    .ilike('city', myProfile.city.trim())
    .neq('id', user.id);

  const blockedIds = await getBlockedUserIds(user.id);
  if (blockedIds.length) {
    peopleQuery = peopleQuery.not('id', 'in', `(${blockedIds.join(',')})`);
  }

  const { data: people, error } = await peopleQuery;

  if (error) {
    peopleGrid.innerHTML = `<p class="empty-note">Couldn't load people: ${error.message}</p>`;
    return;
  }

  allPeople = people || [];

  // Existing connections involving me, so we know each person's status
  const { data: connections } = await supabaseClient
    .from('connections')
    .select('*')
    .or(`requester_id.eq.${user.id},receiver_id.eq.${user.id}`);

  allConnections = connections || [];

  renderPeople(allPeople);
}

function renderPeople(people) {
  if (!people || people.length === 0) {
    peopleGrid.innerHTML = `<p class="empty-note">No matches. Try a different name or hobby, or check back later as more people join.</p>`;
    return;
  }
  peopleGrid.innerHTML = people.map(person => renderCard(person, allConnections)).join('');
  attachConnectHandlers();
}

function renderCard(person, connections) {
  const tags = (person.user_hobbies || [])
    .map(row => `<span>${row.hobbies.emoji || ''} ${row.hobbies.name}</span>`)
    .join('');

  const existing = connections.find(c =>
    (c.requester_id === currentUserId && c.receiver_id === person.id) ||
    (c.receiver_id === currentUserId && c.requester_id === person.id)
  );

  let actionHtml;
  if (!existing) {
    actionHtml = `<button class="action-btn" data-action="connect" data-id="${person.id}">Connect</button>`;
  } else if (existing.status === 'accepted') {
    actionHtml = `<button class="action-btn" disabled>Connected ✓</button>`;
  } else if (existing.status === 'pending' && existing.requester_id === currentUserId) {
    actionHtml = `<button class="action-btn" disabled>Requested</button>`;
  } else if (existing.status === 'pending' && existing.receiver_id === currentUserId) {
    actionHtml = `<button class="action-btn" disabled>Check your dashboard</button>`;
  } else {
    // declined — allow trying again
    actionHtml = `<button class="action-btn" data-action="connect" data-id="${person.id}">Connect</button>`;
  }

  return `
    <div class="person-card">
      <a href="profile-view.html?id=${person.id}" class="person-info" style="text-decoration:none; color:inherit;">
        <img class="person-avatar" src="${person.avatar_url || defaultAvatar(person.full_name)}" alt="${person.full_name}">
        <div>
          <p class="name">${person.full_name}</p>
          <p class="city">📍 ${person.city}</p>
          <div class="person-sub-tags">
            ${calculateAge(person.date_of_birth) !== null ? `<span>${calculateAge(person.date_of_birth)} yrs</span>` : ''}
            ${person.gender ? `<span>${person.gender}</span>` : ''}
          </div>
          <div class="hobby-tags">${tags || '<span>No hobbies listed</span>'}</div>
        </div>
      </a>
      ${actionHtml}
    </div>
  `;
}

function calculateAge(dobStr) {
  if (!dobStr) return null;
  const dob = new Date(dobStr);
  const diffMs = Date.now() - dob.getTime();
  return Math.abs(new Date(diffMs).getUTCFullYear() - 1970);
}

function defaultAvatar(name) {
  const initial = (name || '?').charAt(0).toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="52" height="52"><rect width="100%" height="100%" fill="#333333"/><text x="50%" y="50%" font-family="sans-serif" font-size="22" fill="white" text-anchor="middle" dy=".35em">${initial}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function attachConnectHandlers() {
  peopleGrid.querySelectorAll('[data-action="connect"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const receiverId = btn.dataset.id;
      btn.disabled = true;
      btn.textContent = 'Sending…';

      const { error } = await supabaseClient.from('connections').insert({
        requester_id: currentUserId,
        receiver_id: receiverId,
        status: 'pending',
      });

      if (error) {
        btn.disabled = false;
        btn.textContent = 'Connect';
        showToast(`Couldn't send request: ${error.message}`, 'error');
        return;
      }

      btn.textContent = 'Requested';
      showToast('Request sent!', 'success');
      // Keep our local connection cache in sync so re-filtering doesn't reset the button
      allConnections.push({ requester_id: currentUserId, receiver_id: receiverId, status: 'pending' });
    });
  });
}

// Live filter by name or hobby as the user types
searchInput.addEventListener('input', () => {
  const query = searchInput.value.trim().toLowerCase();

  if (!query) {
    renderPeople(allPeople);
    return;
  }

  const filtered = allPeople.filter(person => {
    const nameMatch = person.full_name.toLowerCase().includes(query);
    const hobbyMatch = (person.user_hobbies || []).some(row =>
      row.hobbies.name.toLowerCase().includes(query)
    );
    return nameMatch || hobbyMatch;
  });

  renderPeople(filtered);
});

logoutBtn.addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
  window.location.href = 'index.html';
});

loadPeople();
