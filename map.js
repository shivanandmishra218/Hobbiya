const mapSub = document.getElementById('mapSub');
let map = null;

async function loadMap() {
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) {
    window.location.href = 'login.html';
    return;
  }

  const { data: myProfile } = await supabaseClient
    .from('profiles')
    .select('city, latitude, longitude')
    .eq('id', user.id)
    .single();

  if (!myProfile) {
    window.location.href = 'complete-profile.html';
    return;
  }

  mapSub.textContent = `Posts with a known location in ${myProfile.city}`;

  let postsQuery = supabaseClient
    .from('posts')
    .select('id, location, description, latitude, longitude, user_id, hobbies(name, emoji), profiles!user_id(full_name)')
    .ilike('city', myProfile.city.trim())
    .not('latitude', 'is', null)
    .not('longitude', 'is', null);

  const blockedIds = await getBlockedUserIds(user.id);
  if (blockedIds.length) {
    postsQuery = postsQuery.not('user_id', 'in', `(${blockedIds.join(',')})`);
  }

  const { data: posts, error } = await postsQuery;

  // Center the map: prefer the viewer's own saved location, else the first post, else a generic fallback
  const centerLat = myProfile.latitude || posts?.[0]?.latitude || 22.9734;
  const centerLon = myProfile.longitude || posts?.[0]?.longitude || 78.6569;
  const zoom = myProfile.latitude ? 13 : (posts?.length ? 13 : 4);

  map = L.map('map').setView([centerLat, centerLon], zoom);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19,
  }).addTo(map);

  if (myProfile.latitude) {
    L.circle([myProfile.latitude, myProfile.longitude], {
      radius: 500, color: '#2b6cf6', weight: 2, fillOpacity: 0.06,
    }).addTo(map).bindPopup('Your area — 500m radius');
  }

  loadNearbyVenues(centerLat, centerLon);

  if (error) {
    mapSub.textContent = `Couldn't load posts: ${error.message}`;
    return;
  }

  if (!posts || posts.length === 0) {
    mapSub.textContent = `No posts with a known location in ${myProfile.city} yet.`;
    return;
  }

  posts.forEach(post => {
    const marker = L.marker([post.latitude, post.longitude]).addTo(map);
    marker.bindPopup(`
      <div class="map-popup">
        <div class="hobby">${post.hobbies.emoji || ''} ${post.hobbies.name}</div>
        <div class="loc">📍 ${post.location}</div>
        ${post.description ? `<div class="desc">${escapeHtml(post.description)}</div>` : ''}
        <div style="font-size:0.78rem; color:var(--ink-soft); margin-bottom:6px;">Posted by ${post.profiles.full_name}</div>
        <a href="feed.html">View in feed →</a>
      </div>
    `);
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Custom icon for real-world venues, so they're visually distinct from posts
const venueIcon = L.divIcon({
  html: '🏟️',
  className: 'venue-marker-icon',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

const VENUE_TYPE_LABELS = {
  pitch: 'Sports pitch / turf',
  sports_centre: 'Sports centre',
  playground: 'Playground',
  stadium: 'Stadium',
  track: 'Running track',
};

// Finds real playgrounds, turfs, and sports centres near a point using
// OpenStreetMap's free Overpass API — no API key, no cost.
async function loadNearbyVenues(lat, lon) {
  const radiusMeters = 3000;
  const query = `
    [out:json][timeout:25];
    (
      node["leisure"="pitch"](around:${radiusMeters},${lat},${lon});
      way["leisure"="pitch"](around:${radiusMeters},${lat},${lon});
      node["leisure"="sports_centre"](around:${radiusMeters},${lat},${lon});
      way["leisure"="sports_centre"](around:${radiusMeters},${lat},${lon});
      node["leisure"="playground"](around:${radiusMeters},${lat},${lon});
      node["leisure"="stadium"](around:${radiusMeters},${lat},${lon});
      way["leisure"="stadium"](around:${radiusMeters},${lat},${lon});
      node["leisure"="track"](around:${radiusMeters},${lat},${lon});
    );
    out center;
  `;

  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: query,
    });
    const data = await res.json();

    (data.elements || []).forEach(el => {
      const venueLat = el.lat || el.center?.lat;
      const venueLon = el.lon || el.center?.lon;
      if (!venueLat || !venueLon) return;

      const name = el.tags?.name || 'Unnamed venue';
      const type = VENUE_TYPE_LABELS[el.tags?.leisure] || 'Sports venue';

      L.marker([venueLat, venueLon], { icon: venueIcon }).addTo(map).bindPopup(`
        <div class="map-popup">
          <div class="hobby">🏟️ ${type}</div>
          <div class="loc">${escapeHtml(name)}</div>
        </div>
      `);
    });
  } catch (e) {
    // Overpass can be slow or briefly unavailable — fail quietly, posts still show fine
    console.warn('Nearby venues could not be loaded:', e);
  }
}

loadMap();
