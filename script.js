// ============================================================
// PERSONA 5 pause-menu navigation
// ============================================================

const menu = document.getElementById('menu');
const items = Array.from(menu.querySelectorAll('.menu-item'));
const panelWrap = document.getElementById('panel-wrap');
const panelClose = document.getElementById('panel-close');
const panels = Array.from(panelWrap.querySelectorAll('.panel'));

let current = 0;

// ---- Highlight the active menu item ----
function setActive(index) {
  const next = (index + items.length) % items.length;
  if (next !== current) playSwitchSfx(); // hovering/keying to a different section
  current = next;
  items.forEach((item, i) => item.classList.toggle('is-active', i === current));
}

// ---- Open / close the sliding content panel ----
const fadeBlack = document.getElementById('fade-black');

// Full-bleed video sections: each plays its built-in transition once on open,
// then loops only the settled pose (from the given second onward) so the baked
// menu text in the transition never reappears.
const SECTION_LOOP_START = {
  persona: 0.9,
  experience: 1.0,
  skills: 0.9,
  education: 0.9,
};

function sectionVideo(target) {
  return document.querySelector(`.panel[data-panel="${target}"] .section-video`);
}

function showPanel(target) {
  panels.forEach((p) => p.classList.toggle('is-shown', p.dataset.panel === target));
  panelWrap.classList.toggle('guests-open', target === 'guests'); // right-side comments
  panelWrap.hidden = false;
  if (target === 'guests' && typeof renderGuests === 'function') renderGuests(); // pull latest
}

function openPanel(target) {
  // clear any still-running exit overlay from a previous section
  const to = document.getElementById('transition-out');
  if (to) { to.classList.remove('is-playing'); to.pause(); }
  stopSidecar(); // halt any still-playing exit audio from a previous section
  if (target !== 'education') pauseEduClips(); // free GPU when leaving education
  if (target in SECTION_LOOP_START) return openMediaPanel(target);
  showPanel(target);
}

// A very quick, thin fade to black masks the cut, then the section's video
// plays its own built-in transition once and settles into the looping pose.
// Education's two green-screen clips: play the intro once WITH audio (the
// transition-in), then loop only the settled-text tail (muted) so the text
// stays on screen. Motion analysis showed both clips finish animating by
// ~0.4s, after which they hold a static frame to the end.
const EDU_INTRO_START = 0.09; // s — skip the clips' opening solid-black frames
const EDU_TAIL_START = 0.4;   // s — start of the held-text loop segment
function playEduClips() {
  document.querySelectorAll('[data-panel="education"] .edu-clip').forEach((v) => {
    v.loop = false;
    v.muted = false;       // audio plays on the way in
    v.volume = 1;
    v.onended = () => {     // intro done → loop the static tail silently
      v.muted = true;
      try { v.currentTime = EDU_TAIL_START; } catch (e) {}
      v.play().catch(() => {});
    };
    try { v.currentTime = EDU_INTRO_START; } catch (e) {} // start past the black frames
    v.play().catch(() => {});
  });
}

// Pause the edu clips when education isn't on screen — two 1080p decodes plus a
// per-frame SVG chroma key running in the background is the main source of jank.
function pauseEduClips() {
  document.querySelectorAll('[data-panel="education"] .edu-clip').forEach((v) => {
    v.onended = null;
    try { v.pause(); } catch (e) {}
  });
}

function openMediaPanel(target) {
  fadeBlack.style.transition = 'opacity 0.05s ease';
  fadeBlack.style.opacity = '1';
  setTimeout(() => {
    showPanel(target);
    const v = sectionVideo(target);
    if (v) { v.currentTime = 0; v.play().catch(() => {}); }
    if (target === 'education') playEduClips();
    if (target === 'persona' || target === 'experience' || target === 'skills') scheduleSectionItems(target, v);
    setTimeout(() => {
      fadeBlack.style.transition = 'opacity 0.12s ease';
      fadeBlack.style.opacity = '0';
    }, 30);
  }, 55);
}

// Persona blurb art: slide it in from the left and fire the same SFX the
// education text uses (extracted from the edu clip's own audio track), started
// at the same offset so the swoosh lands together with the slide.
const personaTextSfx = new Audio('./assets/edutext_sfx.m4a');
personaTextSfx.preload = 'auto';
personaTextSfx.volume = 1;

// Click SFX (audio only, from clicksfx.mov) played when a menu section is opened.
const clickSfx = new Audio('./assets/clicksfx.m4a');
clickSfx.preload = 'auto';
clickSfx.volume = 1;
function playClickSfx() {
  try { clickSfx.currentTime = 0; clickSfx.play().catch(() => {}); } catch (e) {}
}

// Esc/Back SFX (audio only, from escsfx.mov) played when backing out of a panel.
const escSfx = new Audio('./assets/escsfx.m4a');
escSfx.preload = 'auto';
escSfx.volume = 1;
function playEscSfx() {
  try { escSfx.currentTime = 0; escSfx.play().catch(() => {}); } catch (e) {}
}

// Switch SFX (audio only, from switchsfx.mov) played when the highlighted
// section changes (hovering or arrow-keying to a different one).
const switchSfx = new Audio('./assets/switchsfx.m4a');
switchSfx.preload = 'auto';
switchSfx.volume = 1;
function playSwitchSfx() {
  try { switchSfx.currentTime = 0; switchSfx.play().catch(() => {}); } catch (e) {}
}
// Hold a media section's items back until its built-in transition has begun
// playing out, then slide them in from the left and punch the view with a camera
// shake. Shared by Persona (blurb card + polaroids) and Socials (the banner
// stack). A single active timeupdate listener + safety timer drive the reveal,
// both torn down on fire or on a fresh open, so rapid open/close can never stack
// reveals or shakes.
let sectionItemsTimer = null;
let sectionTickCleanup = null;
function scheduleSectionItems(target, v) {
  if (sectionTickCleanup) sectionTickCleanup(); // cancel a previous pending reveal
  clearTimeout(sectionItemsTimer);

  const panel = document.querySelector(`.panel[data-panel="${target}"]`);
  if (panel) panel.classList.remove('items-in', 'cam-shake'); // reset for re-entry
  resetSectionSlide(panel);                                   // re-hide the sliders

  // Fire early — mid-transition, while the pose is still snapping in (not at the
  // full settle point) — so the items + shake land during the transition.
  const settleAt = 0.12; // s
  const onTick = () => { if (v && v.currentTime >= settleAt) fire(); };
  const cleanup = () => {
    if (v) v.removeEventListener('timeupdate', onTick);
    clearTimeout(sectionItemsTimer);
    sectionTickCleanup = null;
  };
  const fire = () => { cleanup(); revealSectionItems(target); };

  sectionTickCleanup = cleanup;
  if (v) v.addEventListener('timeupdate', onTick);
  // Safety: if timeupdate stalls (e.g. throttled/background tab), reveal anyway.
  sectionItemsTimer = setTimeout(fire, settleAt * 1000 + 500);
}

function resetSectionSlide(panel) {
  if (!panel) return;
  panel.querySelectorAll('.persona-text, .socials-card').forEach((el) => el.classList.remove('slide'));
  const fav = panel.querySelector('.fav-board');
  if (fav) fav.classList.remove('drop');
}

function revealSectionItems(target) {
  if (shownPanel() !== target) return; // user backed out before the reveal
  const panel = document.querySelector(`.panel[data-panel="${target}"]`);
  if (target === 'persona') playPersonaText();      // blurb card slides in + SFX
  else if (target === 'experience') playSocials();  // banner stack slides in + SFX
  else if (target === 'skills') playFavorites();    // collage drops in + dangles
  if (!panel) return;
  panel.classList.add('items-in'); // fade any opacity-gated items in (e.g. polaroids)
  if (target === 'skills') return; // Favorites uses the drop/dangle, not the shake
  panel.classList.remove('cam-shake');
  void panel.offsetWidth;          // reflow so the shake restarts on re-entry
  panel.classList.add('cam-shake');
  const onShakeEnd = (e) => {
    if (e.target !== panel) return; // ignore child (slide) animationend bubbling
    panel.classList.remove('cam-shake');
    panel.removeEventListener('animationend', onShakeEnd);
  };
  panel.addEventListener('animationend', onShakeEnd);
}

// Favorites: drop the keyed collage in from the top with a dangling swing.
function playFavorites() {
  const el = document.querySelector('[data-panel="skills"] .fav-board');
  if (!el) return;
  el.classList.remove('drop');
  void el.offsetWidth; // restart the drop on re-entry
  el.classList.add('drop');
  try { personaTextSfx.currentTime = EDU_INTRO_START; personaTextSfx.play().catch(() => {}); } catch (e) {}
}

// Socials: slide the keyed banner stack in from the left + the same swoosh SFX.
function playSocials() {
  const el = document.querySelector('[data-panel="experience"] .socials-card');
  if (!el) return;
  el.classList.remove('slide');
  void el.offsetWidth; // restart the slide on re-entry
  el.classList.add('slide');
  try { personaTextSfx.currentTime = EDU_INTRO_START; personaTextSfx.play().catch(() => {}); } catch (e) {}
}

function playPersonaText() {
  const el = document.querySelector('[data-panel="persona"] .persona-text');
  if (!el) return;
  // The clip is a static card after ~0.5s; show a settled frame on both layers
  // (keyed base + un-keyed "18" overlay), then pause so they aren't decoding +
  // chroma-keying every frame in the background.
  el.querySelectorAll('.persona-text-vid').forEach((v) => {
    try { v.currentTime = 1.2; } catch (e) {}
    v.play().then(() => {
      setTimeout(() => { try { v.pause(); } catch (e) {} }, 250);
    }).catch(() => {});
  });
  el.classList.remove('slide');
  void el.offsetWidth; // force reflow so the animation restarts on re-entry
  el.classList.add('slide');
  try { personaTextSfx.currentTime = EDU_INTRO_START; personaTextSfx.play().catch(() => {}); } catch (e) {}
}

const transitionOut = document.getElementById('transition-out');
let transitioning = false;

// Optional louder audio sidecar (used for clips whose own track is too quiet).
const sidecarAudio = new Audio();
sidecarAudio.preload = 'auto';
function stopSidecar() { try { sidecarAudio.pause(); sidecarAudio.currentTime = 0; } catch (e) {} }

// Per-section "transition-out" clip (black background, keyed out via the screen
// blend in CSS, with audio) played when backing out of that section.
//   clip        - the cutout video
//   swapAt      - ms after Back to restore the base menu (timed under the splash)
//   replayIntro - whether to replay the base-menu intro, or just reveal it
//   chroma      - true for green-screen clips (keyed to transparency, no blend)
//   audio       - optional louder sidecar audio (the clip's own track is muted
//                 and this amplified copy plays in sync instead)
const SECTION_TRANSITION_OUT = {
  // swap as the glass shatter starts (~1.45s)
  persona: { clip: './assets/menu1cutout.mp4', swapAt: 1450, replayIntro: true },
  // menu2's native audio is much quieter than the others — play an amplified copy
  experience: { clip: './assets/menu2cutout.mp4', swapAt: 1500, replayIntro: true, audio: './assets/menu2loud.m4a' },
  // Favorites: a green-screen cutout. Key the green out so the base menu shows
  // through it, and do NOT replay the title intro afterward — this clip is the
  // way back, so we just reveal the settled menu beneath it (replayIntro: false).
  skills: { clip: './assets/favoritescutout.mp4', swapAt: 500, replayIntro: false, chroma: true, darkenRed: true },
  // green-keyed clip: its content plays 0–0.9s then turns black, so swap to the
  // menu and end the overlay right before the black (~0.9s).
  education: { clip: './assets/menu4cutout.mp4', swapAt: 900, replayIntro: true, chroma: true, endAtSwap: true },
};

function shownPanel() {
  const p = panels.find((el) => el.classList.contains('is-shown'));
  return p ? p.dataset.panel : null;
}

function finishClose(replayIntro = true) {
  panelWrap.hidden = true;
  pauseEduClips(); // stop the education clips once we're back at the menu
  if (document.activeElement) document.activeElement.blur(); // drop focus ring
  fadeBlack.style.opacity = '0'; // clear any in-flight fade
  if (replayIntro) {
    playIntro(); // replay the title intro when backing out of a section
  } else {
    menu.classList.add('revealed'); // just reveal the menu, no intro replay
  }
}

function closePanel() {
  if (panelWrap.hidden || transitioning) return;
  playEscSfx(); // Esc/Back pressed (key or button)
  // Stop the education clips up front: leaving them decoding + chroma-keying
  // while the (also chroma-keyed) transition-out clip plays is what made the
  // exit stutter. Freeing them before the overlay starts keeps it smooth.
  pauseEduClips();
  const cur = shownPanel();
  // Also pause the section's own looping video: decoding it alongside the
  // chroma-keyed transition overlay (plus its per-frame key) is what re-added
  // the few-frame hitch. It's hidden behind the overlay anyway, and replays
  // from the start on re-entry.
  const curVid = cur && sectionVideo(cur);
  if (curVid) { try { curVid.pause(); } catch (e) {} }
  const cfg = SECTION_TRANSITION_OUT[cur];
  // Leaving a section with a transition-out clip: play it (with sound) as a
  // screen-keyed overlay; restore the base menu partway through (timed so the
  // swap is hidden under the splash, e.g. the white flash) while the clip runs.
  if (cfg && transitionOut) {
    transitioning = true;
    transitionOut.classList.remove('is-playing'); // start invisible (opacity 0)
    // Only (re)load the clip when it actually changes — re-assigning the same
    // src forces a full reload + first-frame decode, which itself caused a hitch.
    if (!transitionOut.currentSrc || !transitionOut.currentSrc.endsWith(cfg.clip.slice(1))) {
      transitionOut.src = cfg.clip;
    }
    transitionOut.classList.toggle('chroma', !!cfg.chroma);
    transitionOut.classList.toggle('darkred', !!cfg.darkenRed); // Favorites only
    transitionOut.currentTime = 0;
    // Audio: Escape is a real user gesture, so playback is allowed (no Web Audio
    // routing — that hijacks the element through a suspended AudioContext and
    // silences it). If the clip has an amplified sidecar, mute the clip's own
    // quiet track and play the louder copy in sync; otherwise use the clip audio.
    stopSidecar();
    if (cfg.audio) {
      transitionOut.muted = true;
      sidecarAudio.src = cfg.audio;
      sidecarAudio.currentTime = 0;
      sidecarAudio.volume = 1;
      sidecarAudio.play().catch(() => {});
    } else {
      transitionOut.muted = false;
      transitionOut.volume = 1;
    }
    const end = () => {
      transitionOut.removeEventListener('ended', end);
      transitionOut.classList.remove('is-playing');
    };
    transitionOut.addEventListener('ended', end);
    // Reveal only once a real video frame has been presented — otherwise the
    // element paints one black compositor frame before its first frame (the
    // black flash). opacity:0 keeps it composited so the frame callback fires.
    const reveal = () => transitionOut.classList.add('is-playing');
    const onReady = () => {
      if ('requestVideoFrameCallback' in transitionOut) {
        transitionOut.requestVideoFrameCallback(() => reveal());
      } else {
        requestAnimationFrame(reveal);
      }
    };
    const p = transitionOut.play();
    if (p && p.then) p.then(onReady).catch(reveal); else onReady();
    setTimeout(() => {
      finishClose(cfg.replayIntro);
      // for clips whose useful content ends before the file does (then go black),
      // hide the overlay now so the black tail never covers the menu — but keep
      // it playing (display:none) so the clip's audio finishes.
      if (cfg.endAtSwap) {
        transitionOut.classList.remove('is-playing');
      }
      transitioning = false;
    }, cfg.swapAt);
    return;
  }
  finishClose();
}

// Each section video plays its transition once, then loops the settled pose.
Object.keys(SECTION_LOOP_START).forEach((target) => {
  const v = sectionVideo(target);
  if (!v) return;
  v.addEventListener('ended', () => {
    v.currentTime = SECTION_LOOP_START[target];
    v.play().catch(() => {});
  });
});

// ---- Mouse: hover highlights, click opens ----
items.forEach((item, i) => {
  item.addEventListener('mouseenter', () => setActive(i));
  item.addEventListener('click', (e) => {
    e.preventDefault();
    setActive(i);
    playClickSfx();
    openPanel(item.dataset.target);
  });
});

panelClose.addEventListener('click', closePanel);

// ---- Keyboard: arrows to move, Enter to confirm, Esc to back ----
document.addEventListener('keydown', (e) => {
  if (!panelWrap.hidden) {
    if (e.key === 'Escape') closePanel();
    return;
  }
  switch (e.key) {
    case 'ArrowUp':
    case 'w':
      setActive(current - 1);
      e.preventDefault();
      break;
    case 'ArrowDown':
    case 's':
      setActive(current + 1);
      e.preventDefault();
      break;
    case 'Enter':
    case ' ':
      playClickSfx();
      openPanel(items[current].dataset.target);
      e.preventDefault();
      break;
  }
});

// ---- Background video: the intro (0 .. LOOP_START) plays once; after that
//      it loops only the settled idle (LOOP_START .. end). The menu text slams
//      in at the intro's impact. The intro replays on load and whenever the
//      user backs out of a section with Escape. ----
const LOOP_START = 1.2;  // seconds — the pose is settled by here
const IMPACT_TIME = 0.45; // seconds — the hand slams / red bursts in
const bgVideo = document.querySelector('.bg-video');

function revealMenu() {
  if (bgVideo && bgVideo.currentTime >= IMPACT_TIME) menu.classList.add('revealed');
}

if (bgVideo) {
  bgVideo.removeAttribute('loop');
  bgVideo.addEventListener('ended', () => {
    bgVideo.currentTime = LOOP_START;
    bgVideo.play();
  });
  bgVideo.addEventListener('timeupdate', revealMenu);
}

// Intro SFX: the gated menu1 audio (the slap hit + the sfx just before it,
// with the background music removed). Synced to the intro video from t=0 — its
// slap lands on the video's hand-slam impact. Played whenever the intro runs.
const introAudio = new Audio('./assets/introaudio.m4a');
introAudio.preload = 'auto';
let introAudioPlayed = false;
function playIntroAudio() {
  try {
    introAudio.currentTime = 0;
    const p = introAudio.play();
    if (p && p.then) p.then(() => { introAudioPlayed = true; }).catch(() => {});
  } catch (e) { /* autoplay blocked until a user gesture */ }
}

function playIntro() {
  if (!bgVideo) return;
  menu.classList.remove('revealed'); // hide; it slams back in at the impact
  bgVideo.currentTime = 0;
  const p = bgVideo.play();
  if (p) p.catch(() => {});
  playIntroAudio(); // play the slap SFX synced to the intro
}

// On site open: start the slap audio in sync with the autoplaying intro video,
// the moment playback begins. This works on return visits / permissive browsers.
function startIntroAudioSynced() {
  if (introAudioPlayed) return;
  playIntroAudio();
}
if (bgVideo) bgVideo.addEventListener('playing', startIntroAudioSynced, { once: true });
window.addEventListener('load', startIntroAudioSynced);

// ---- P5 ransom-note lettering for the menu labels ----
// Each glyph becomes its own span with a random font / rotation / scale,
// mimicking the cut-out look of the Persona 5 menu.
const RANSOM_FONTS = [
  "'Anton', sans-serif",
  "'Archivo Black', sans-serif",
  "'Passion One', sans-serif",
  "'Bungee', sans-serif",
  "'Rozha One', serif",
];

// Per-glyph random fill colour, revealed on hover only. Blue / black / white.
const RANSOM_COLORS = [
  'var(--p5-cyan)',
  'var(--p5-white)',
  'var(--p5-black)',
  'var(--p5-red)',
  'var(--p5-cyan)',
  'var(--p5-white)',
];

function ransomize(el) {
  const text = el.textContent;
  el.textContent = '';
  for (const char of text) {
    if (char === ' ') {
      el.appendChild(document.createTextNode(' '));
      continue;
    }
    const span = document.createElement('span');
    span.className = 'ch';
    span.textContent = char;
    const rot = (Math.random() * 16 - 8).toFixed(1);     // -8deg .. 8deg
    const dy = (Math.random() * 0.10 - 0.05).toFixed(3); // slight vertical jitter
    const sc = (0.85 + Math.random() * 0.32).toFixed(2); // 0.85 .. 1.17
    span.style.fontFamily = RANSOM_FONTS[Math.floor(Math.random() * RANSOM_FONTS.length)];
    span.style.transform = `translateY(${dy}em) rotate(${rot}deg) scale(${sc})`;
    span.style.setProperty('--chc', RANSOM_COLORS[Math.floor(Math.random() * RANSOM_COLORS.length)]);
    el.appendChild(span);
  }
}

document.querySelectorAll('.menu-label').forEach(ransomize);

// Start prompt: give each letter a slightly random font size (subtle jumble).
document.querySelectorAll('.start-gate-text .ch').forEach((ch) => {
  ch.style.fontSize = (0.92 + Math.random() * 0.28).toFixed(2) + 'em'; // 0.92em .. 1.2em
});

// ---- Base menu: random per-line jumble (offset + rotation) ----
items.forEach((item) => {
  const jx = (Math.random() * 26 - 8).toFixed(0);  // -8px .. 18px
  const jr = (Math.random() * 6 - 3).toFixed(1);   // -3deg .. 3deg
  item.style.setProperty('--jx', `${jx}px`);
  item.style.setProperty('--jr', `${jr}deg`);
});

// ---- Persona page: fan its text lines so they point at Joker in the
//      menu2loop video (his face sits on the right). Run on open + resize. ----
// ---- Guests: interactive guestbook (stored locally in the browser) ----
const GUEST_KEY = 'p5-guestbook';
const MAX_GUESTS = 20; // keep at most this many; oldest drop off beyond it
// Stable per-browser owner token: a comment can only be deleted by its author
// (the browser that posted it), never by anyone viewing someone else's comment.
let GUEST_OWNER = localStorage.getItem('p5-guest-owner');
if (!GUEST_OWNER) {
  GUEST_OWNER = (crypto.randomUUID && crypto.randomUUID()) || (Date.now() + '-' + Math.random());
  localStorage.setItem('p5-guest-owner', GUEST_OWNER);
}
const ownsGuest = (g) => g.owner == null || g.owner === GUEST_OWNER; // legacy (no owner) = local
const guestForm = document.getElementById('guest-form');
const guestName = document.getElementById('guest-name');
const guestMsg = document.getElementById('guest-msg');
const guestList = document.getElementById('guest-list');
const guestError = document.getElementById('guest-error');

// One-time cleanup: wipe any leftover test comments (runs once, then never again).
if (!localStorage.getItem('p5-guestbook-reset')) {
  localStorage.removeItem(GUEST_KEY);
  localStorage.setItem('p5-guestbook-reset', '1');
}

// Basic inappropriate-content filter. Not exhaustive, but blocks common profanity
// and slurs, including light obfuscation (leetspeak / spaced-out letters). Word
// boundaries keep innocent words (class, assassin, Scunthorpe…) from matching.
const BANNED = [
  'fuck', 'shit', 'bitch', 'asshole', 'cunt', 'dick', 'pussy', 'bastard', 'slut',
  'whore', 'nigger', 'nigga', 'faggot', 'fag', 'retard', 'rape', 'kike', 'spic',
  'chink', 'wetback', 'tranny', 'dyke', 'cock', 'dildo', 'jizz',
];
function hasInappropriate(text) {
  const t = (text || '').toLowerCase()
    .replace(/[@4]/g, 'a').replace(/[$5]/g, 's').replace(/[1!|]/g, 'i')
    .replace(/0/g, 'o').replace(/3/g, 'e').replace(/7/g, 't');
  return BANNED.some((w) => {
    const spaced = w.split('').join('[\\W_]*'); // allow f.u.c.k / f u c k
    return new RegExp(`(^|[^a-z])${spaced}s?([^a-z]|$)`, 'i').test(t);
  });
}
function showGuestError(m) { if (guestError) { guestError.textContent = m; guestError.hidden = false; } }
function clearGuestError() { if (guestError) { guestError.hidden = true; guestError.textContent = ''; } }

// ---- Storage backend ----
// Shared guestbook via Supabase: every visitor sees everyone's comments. Paste
// your project URL + anon (public) key below — until both are set it falls back
// to per-browser localStorage so the site still works. (Setup steps are in the
// README.) Everyone can read & post; the RLS "delete own" policy + the x-owner
// header below mean a visitor can only delete their OWN comments.
const SUPABASE_URL = '';      // e.g. 'https://abcd1234.supabase.co'
const SUPABASE_ANON_KEY = ''; // your project's anon / public key
const REMOTE = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
const sbHeaders = (extra) => Object.assign({
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  'x-owner': GUEST_OWNER, // RLS uses this to allow deleting only your own rows
}, extra || {});

function loadLocal() {
  try { return JSON.parse(localStorage.getItem(GUEST_KEY)) || []; } catch { return []; }
}
function saveLocal(list) { localStorage.setItem(GUEST_KEY, JSON.stringify(list)); }

// Fetch the latest comments (newest first). Shared in remote mode; local otherwise.
async function fetchGuests() {
  if (!REMOTE) return loadLocal();
  const url = `${SUPABASE_URL}/rest/v1/guestbook?select=id,owner,name,msg,ts&order=ts.desc&limit=${MAX_GUESTS}`;
  const r = await fetch(url, { headers: sbHeaders() });
  if (!r.ok) throw new Error('load ' + r.status);
  return await r.json();
}

async function addGuest(entry) {
  if (!REMOTE) {
    const list = loadLocal();
    list.unshift(entry);
    if (list.length > MAX_GUESTS) list.length = MAX_GUESTS; // local-only display cap
    saveLocal(list);
    return;
  }
  const r = await fetch(`${SUPABASE_URL}/rest/v1/guestbook`, {
    method: 'POST',
    headers: sbHeaders({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
    // let the DB assign the id; only the latest MAX_GUESTS are ever shown
    body: JSON.stringify({ owner: entry.owner, name: entry.name, msg: entry.msg, ts: entry.ts }),
  });
  if (!r.ok) throw new Error('insert ' + r.status);
}

async function removeGuest(id) {
  if (!REMOTE) {
    saveLocal(loadLocal().filter((g) => String(g.id != null ? g.id : g.ts) !== String(id)));
    return;
  }
  // Scope the delete to your own rows; the RLS policy enforces this server-side too.
  const url = `${SUPABASE_URL}/rest/v1/guestbook?id=eq.${encodeURIComponent(id)}` +
    `&owner=eq.${encodeURIComponent(GUEST_OWNER)}`;
  const r = await fetch(url, { method: 'DELETE', headers: sbHeaders() });
  if (!r.ok) throw new Error('delete ' + r.status);
}

function fmtTime(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
    ' · ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

let guestRenderSeq = 0;
async function renderGuests() {
  const seq = ++guestRenderSeq; // ignore out-of-order async results
  let list;
  try { list = await fetchGuests(); }
  catch (e) { list = REMOTE ? [] : loadLocal(); }
  if (seq !== guestRenderSeq) return; // a newer render already ran
  guestList.innerHTML = '';
  if (!list.length) {
    const li = document.createElement('li');
    li.className = 'guest-empty';
    li.textContent = 'No calling cards yet. Be the first.';
    guestList.appendChild(li);
    return;
  }
  for (const g of list) {
    const li = document.createElement('li');
    li.className = 'guest-card';

    const head = document.createElement('div');
    head.className = 'guest-card-head';
    const name = document.createElement('span');
    name.className = 'guest-card-name';
    name.textContent = g.name || 'Anonymous';
    const time = document.createElement('span');
    time.className = 'guest-card-time';
    time.textContent = fmtTime(g.ts);
    const meta = document.createElement('span');
    meta.className = 'guest-card-meta';
    meta.append(time);
    // Delete control only on the visitor's OWN comments — not anyone else's.
    if (ownsGuest(g)) {
      const del = document.createElement('button');
      del.className = 'guest-del';
      del.type = 'button';
      del.textContent = '✕';
      del.setAttribute('aria-label', 'Delete your comment');
      del.addEventListener('click', () => deleteGuest(g.id != null ? g.id : g.ts, g.owner));
      meta.append(del);
    }
    head.append(name, meta);

    const msg = document.createElement('div');
    msg.className = 'guest-card-msg';
    msg.textContent = g.msg; // textContent => user input can't inject HTML

    li.append(head, msg);
    guestList.appendChild(li);
  }
}

async function deleteGuest(id, owner) {
  // Can only delete your own comment (UI hides the button on others'; this is a
  // second guard, and the server's RLS policy is the real enforcement).
  if (owner != null && owner !== GUEST_OWNER) return;
  try { await removeGuest(id); } catch (e) { return; }
  renderGuests();
}

if (guestForm) {
  guestForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = guestMsg.value.trim();
    if (!msg) return;
    const name = guestName.value.trim().slice(0, 40);
    // Block inappropriate content in either the name or the comment.
    if (hasInappropriate(msg) || hasInappropriate(name)) {
      showGuestError('Whoa — keep it clean. That one was blocked.');
      return;
    }
    clearGuestError();
    const id = (crypto.randomUUID && crypto.randomUUID()) || (Date.now() + '-' + Math.random());
    const entry = { id, owner: GUEST_OWNER, name, msg: msg.slice(0, 280), ts: Date.now() };
    try { await addGuest(entry); }
    catch (err) { showGuestError('Couldn’t send right now — try again.'); return; }
    guestMsg.value = '';
    renderGuests();
    guestMsg.focus();
  });
  // Clear the warning as soon as they start editing again.
  guestMsg.addEventListener('input', clearGuestError);
  guestName.addEventListener('input', clearGuestError);
  renderGuests();
}

// "Take Your Heart" calling-card logo (bottom-left). Clicking it fires the
// Minecraft explosion easter egg below.
const takeHeart = document.getElementById('take-heart');

// ---- Tap-to-start gate ----
// Idle: the red-stars loop plays with "Beneath the Mask" as BGM. On click: the
// green-screen "HOLD UP!" sting plays (with its own audio); midway through, the
// base menu slams in beneath it (the gate goes transparent so it shows through
// the green-keyed sting). The sting plays out fully, then the gate is removed
// and "Last Surprise" takes over as the menu BGM.
const startGate = document.getElementById('start-gate');
const startGateVideo = document.getElementById('start-gate-video');
const startGateSting = document.getElementById('start-gate-sting');
const STING_MID = 650; // ms — begin the menu transition mid-"HOLD UP!" sting
// Menu BGM: "Last Surprise" plays once on start, then "Beneath the Mask" takes
// over and loops for the rest of the session.
const bgm = new Audio('./assets/Last%20Surprise%20-%20Lyn.mp3');
bgm.preload = 'auto';
bgm.loop = false;        // plays through once
const BGM_FULL_VOL = 0.55;   // starting level for "Last Surprise"
const BGM_LOW_VOL = 0.16;    // ducked level it fades down to
bgm.volume = BGM_FULL_VOL;
// After 10s of play, fade "Last Surprise" down as a transition into the
// background. The fade itself runs smoothly over ~2.5s.
let bgmFadeTimer = null;
let bgmFadeRaf = null;
function fadeBgmDown() {
  if (bgmFadeRaf) cancelAnimationFrame(bgmFadeRaf);
  const from = bgm.volume;
  const dur = 2500; // ms
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / dur);
    bgm.volume = from + (BGM_LOW_VOL - from) * t;
    if (t < 1) bgmFadeRaf = requestAnimationFrame(step);
  };
  bgmFadeRaf = requestAnimationFrame(step);
}
function scheduleBgmFade() {
  if (bgmFadeTimer) clearTimeout(bgmFadeTimer);
  bgmFadeTimer = setTimeout(fadeBgmDown, 10000); // 10s after it starts
}
const maskBgm = new Audio('./assets/beneaththemask.mp3');
maskBgm.preload = 'auto';
maskBgm.loop = true;     // loops after Last Surprise finishes
maskBgm.volume = 0.5;
// When Last Surprise ends, start Beneath the Mask looping.
bgm.addEventListener('ended', () => {
  try { maskBgm.currentTime = 0; maskBgm.play().catch(() => {}); } catch (e) {}
});
let gateStarting = false;
let menuTransitioned = false;
let gateDismissed = false;

// Phase 1 (mid-sting): slam the menu in beneath the still-playing sting.
function beginMenuTransition() {
  if (menuTransitioned) return;
  menuTransitioned = true;
  startGate.classList.add('revealing'); // gate goes transparent; menu shows through
  playIntro();                          // base-menu intro (+ slap SFX)
}

// Phase 2 (sting finished): remove the gate, hand BGM to "Last Surprise".
function finalizeGate() {
  if (gateDismissed) return;
  gateDismissed = true;
  beginMenuTransition();             // ensure the menu is in
  startGate.classList.add('gone');
  setTimeout(() => {
    startGate.hidden = true;
    if (startGateVideo) startGateVideo.pause();
    if (startGateSting) startGateSting.pause();
  }, 300);
}

const STING_BLACK = 1000; // ms — the clip's banner ends and it cuts to black here

function startGo() {
  if (gateStarting) return;
  gateStarting = true;
  startGate.classList.add('starting');         // clear the prompt, reveal the sting
  try { bgm.currentTime = 0; bgm.volume = BGM_FULL_VOL; bgm.play().catch(() => {}); scheduleBgmFade(); } catch (e) {} // Last Surprise from the click, fades down after 10s
  if (startGateSting) {
    startGateSting.currentTime = 0;
    startGateSting.muted = false;              // play the sting's own audio
    startGateSting.volume = 1;
    startGateSting.play().catch(() => {});
    startGateSting.addEventListener('ended', finalizeGate, { once: true });
    // The clip cuts to black at the end — hide the video right before that (keep
    // it playing so the audio finishes), so the black frames never show.
    setTimeout(() => {
      startGateSting.style.transition = 'none';
      startGateSting.style.opacity = '0';
    }, STING_BLACK);
  }
  // Slam the menu in midway through the sting; the sting keeps playing out fully.
  setTimeout(beginMenuTransition, STING_MID);
  setTimeout(finalizeGate, 3000);              // safety if 'ended' never fires
}

if (startGate && startGateVideo) {
  startGateVideo.play().catch(() => {});
  startGate.addEventListener('click', startGo);
}

// ---- Minecraft TNT explosion easter egg ----
// Clicking the Arsène calling-card logo plays a full-screen TNT explosion
// (green keyed out via CSS) with its own audio, pausing the music while it runs
// and resuming it once the clip finishes.
const explosionFx = document.getElementById('explosion-fx');
let explosionBusy = false;
let explosionSafety = null;
function playExplosion() {
  // Hard guard against spamming: ignore clicks while one is already running.
  if (!explosionFx || explosionBusy) return;
  explosionBusy = true;
  const wasMask = !maskBgm.paused;
  const wasBgm = !bgm.paused;
  try { maskBgm.pause(); } catch (e) {}
  try { bgm.pause(); } catch (e) {}
  explosionFx.classList.add('show');
  explosionFx.currentTime = 0;
  explosionFx.muted = false;
  explosionFx.volume = 1;
  explosionFx.play().catch(() => {});
  // Single reset path, fired by whichever happens first: 'ended', 'error', or a
  // safety timer (so a missed 'ended' event can never leave the button stuck).
  const finish = () => {
    if (!explosionBusy) return;            // run once
    explosionFx.removeEventListener('ended', finish);
    explosionFx.removeEventListener('error', finish);
    clearTimeout(explosionSafety);
    explosionFx.classList.remove('show');
    explosionBusy = false;
    // resume whichever track was playing (Beneath the Mask loop, else Last Surprise)
    if (wasMask) { maskBgm.play().catch(() => {}); }
    else if (wasBgm) { bgm.play().catch(() => {}); }
  };
  explosionFx.addEventListener('ended', finish, { once: true });
  explosionFx.addEventListener('error', finish, { once: true });
  const ms = (Number.isFinite(explosionFx.duration) ? explosionFx.duration * 1000 : 6000) + 1500;
  explosionSafety = setTimeout(finish, ms);
}
if (takeHeart && explosionFx) {
  takeHeart.addEventListener('click', playExplosion);
}

// ---- Init ----
setActive(0);
