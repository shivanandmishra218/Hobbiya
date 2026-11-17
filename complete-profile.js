const hobbyPicker = document.getElementById('hobbyPicker');
const profileForm = document.getElementById('profileForm');
const formNote = document.getElementById('formNote');
const locationBtn = document.getElementById('locationBtn');
const locationNote = document.getElementById('locationNote');
const avatarPreview = document.getElementById('avatarPreview');

let capturedLat = null;
let capturedLng = null;
let existingAvatarUrl = null;

// Must be logged in to be here
async function init() {
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) {
    window.location.href = 'login.html';
    return;
  }

  // Pre-fill from an existing saved profile (editing) first...
  const { data: existingProfile } = await supabaseClient
    .from('profiles')
    .select('full_name, city, gender, date_of_birth, latitude, longitude, avatar_url')
    .eq('id', user.id)
    .maybeSingle();

  const { data: existingHobbyRows } = await supabaseClient
    .from('user_hobbies')
    .select('hobby_id')
    .eq('user_id', user.id);

  let pendingHobbyIds = (existingHobbyRows || []).map(r => r.hobby_id);

  if (existingProfile) {
    document.getElementById('fullName').value = existingProfile.full_name || '';
    document.getElementById('city').value = existingProfile.city || '';
    if (existingProfile.gender) document.getElementById('gender').value = existingProfile.gender;
    if (existingProfile.date_of_birth) document.getElementById('dob').value = existingProfile.date_of_birth;
    capturedLat = existingProfile.latitude ?? null;
    capturedLng = existingProfile.longitude ?? null;
    existingAvatarUrl = existingProfile.avatar_url ?? null;

    if (existingAvatarUrl && avatarPreview) {
      avatarPreview.src = existingAvatarUrl;
      avatarPreview.style.display = 'block';
    }
    if (capturedLat && capturedLng) {
      locationNote.textContent = 'Location already on file ✓';
      locationNote.className = 'form-note success';
    }
  }

  // ...then override with pending signup data if that's why we're here (first-time setup)
  const pending = sessionStorage.getItem('hobbiyaa_pending_profile');
  if (pending) {
    const parsed = JSON.parse(pending);
    document.getElementById('fullName').value = parsed.fullName || '';
    document.getElementById('city').value = parsed.city || '';
    if (parsed.gender) document.getElementById('gender').value = parsed.gender;
    if (parsed.dob) document.getElementById('dob').value = parsed.dob;
    capturedLat = parsed.latitude ?? capturedLat;
    capturedLng = parsed.longitude ?? capturedLng;
    if (capturedLat && capturedLng) {
      locationNote.textContent = 'Location captured earlier ✓';
      locationNote.className = 'form-note success';
    }
    pendingHobbyIds = parsed.hobbyIds || pendingHobbyIds;
  }

  const { data: hobbies } = await supabaseClient.from('hobbies').select('*').order('id');

  hobbyPicker.innerHTML = hobbies.map(h => `
    <label>
      <input type="checkbox" name="hobby" value="${h.id}" ${pendingHobbyIds.includes(h.id) ? 'checked' : ''}>
      ${h.emoji || ''} ${h.name}
    </label>
  `).join('');
}
init();

locationBtn.addEventListener('click', () => {
  if (!navigator.geolocation) {
    locationNote.textContent = 'Location isn\'t supported on this browser.';
    locationNote.className = 'form-note error';
    return;
  }
  locationNote.textContent = 'Requesting location…';
  locationNote.className = 'form-note';

  navigator.geolocation.getCurrentPosition(
    (position) => {
      capturedLat = position.coords.latitude;
      capturedLng = position.coords.longitude;
      locationNote.textContent = 'Location captured ✓';
      locationNote.className = 'form-note success';
    },
    (err) => {
      locationNote.textContent = `Couldn't get location: ${err.message}. You can skip this — it's optional.`;
      locationNote.className = 'form-note error';
    }
  );
});

profileForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  formNote.textContent = '';
  formNote.className = 'form-note';

  const { data: { user } } = await supabaseClient.auth.getUser();
  const fullName = document.getElementById('fullName').value.trim();
  const city = document.getElementById('city').value.trim();
  const gender = document.getElementById('gender').value;
  const dob = document.getElementById('dob').value;
  const hobbyIds = Array.from(
    hobbyPicker.querySelectorAll('input[name="hobby"]:checked')
  ).map(el => parseInt(el.value, 10));

  if (hobbyIds.length === 0) {
    formNote.textContent = 'Pick at least one hobby.';
    formNote.className = 'form-note error';
    return;
  }

  const submitBtn = profileForm.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Saving…';

  // Use the newly cropped photo if the user made one; otherwise keep whatever was already saved
  let avatarUrl = existingAvatarUrl;
  if (window.pendingAvatarBlob) {
    const filePath = `${user.id}/${Date.now()}-avatar.jpg`;
    const { error: uploadError } = await supabaseClient.storage
      .from('avatars')
      .upload(filePath, window.pendingAvatarBlob, { contentType: 'image/jpeg' });

    if (uploadError) {
      formNote.textContent = `Photo upload failed: ${uploadError.message}`;
      formNote.className = 'form-note error';
      submitBtn.disabled = false;
      submitBtn.textContent = 'Save profile';
      return;
    }
    const { data } = supabaseClient.storage.from('avatars').getPublicUrl(filePath);
    avatarUrl = data.publicUrl;
  }

  const { error: profileError } = await supabaseClient
    .from('profiles')
    .upsert({
      id: user.id,
      full_name: fullName,
      city,
      gender: gender || null,
      date_of_birth: dob || null,
      latitude: capturedLat,
      longitude: capturedLng,
      avatar_url: avatarUrl,
    });

  if (profileError) {
    formNote.textContent = profileError.message;
    formNote.className = 'form-note error';
    submitBtn.disabled = false;
    submitBtn.textContent = 'Save profile';
    return;
  }

  // Replace hobby picks cleanly: clear old ones first so re-saving the same
  // hobbies doesn't hit a duplicate-key error, then insert the current selection.
  await supabaseClient.from('user_hobbies').delete().eq('user_id', user.id);
  const rows = hobbyIds.map(hobby_id => ({ user_id: user.id, hobby_id }));
  await supabaseClient.from('user_hobbies').insert(rows);

  sessionStorage.removeItem('hobbiyaa_pending_profile');
  window.location.href = 'dashboard.html';
});
