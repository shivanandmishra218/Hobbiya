const hobbyPicker = document.getElementById('hobbyPicker');
const signupForm = document.getElementById('signupForm');
const formNote = document.getElementById('formNote');
const locationBtn = document.getElementById('locationBtn');
const locationNote = document.getElementById('locationNote');

let hobbiesList = [];
let capturedLat = null;
let capturedLng = null;

// Load hobbies from the database and render them as checkboxes
async function loadHobbies() {
  const { data, error } = await supabaseClient.from('hobbies').select('*').order('id');
  if (error) {
    hobbyPicker.innerHTML = `<p class="form-note error">Couldn't load hobbies: ${error.message}</p>`;
    return;
  }
  hobbiesList = data;
  hobbyPicker.innerHTML = data.map(h => `
    <label>
      <input type="checkbox" name="hobby" value="${h.id}">
      ${h.emoji || ''} ${h.name}
    </label>
  `).join('');
}
loadHobbies();

// Ask the browser for location access (works on localhost / https)
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

signupForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  formNote.textContent = '';
  formNote.className = 'form-note';

  const fullName = document.getElementById('fullName').value.trim();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const city = document.getElementById('city').value.trim();
  const gender = document.getElementById('gender').value;
  const dob = document.getElementById('dob').value;
  const selectedHobbyIds = Array.from(
    hobbyPicker.querySelectorAll('input[name="hobby"]:checked')
  ).map(el => parseInt(el.value, 10));

  if (selectedHobbyIds.length === 0) {
    formNote.textContent = 'Pick at least one hobby so people can find you.';
    formNote.className = 'form-note error';
    return;
  }

  const submitBtn = signupForm.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Creating account…';

  // 1. Create the auth account
  const { data: signUpData, error: signUpError } = await supabaseClient.auth.signUp({
    email,
    password,
  });

  if (signUpError) {
    formNote.textContent = signUpError.message;
    formNote.className = 'form-note error';
    submitBtn.disabled = false;
    submitBtn.textContent = 'Create account';
    return;
  }

  const userId = signUpData.user?.id;
  const hasSession = !!signUpData.session;

  if (!hasSession) {
    // Email confirmation is required before we get a session, so we can't
    // upload the avatar or save the profile yet (both need an authenticated
    // user). We stash everything EXCEPT the avatar file (files can't be
    // saved to sessionStorage) — they'll be asked to add a photo again on
    // complete-profile.html right after confirming + logging in.
    sessionStorage.setItem('hobbiyaa_pending_profile', JSON.stringify({
      fullName, city, gender, dob,
      latitude: capturedLat, longitude: capturedLng,
      hobbyIds: selectedHobbyIds
    }));
    formNote.textContent = `Account created! Check ${email} to confirm it, then log in to finish your profile.`;
    formNote.className = 'form-note success';
    submitBtn.disabled = false;
    submitBtn.textContent = 'Create account';
    return;
  }

  // 2. Session exists immediately (email confirmation off) — upload avatar + save profile now
  let avatarUrl = null;
  if (window.pendingAvatarBlob) {
    avatarUrl = await uploadAvatar(userId, window.pendingAvatarBlob);
  }

  const saved = await saveProfile(userId, {
    fullName, city, gender, dob,
    latitude: capturedLat, longitude: capturedLng,
    avatarUrl,
  }, selectedHobbyIds);

  submitBtn.disabled = false;
  submitBtn.textContent = 'Create account';

  if (saved) {
    window.location.href = 'feed.html';
  }
});

// Uploads to the "avatars" bucket under a folder named after the user's id
async function uploadAvatar(userId, blob) {
  const filePath = `${userId}/${Date.now()}-avatar.jpg`;
  const { error: uploadError } = await supabaseClient.storage
    .from('avatars')
    .upload(filePath, blob, { contentType: 'image/jpeg' });
  if (uploadError) {
    formNote.textContent = `Photo upload failed: ${uploadError.message}`;
    formNote.className = 'form-note error';
    return null;
  }
  const { data } = supabaseClient.storage.from('avatars').getPublicUrl(filePath);
  return data.publicUrl;
}

// Shared helper: writes the profile + hobby picks. Used here and on complete-profile.html
async function saveProfile(userId, fields, hobbyIds) {
  const { error: profileError } = await supabaseClient
    .from('profiles')
    .upsert({
      id: userId,
      full_name: fields.fullName,
      city: fields.city,
      gender: fields.gender || null,
      date_of_birth: fields.dob || null,
      latitude: fields.latitude,
      longitude: fields.longitude,
      avatar_url: fields.avatarUrl || null,
    });

  if (profileError) {
    formNote.textContent = profileError.message;
    formNote.className = 'form-note error';
    return false;
  }

  const rows = hobbyIds.map(hobby_id => ({ user_id: userId, hobby_id }));
  const { error: hobbiesError } = await supabaseClient.from('user_hobbies').insert(rows);

  if (hobbiesError) {
    formNote.textContent = hobbiesError.message;
    formNote.className = 'form-note error';
    return false;
  }

  return true;
}
