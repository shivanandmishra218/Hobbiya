const loginForm = document.getElementById('loginForm');
const formNote = document.getElementById('formNote');

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  formNote.textContent = '';
  formNote.className = 'form-note';

  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  const submitBtn = loginForm.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Logging in…';

  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

  if (error) {
    formNote.textContent = error.message;
    formNote.className = 'form-note error';
    submitBtn.disabled = false;
    submitBtn.textContent = 'Log in';
    return;
  }

  const userId = data.user.id;

  // Does a profile already exist for this user?
  const { data: profile } = await supabaseClient
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .maybeSingle();

  if (profile) {
    window.location.href = 'dashboard.html';
  } else {
    // First login after email confirmation — finish setting up their profile
    window.location.href = 'complete-profile.html';
  }
});
