// Mobile nav toggle
const navToggle = document.getElementById('navToggle');
const siteNav = document.getElementById('siteNav');

navToggle.addEventListener('click', () => {
  const isOpen = siteNav.classList.toggle('open');
  navToggle.setAttribute('aria-expanded', String(isOpen));
});

// Close mobile nav when a link is tapped
siteNav.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => {
    siteNav.classList.remove('open');
    navToggle.setAttribute('aria-expanded', 'false');
  });
});

// Set current year in footer copyright
const footerYear = document.getElementById('footerYear');
if (footerYear) footerYear.textContent = new Date().getFullYear();

// Cursor-reactive spotlight on the corkboard
const board = document.querySelector('.board');
if (board) {
  board.addEventListener('mousemove', (e) => {
    const rect = board.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    board.style.setProperty('--mx', `${x}%`);
    board.style.setProperty('--my', `${y}%`);
  });
}

// Interactive hero hobby filter — highlights matching corkboard cards
const filterChips = document.querySelectorAll('.hero-filter-chip');
const heroCta = document.getElementById('heroCta');
const cards = document.querySelectorAll('.board .card');

const hobbyLabels = {
  all: 'Find your crew',
  badminton: 'Find your badminton partner',
  cricket: 'Find your cricket team',
  hiking: 'Find your hiking crew',
  boardgames: 'Find your board game night',
};

filterChips.forEach(chip => {
  chip.addEventListener('click', () => {
    filterChips.forEach(c => c.classList.remove('active'));
    chip.classList.add('active');

    const hobby = chip.dataset.hobby;
    if (heroCta && hobbyLabels[hobby]) heroCta.textContent = hobbyLabels[hobby];

    if (hobby === 'all') {
      board?.classList.remove('filtering');
      cards.forEach(c => c.classList.remove('match'));
    } else {
      board?.classList.add('filtering');
      cards.forEach(c => c.classList.toggle('match', c.dataset.hobby === hobby));
    }
  });
});

// Click (or press Enter/Space) on a corkboard card to reveal a small extra note
cards.forEach(card => {
  const toggle = () => card.classList.toggle('revealed');
  card.addEventListener('click', toggle);
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggle();
    }
  });
});

// Staggered fade-in for smaller repeated elements (steps, hobby chips, sticky notes)
const staggerGroups = [
  document.querySelectorAll('.steps .step'),
  document.querySelectorAll('.chip-grid .chip'),
  document.querySelectorAll('.why-grid .note'),
];

staggerGroups.forEach(group => {
  if (!group.length) return;
  const parent = group[0].closest('section, .why');
  const staggerObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        group.forEach((el, i) => {
          el.style.transitionDelay = `${i * 70}ms`;
          el.style.opacity = '1';
          el.style.transform = 'translateY(0)';
        });
        staggerObserver.disconnect();
      }
    });
  }, { threshold: 0.2 });

  group.forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(16px)';
    el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
  });
  if (parent) staggerObserver.observe(parent);
});

// Join form — front-end only for now (no backend yet)
const joinForm = document.getElementById('joinForm');
const formNote = document.getElementById('formNote');

joinForm.addEventListener('submit', (e) => {
  e.preventDefault();

  const email = document.getElementById('email').value.trim();
  const city = document.getElementById('city').value.trim();
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailPattern.test(email)) {
    formNote.textContent = "That email doesn't look right — check and try again.";
    formNote.className = 'form-note error';
    return;
  }

  if (city.length < 2) {
    formNote.textContent = 'Add your city or locality so we know where to pin you.';
    formNote.className = 'form-note error';
    return;
  }

  // No backend yet — this just confirms locally.
  // Swap this block out once Hobbiyaa has a real API to post to.
  formNote.textContent = `Pinned! We'll email ${email} when Hobbiyaa lands in ${city}.`;
  formNote.className = 'form-note success';
  joinForm.reset();
});

// Reveal sections gently on scroll
const revealTargets = document.querySelectorAll('.how, .explore, .why, .join');
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.style.opacity = '1';
      entry.target.style.transform = 'translateY(0)';
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.15 });

revealTargets.forEach(section => {
  section.style.opacity = '0';
  section.style.transform = 'translateY(24px)';
  section.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
  revealObserver.observe(section);
});
