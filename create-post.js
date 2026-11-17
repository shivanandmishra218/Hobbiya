const postForm = document.getElementById('postForm');
const hobbySelect = document.getElementById('hobby');
const formNote = document.getElementById('formNote');
const photoInput = document.getElementById('photo');
const photoPreview = document.getElementById('photoPreview');
const removePhotoBtn = document.getElementById('removePhotoBtn');
const pageTitle = document.querySelector('.post-form-wrap h1');
const submitBtnEl = postForm.querySelector('button[type="submit"]');

let currentUser = null;
let myCity = null;
let selectedPhotoFile = null;
let editPostId = null;
let existingImageUrl = null;

function getEditIdFromUrl() {
  return new URLSearchParams(window.location.search).get('edit');
}

async function init() {
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) {
    window.location.href = 'login.html';
    return;
  }
  currentUser = user;

  const { data: profile } = await supabaseClient
    .from('profiles')
    .select('city')
    .eq('id', user.id)
    .single();

  if (!profile) {
    window.location.href = 'complete-profile.html';
    return;
  }
  myCity = profile.city;

  const { data: hobbies } = await supabaseClient.from('hobbies').select('*').order('id');
  hobbySelect.innerHTML += (hobbies || [])
    .map(h => `<option value="${h.id}">${h.emoji || ''} ${h.name}</option>`)
    .join('');

  editPostId = getEditIdFromUrl();
  if (editPostId) {
    await loadPostForEdit();
  }
}
const eventTimeInput = document.getElementById('eventTime');
if (eventTimeInput) {
  const now = new Date(); now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  eventTimeInput.min = now.toISOString().slice(0, 16);
}
init();

async function loadPostForEdit() {
  const { data: post, error } = await supabaseClient
    .from('posts')
    .select('*')
    .eq('id', editPostId)
    .single();

  if (error || !post || post.user_id !== currentUser.id) {
    showToast("Couldn't load that post for editing.", 'error');
    window.location.href = 'feed.html';
    return;
  }

  pageTitle.textContent = 'Edit post';
  submitBtnEl.textContent = 'Save changes';

  hobbySelect.value = post.hobby_id;
  document.getElementById('location').value = post.location;
  if (post.event_time) {
    // datetime-local inputs need "YYYY-MM-DDTHH:mm" in LOCAL time, not UTC
    const d = new Date(post.event_time);
    const pad = n => String(n).padStart(2, '0');
    document.getElementById('eventTime').value =
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  if (post.members_needed) document.getElementById('membersNeeded').value = post.members_needed;
  if (post.description) document.getElementById('description').value = post.description;

  if (post.image_url) {
    existingImageUrl = post.image_url;
    photoPreview.src = post.image_url;
    photoPreview.style.display = 'block';
    removePhotoBtn.style.display = 'inline-block';
  }
}

photoInput.addEventListener('change', () => {
  const file = photoInput.files[0];
  if (!file) return;
  selectedPhotoFile = file;
  existingImageUrl = null; // replacing the old photo
  photoPreview.src = URL.createObjectURL(file);
  photoPreview.style.display = 'block';
  removePhotoBtn.style.display = 'inline-block';
});

removePhotoBtn.addEventListener('click', () => {
  selectedPhotoFile = null;
  existingImageUrl = null;
  photoInput.value = '';
  photoPreview.style.display = 'none';
  removePhotoBtn.style.display = 'none';
});

postForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  formNote.textContent = '';
  formNote.className = 'form-note';

  const hobbyId = parseInt(hobbySelect.value, 10);
  const location = document.getElementById('location').value.trim();
  const eventTimeRaw = document.getElementById('eventTime').value;
  const membersNeededRaw = document.getElementById('membersNeeded').value;
  const description = document.getElementById('description').value.trim();

  const eventTime = eventTimeRaw ? new Date(eventTimeRaw) : null;
  const membersNeeded = Number(membersNeededRaw);
  if (!hobbyId || !location || !eventTimeRaw || !Number.isFinite(eventTime?.getTime()) || eventTime <= new Date() || !Number.isInteger(membersNeeded) || membersNeeded < 1 || membersNeeded > 100 || !description) {
    formNote.textContent = 'Please choose a hobby, meeting spot, future date and time, 1–100 additional people, and add a description.';
    formNote.className = 'form-note error';
    return;
  }

  submitBtnEl.disabled = true;
  submitBtnEl.textContent = editPostId ? 'Saving…' : 'Posting…';

  let imageUrl = existingImageUrl;
  if (selectedPhotoFile) {
    const filePath = `${currentUser.id}/${Date.now()}-${selectedPhotoFile.name}`;
    const { error: uploadError } = await supabaseClient.storage
      .from('post-images')
      .upload(filePath, selectedPhotoFile);

    if (uploadError) {
      showToast(`Photo upload failed: ${uploadError.message}`, 'error');
      submitBtnEl.disabled = false;
      submitBtnEl.textContent = editPostId ? 'Save changes' : 'Post to feed';
      return;
    }
    const { data } = supabaseClient.storage.from('post-images').getPublicUrl(filePath);
    imageUrl = data.publicUrl;
  }

  const coords = await geocodeLocation(`${location}, ${myCity}`);

  const postData = {
    hobby_id: hobbyId,
    city: myCity,
    location,
    event_time: eventTime.toISOString(),
    members_needed: membersNeeded,
    description,
    image_url: imageUrl,
    latitude: coords?.lat ?? null,
    longitude: coords?.lon ?? null,
  };

  const { error } = editPostId
    ? await supabaseClient.from('posts').update(postData).eq('id', editPostId)
    : await supabaseClient.from('posts').insert({ ...postData, user_id: currentUser.id });

  if (error) {
    formNote.textContent = error.message;
    formNote.className = 'form-note error';
    submitBtnEl.disabled = false;
    submitBtnEl.textContent = editPostId ? 'Save changes' : 'Post to feed';
    return;
  }

  window.location.href = 'feed.html';
});

// Turns "Kolar Road, Kanpur" into real coordinates using OpenStreetMap's free
// geocoding service (no API key needed). If it can't find a match, the post
// still saves fine — it just won't appear on the map view.
async function geocodeLocation(query) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
    const res = await fetch(url);
    const results = await res.json();
    if (results && results[0]) {
      return { lat: parseFloat(results[0].lat), lon: parseFloat(results[0].lon) };
    }
  } catch (e) {
    // Network hiccup or blocked request — fail silently, post still saves without coordinates
  }
  return null;
}
