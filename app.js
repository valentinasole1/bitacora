const OL = 'https://openlibrary.org';
const $ = (sel, el = document) => el.querySelector(sel);

// ---------- almacenamiento local ----------

const load = (k, d) => {
  try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; }
  catch { return d; }
};
const persist = (k, v) => localStorage.setItem(k, JSON.stringify(v));

let reviews = load('brl.reviews', []);
let books = load('brl.books', []);     // {key,title,author,year,coverId,isbn13,isbn10,status,addedAt,startedAt,finishedAt}
let goal = load('brl.goal', 12);
let seenAch = load('brl.seenAch', []);

let currentBook = null;   // libro abierto en el detalle
let draftRating = 0;
let searchToken = 0;      // descarta respuestas viejas de búsquedas superpuestas

// migración: toda reseña previa implica un libro leído
reviews.forEach(r => {
  if (!books.find(b => b.key === r.key)) {
    books.push({
      key: r.key, title: r.title, author: r.author, year: r.year,
      coverId: r.coverId, isbn13: r.isbn13, isbn10: r.isbn10,
      status: 'read', addedAt: r.createdAt, finishedAt: r.createdAt,
    });
  }
});
persist('brl.books', books);

// ---------- juego: XP, niveles, logros ----------

const XP_BOOK = 100, XP_REVIEW = 25, XP_PUBLISH = 10, XP_PER_LEVEL = 300;

const LEVELS = [
  'Novice Reader', 'Bookmark', 'Page Devourer', 'Bookworm',
  'Collector of Worlds', 'Cult Critic', 'Legendary Librarian', 'Literary Legend',
];

const ACHIEVEMENTS = [
  { id: 'first-book', name: 'First Page', desc: 'Finish your first book', test: s => s.readAll >= 1 },
  { id: 'first-review', name: 'Literary Critic', desc: 'Write your first review', test: s => s.reviews >= 1 },
  { id: 'five-year', name: 'Marathoner', desc: 'Read 5 books in a year', test: s => s.readYear >= 5 },
  { id: 'ten-year', name: 'Walking Library', desc: 'Read 10 books in a year', test: s => s.readYear >= 10 },
  { id: 'goal', name: 'Goal Reached', desc: 'Hit your yearly goal', test: s => s.goal > 0 && s.readYear >= s.goal },
  { id: 'publish', name: 'Out in the World', desc: 'Publish a review on another site', test: s => s.published >= 1 },
  { id: 'streak3', name: 'On Fire', desc: 'Read 3 months in a row', test: s => s.streak >= 3 },
  { id: 'fivestar', name: 'Smitten', desc: 'Give a book 5 stars', test: s => s.fiveStars >= 1 },
  { id: 'tbr5', name: 'Dangerous Pile', desc: '5 books waiting in your pile', test: s => s.tbr >= 5 },
];

const ym = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

function monthStreak() {
  const months = new Set(books.filter(b => b.status === 'read' && b.finishedAt).map(b => ym(new Date(b.finishedAt))));
  const d = new Date();
  d.setDate(1);
  if (!months.has(ym(d))) d.setMonth(d.getMonth() - 1); // la racha sigue viva si este mes todavía no terminaste ninguno
  let streak = 0;
  while (months.has(ym(d))) { streak++; d.setMonth(d.getMonth() - 1); }
  return streak;
}

function computeStats() {
  const year = new Date().getFullYear();
  const read = books.filter(b => b.status === 'read');
  return {
    year,
    readAll: read.length,
    readYear: read.filter(b => b.finishedAt && new Date(b.finishedAt).getFullYear() === year).length,
    reading: books.filter(b => b.status === 'reading'),
    tbrList: books.filter(b => b.status === 'tbr'),
    tbr: books.filter(b => b.status === 'tbr').length,
    reviews: reviews.length,
    published: reviews.reduce((s, r) => s + (r.postedTo?.length || 0), 0),
    fiveStars: reviews.filter(r => r.rating === 5).length,
    streak: monthStreak(),
    goal,
  };
}

const xpTotal = s => s.readAll * XP_BOOK + s.reviews * XP_REVIEW + s.published * XP_PUBLISH;

function checkAchievements(silent = false) {
  const s = computeStats();
  const fresh = ACHIEVEMENTS.filter(a => a.test(s) && !seenAch.includes(a.id));
  if (!fresh.length) return;
  seenAch = [...new Set([...seenAch, ...fresh.map(a => a.id)])];
  persist('brl.seenAch', seenAch);
  if (!silent) {
    confetti();
    setTimeout(() => toast(`Achievement unlocked: ${fresh.map(a => a.name).join(' · ')}`), 1400);
  }
}

function confetti() {
  const colors = ['#b45309', '#fbbf24', '#9a3412', '#84cc16', '#0ea5e9', '#e879f9'];
  for (let i = 0; i < 36; i++) {
    const p = document.createElement('div');
    p.className = 'confetti-piece';
    p.style.left = Math.random() * 100 + 'vw';
    p.style.background = colors[i % colors.length];
    p.style.animationDuration = 1.4 + Math.random() * 1.2 + 's';
    p.style.animationDelay = Math.random() * 0.3 + 's';
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 3200);
  }
}

// ---------- sitios donde publicar (elegidos por tener página de reseña enlazable) ----------

const SITES = [
  {
    id: 'goodreads', name: 'Goodreads',
    url: b => b.isbn13
      ? `https://www.goodreads.com/book/isbn/${b.isbn13}`
      : `https://www.goodreads.com/search?q=${encodeURIComponent(searchTerm(b))}`,
  },
  {
    id: 'storygraph', name: 'The StoryGraph',
    url: b => `https://app.thestorygraph.com/browse?search_term=${encodeURIComponent(b.isbn13 || searchTerm(b))}`,
  },
  {
    id: 'amazon', name: 'Amazon',
    url: b => b.isbn10
      ? `https://www.amazon.com/review/create-review?asin=${b.isbn10}`
      : `https://www.amazon.com/s?k=${encodeURIComponent(searchTerm(b))}`,
  },
];

const READ_LINKS = b => [
  b.isbn13 && { name: 'Goodreads', url: `https://www.goodreads.com/book/isbn/${b.isbn13}` },
  { name: 'The StoryGraph', url: `https://app.thestorygraph.com/browse?search_term=${encodeURIComponent(b.isbn13 || searchTerm(b))}` },
  b.isbn10 && { name: 'Amazon', url: `https://www.amazon.com/dp/${b.isbn10}#customerReviews` },
  b.isbn13 && { name: 'LibraryThing', url: `https://www.librarything.com/isbn/${b.isbn13}` },
].filter(Boolean);

const searchTerm = b => `${b.title} ${b.author || ''}`.trim();

// ---------- helpers ----------

const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const stars = n => '★'.repeat(Math.round(n)) + '☆'.repeat(5 - Math.round(n));

const coverUrl = (id, size = 'M') => id ? `https://covers.openlibrary.org/b/id/${id}-${size}.jpg` : null;

function coverHtml(book, cls = 'cover') {
  const url = coverUrl(book.coverId);
  return url
    ? `<img class="${cls}" src="${url}" alt="" loading="lazy">`
    : `<div class="${cls} placeholder"></div>`;
}

function pickIsbns(arr = []) {
  return {
    isbn13: arr.find(i => /^97[89]\d{10}$/.test(i)) || null,
    isbn10: arr.find(i => /^\d{9}[\dX]$/i.test(i)) || null,
  };
}

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.hidden = true; }, 2600);
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

const fmtDate = iso => new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });

const bookFields = b => ({
  key: b.key, title: b.title, author: b.author, year: b.year,
  coverId: b.coverId, isbn13: b.isbn13, isbn10: b.isbn10,
});

// ---------- estado de lectura ----------

const getBook = key => books.find(b => b.key === key);

function setStatus(bookData, status) {
  let b = getBook(bookData.key);
  if (!status) {
    if (b) {
      books = books.filter(x => x.key !== bookData.key);
      persist('brl.books', books);
      toast('Removed from your board');
    }
    return;
  }
  if (!b) {
    b = { ...bookFields(bookData), addedAt: new Date().toISOString() };
    books.unshift(b);
  }
  const was = b.status;
  b.status = status;
  if (status === 'reading' && !b.startedAt) b.startedAt = new Date().toISOString();
  if (status === 'read') {
    if (!b.finishedAt) b.finishedAt = new Date().toISOString();
    if (was !== 'read') { confetti(); toast(`Book finished! +${XP_BOOK} XP`); }
  } else {
    delete b.finishedAt;
    if (status === 'tbr') toast('Added to up next');
    if (status === 'reading') toast('Happy reading!');
  }
  persist('brl.books', books);
  checkAchievements();
}

// ---------- tabs ----------

function showView(view) {
  $('#view-board').hidden = view !== 'board';
  $('#view-search').hidden = view !== 'search';
  $('#view-mine').hidden = view !== 'mine';
  $('#tab-board').classList.toggle('active', view === 'board');
  $('#tab-search').classList.toggle('active', view === 'search');
  $('#tab-mine').classList.toggle('active', view === 'mine');
  if (view === 'board') renderBoard();
  if (view === 'mine') renderMine();
}

$('#tab-board').onclick = () => showView('board');
$('#tab-search').onclick = () => showView('search');
$('#tab-mine').onclick = () => showView('mine');

// ---------- cartelera ----------

function renderBoard() {
  const s = computeStats();
  const xp = xpTotal(s);
  const level = Math.min(Math.floor(xp / XP_PER_LEVEL), LEVELS.length - 1);
  const levelXp = xp - level * XP_PER_LEVEL;
  const readThisYear = books.filter(b => b.status === 'read' && b.finishedAt && new Date(b.finishedAt).getFullYear() === s.year)
    .sort((a, b) => new Date(b.finishedAt) - new Date(a.finishedAt));

  // ritmo respecto a la meta
  const now = new Date();
  const dayOfYear = Math.floor((now - new Date(s.year, 0, 1)) / 86400000) + 1;
  const expected = goal * dayOfYear / 365;
  const diff = s.readYear - expected;
  let pace = '';
  if (s.readYear >= goal) pace = 'Goal reached!';
  else if (diff >= 1) pace = `${Math.floor(diff)} ${Math.floor(diff) === 1 ? 'book' : 'books'} ahead of pace`;
  else if (diff <= -1) pace = `${Math.ceil(-diff)} ${Math.ceil(-diff) === 1 ? 'book' : 'books'} behind pace`;
  else pace = 'right on pace';

  const board = $('#view-board');
  board.innerHTML = `
    <div class="tiles">
      <div class="tile">
        <div class="label">${s.year} goal</div>
        <div class="value"><span id="goal-value">${s.readYear} / ${goal}</span><button class="icon-btn" id="goal-edit" title="Change goal">✎</button></div>
        <div class="bar-outer"><div class="bar-inner" style="width:${Math.min(100, (s.readYear / goal) * 100)}%"></div></div>
        <div class="sub">${pace}</div>
      </div>
      <div class="tile">
        <div class="label">Level ${level + 1}</div>
        <div class="value">${LEVELS[level]}</div>
        <div class="bar-outer"><div class="bar-inner" style="width:${Math.min(100, (levelXp / XP_PER_LEVEL) * 100)}%"></div></div>
        <div class="sub">${xp} XP${level < LEVELS.length - 1 ? ` · ${XP_PER_LEVEL - levelXp} to level up` : ' · max level'}</div>
      </div>
      <div class="tile">
        <div class="label">Streak</div>
        <div class="value">${s.streak > 0 ? s.streak : '—'}</div>
        <div class="sub">${s.streak > 0 ? `${s.streak === 1 ? 'month' : 'months'} in a row reading` : 'finish a book this month to light it up'}</div>
      </div>
    </div>

    ${s.reading.length ? `
      <h3 class="section">Reading now</h3>
      ${s.reading.map(b => shelfCard(b, `
        <button class="ghost act-finish" data-key="${esc(b.key)}">Finished it</button>
        <button class="icon-btn act-remove" data-key="${esc(b.key)}" title="Remove">✕</button>`)).join('')}` : ''}

    ${s.tbrList.length ? `
      <h3 class="section">Up next · ${s.tbr}</h3>
      ${s.tbrList.map(b => shelfCard(b, `
        <button class="ghost act-start" data-key="${esc(b.key)}">Start</button>
        <button class="icon-btn act-remove" data-key="${esc(b.key)}" title="Remove">✕</button>`)).join('')}` : ''}

    <h3 class="section">Read in ${s.year} · ${s.readYear}</h3>
    ${readThisYear.length
      ? `<div class="cover-grid">${readThisYear.map(b =>
          `<button class="shelf-cover act-open" data-key="${esc(b.key)}" title="${esc(b.title)} · ${fmtDate(b.finishedAt)}">${coverHtml(b)}</button>`).join('')}</div>`
      : `<div class="status">Nothing yet this year. ${books.length === 0 ? '' : 'Go get that streak started!'}</div>`}
    ${s.readAll > s.readYear ? `<div class="source-note">+${s.readAll - s.readYear} from other years</div>` : ''}

    ${books.length === 0 ? `
      <div class="empty">
        Your board is empty.<br>Search for a book and add it as <b>up next</b>, <b>reading</b> or <b>read</b>.<br><br>
        <button class="primary" id="board-cta">Search for a book</button>
      </div>` : ''}

    <h3 class="section">Achievements · ${ACHIEVEMENTS.filter(a => a.test(s)).length}/${ACHIEVEMENTS.length}</h3>
    <div class="ach-grid">
      ${ACHIEVEMENTS.map(a => `
        <div class="ach ${a.test(s) ? '' : 'locked'}">
          <div><div class="name">${a.name}</div><div class="desc">${a.desc}</div></div>
        </div>`).join('')}
    </div>
  `;

  // bindings
  $('#goal-edit').onclick = () => {
    const span = $('#goal-value');
    span.innerHTML = `${computeStats().readYear} / <input class="goal-input" id="goal-input" type="number" min="1" max="999" value="${goal}">`;
    const inp = $('#goal-input');
    inp.focus(); inp.select();
    const commit = () => {
      const v = parseInt(inp.value, 10);
      if (v >= 1) { goal = v; persist('brl.goal', goal); checkAchievements(); }
      renderBoard();
    };
    inp.onblur = commit;
    inp.onkeydown = e => {
      if (e.key === 'Enter') inp.blur();
      if (e.key === 'Escape') { inp.onblur = null; renderBoard(); }
    };
  };

  const cta = $('#board-cta');
  if (cta) cta.onclick = () => { showView('search'); $('#search-input').focus(); };

  board.querySelectorAll('.act-finish').forEach(el => el.onclick = e => { e.stopPropagation(); setStatus(getBook(el.dataset.key), 'read'); renderBoard(); });
  board.querySelectorAll('.act-start').forEach(el => el.onclick = e => { e.stopPropagation(); setStatus(getBook(el.dataset.key), 'reading'); renderBoard(); });
  board.querySelectorAll('.act-remove').forEach(el => el.onclick = e => { e.stopPropagation(); setStatus(getBook(el.dataset.key), null); renderBoard(); });
  board.querySelectorAll('.act-open, .shelf-card .cover, .shelf-card .info').forEach(el => {
    el.onclick = el.onclick || (() => {
      const key = el.dataset.key || el.closest('.shelf-card')?.dataset.key;
      const b = getBook(key);
      if (b) { showView('search'); openBook(bookFields(b)); }
    });
  });
}

const shelfCard = (b, actions) => `
  <div class="shelf-card" data-key="${esc(b.key)}">
    ${coverHtml(b)}
    <div class="info">
      <div class="title">${esc(b.title)}</div>
      <div class="meta">${esc(b.author || '')}${b.startedAt && b.status === 'reading' ? ` · since ${fmtDate(b.startedAt)}` : ''}</div>
    </div>
    <div class="actions">${actions}</div>
  </div>`;

// ---------- búsqueda ----------

$('#search-form').onsubmit = e => { e.preventDefault(); search($('#search-input').value); };

let debounce;
$('#search-input').oninput = e => {
  clearTimeout(debounce);
  const q = e.target.value;
  debounce = setTimeout(() => search(q), 500);
};

async function search(q) {
  q = q.trim();
  $('#detail').hidden = true;
  $('#results').hidden = false;
  if (q.length < 2) { $('#results').innerHTML = ''; $('#status').textContent = ''; return; }

  const token = ++searchToken;
  $('#status').textContent = 'Searching…';
  try {
    const url = `${OL}/search.json?q=${encodeURIComponent(q)}&fields=key,title,author_name,first_publish_year,cover_i,isbn,ratings_average,ratings_count&limit=20`;
    const data = await fetch(url).then(r => r.json());
    if (token !== searchToken) return;

    if (!data.docs?.length) {
      $('#status').textContent = "Couldn't find anything with that name.";
      $('#results').innerHTML = '';
      return;
    }
    $('#status').textContent = `${data.numFound.toLocaleString('en-US')} results`;
    $('#results').innerHTML = data.docs.map((d, i) => {
      const rating = d.ratings_average
        ? ` · <span class="stars">${stars(d.ratings_average)}</span> ${d.ratings_average.toFixed(1)}`
        : '';
      return `<div class="result" data-i="${i}">
        ${coverHtml({ coverId: d.cover_i })}
        <div class="info">
          <div class="title">${esc(d.title)}</div>
          <div class="meta">${esc(d.author_name?.[0] || 'Unknown author')}${d.first_publish_year ? ` · ${d.first_publish_year}` : ''}${rating}</div>
        </div>
      </div>`;
    }).join('');

    document.querySelectorAll('.result').forEach(el => {
      el.onclick = () => {
        const d = data.docs[+el.dataset.i];
        const { isbn13, isbn10 } = pickIsbns(d.isbn);
        openBook({
          key: d.key,
          title: d.title,
          author: d.author_name?.[0] || null,
          year: d.first_publish_year || null,
          coverId: d.cover_i || null,
          isbn13, isbn10,
          olRating: d.ratings_average || null,
          olCount: d.ratings_count || null,
        });
      };
    });
  } catch {
    if (token === searchToken) $('#status').textContent = 'Search error — check your connection.';
  }
}

// ---------- detalle del libro ----------

async function openBook(book) {
  currentBook = book;
  $('#results').hidden = true;
  $('#status').textContent = '';
  const detail = $('#detail');
  detail.hidden = false;
  detail.innerHTML = `<button class="back">← Back</button><div class="status">Loading book…</div>`;
  $('.back', detail).onclick = closeDetail;

  const [work, ratings, gb] = await Promise.all([
    fetch(`${OL}${book.key}.json`).then(r => r.json()).catch(() => null),
    fetch(`${OL}${book.key}/ratings.json`).then(r => r.json()).catch(() => null),
    fetchGoogleBooks(book),
  ]);
  if (currentBook?.key !== book.key) return;

  let description = work?.description?.value || work?.description || gb?.description || null;
  if (typeof description !== 'string') description = null;

  renderDetail(book, description, ratings, gb);
}

function closeDetail() {
  currentBook = null;
  $('#detail').hidden = true;
  $('#results').hidden = false;
}

async function fetchGoogleBooks(book) {
  try {
    const q = book.isbn13 ? `isbn:${book.isbn13}` : `intitle:${book.title}${book.author ? `+inauthor:${book.author}` : ''}`;
    const data = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=1`).then(r => r.json());
    const v = data.items?.[0]?.volumeInfo;
    if (!v) return null;
    return { averageRating: v.averageRating || null, ratingsCount: v.ratingsCount || null, description: v.description || null };
  } catch { return null; }
}

function renderDetail(book, description, ratings, gb) {
  const detail = $('#detail');
  const avg = ratings?.summary?.average || book.olRating;
  const count = ratings?.summary?.count || book.olCount;

  let histogram = '';
  if (ratings?.counts && count > 0) {
    const max = Math.max(...Object.values(ratings.counts), 1);
    histogram = `<div class="histogram">` + [5, 4, 3, 2, 1].map(s => `
      <span class="label">${s}★</span>
      <span class="bar-track"><span class="bar" style="width:${(ratings.counts[s] / max) * 100}%"></span></span>
      <span class="num">${ratings.counts[s]}</span>`).join('') + `</div>`;
  }

  const gbLine = gb?.averageRating
    ? `<div class="source-note">Google Books: <span class="stars">${stars(gb.averageRating)}</span> ${gb.averageRating.toFixed(1)} (${gb.ratingsCount ?? '?'} ratings)</div>`
    : '';

  detail.innerHTML = `
    <button class="back">← Back</button>
    <div class="book-header">
      ${coverHtml(book)}
      <div>
        <h2>${esc(book.title)}</h2>
        <div class="author">${esc(book.author || 'Unknown author')}${book.year ? ` · ${book.year}` : ''}</div>
        ${avg ? `<div class="rating-line"><span class="stars">${stars(avg)}</span> ${avg.toFixed(1)} <span class="n">(${count ?? '?'} ratings on Open Library)</span></div>` : ''}
        <div class="status-row" id="status-row">
          <button data-s="tbr">Up next</button>
          <button data-s="reading">Reading</button>
          <button data-s="read">Read</button>
        </div>
        <div class="source-note" id="status-note"></div>
      </div>
    </div>

    ${description ? `
      <h3 class="section">About the book</h3>
      <p class="description clamped">${esc(description)}</p>
      <button class="more">more</button>` : ''}

    <h3 class="section">What people say</h3>
    ${histogram || `<div class="source-note">No ratings on Open Library yet.</div>`}
    ${gbLine}
    <div class="pills">
      ${READ_LINKS(book).map(l => `<a class="pill" href="${l.url}" target="_blank" rel="noopener">Reviews on ${l.name} ↗</a>`).join('')}
    </div>

    <h3 class="section">Your review</h3>
    <div id="my-review-area"></div>
  `;

  $('.back', detail).onclick = closeDetail;

  const moreBtn = $('.more', detail);
  if (moreBtn) {
    const p = $('.description', detail);
    moreBtn.onclick = () => {
      const clamped = p.classList.toggle('clamped');
      moreBtn.textContent = clamped ? 'more' : 'less';
    };
  }

  bindStatusRow(book);
  renderMyReviewArea(book);
}

function bindStatusRow(book) {
  const row = $('#status-row');
  if (!row) return;
  const entry = getBook(book.key);
  row.querySelectorAll('button').forEach(btn => {
    btn.classList.toggle('on', entry?.status === btn.dataset.s);
    btn.onclick = () => {
      setStatus(entry || book, entry?.status === btn.dataset.s ? null : btn.dataset.s);
      bindStatusRow(book);
    };
  });
  const note = $('#status-note');
  note.textContent = entry?.status === 'read' && entry.finishedAt ? `Finished on ${fmtDate(entry.finishedAt)}` : '';
}

// ---------- tu reseña ----------

const getReview = key => reviews.find(r => r.key === key);

function renderMyReviewArea(book, editing = false) {
  const area = $('#my-review-area');
  const existing = getReview(book.key);

  if (existing && !editing) {
    area.innerHTML = `
      <div class="my-review">
        <div class="head">
          <span class="stars" style="font-size:18px">${stars(existing.rating)}</span>
          <span class="date">${fmtDate(existing.updatedAt)}</span>
        </div>
        <div class="text">${esc(existing.text)}</div>
        <div class="publish-label">Publish on:</div>
        <div class="pills" id="publish-pills"></div>
        <div class="form-actions">
          <button class="ghost" id="edit-review">Edit</button>
          <button class="ghost danger" id="delete-review">Delete</button>
        </div>
      </div>`;
    renderPublishPills($('#publish-pills'), existing, book);
    $('#edit-review').onclick = () => renderMyReviewArea(book, true);
    $('#delete-review').onclick = () => {
      reviews = reviews.filter(r => r.key !== book.key);
      persist('brl.reviews', reviews);
      updateMineCount();
      renderMyReviewArea(book);
      toast('Review deleted');
    };
    return;
  }

  draftRating = existing?.rating || 0;
  area.innerHTML = `
    <div class="star-input" id="star-input">
      ${[1, 2, 3, 4, 5].map(n => `<button type="button" data-n="${n}">★</button>`).join('')}
    </div>
    <textarea id="review-text" placeholder="What did you think?">${esc(existing?.text || '')}</textarea>
    <div class="form-actions">
      <button class="primary" id="save-review">Save review</button>
      ${existing ? '<button class="ghost" id="cancel-edit">Cancel</button>' : ''}
    </div>`;

  const paint = () => document.querySelectorAll('#star-input button').forEach(b =>
    b.classList.toggle('on', +b.dataset.n <= draftRating));
  document.querySelectorAll('#star-input button').forEach(b => {
    b.onclick = () => { draftRating = +b.dataset.n; paint(); };
  });
  paint();

  if (existing) $('#cancel-edit').onclick = () => renderMyReviewArea(book);

  $('#save-review').onclick = () => {
    const text = $('#review-text').value.trim();
    if (!draftRating) { toast('Pick a rating (the stars)'); return; }
    if (!text) { toast('Write something about the book'); return; }
    const now = new Date().toISOString();
    if (existing) {
      Object.assign(existing, { rating: draftRating, text, updatedAt: now });
    } else {
      reviews.unshift({
        ...bookFields(book),
        rating: draftRating, text, createdAt: now, updatedAt: now, postedTo: [],
      });
    }
    persist('brl.reviews', reviews);

    // reseñar un libro implica haberlo leído → suma a la cartelera
    const entry = getBook(book.key);
    if (!entry) {
      books.unshift({ ...bookFields(book), status: 'read', addedAt: now, finishedAt: now });
      persist('brl.books', books);
      confetti();
    } else if (entry.status !== 'read') {
      entry.status = 'read';
      if (!entry.finishedAt) entry.finishedAt = now;
      persist('brl.books', books);
      confetti();
    }

    updateMineCount();
    renderMyReviewArea(book);
    bindStatusRow(book);
    toast(`Review saved +${XP_REVIEW} XP`);
    checkAchievements();
  };
}

function renderPublishPills(container, review, book) {
  container.innerHTML = '';
  SITES.forEach(site => {
    const posted = review.postedTo?.includes(site.id);
    const btn = document.createElement('button');
    btn.className = 'ghost';
    btn.textContent = posted ? `${site.name} ✓` : `${site.name} ↗`;
    btn.onclick = () => {
      // abrir primero (mantiene el gesto de usuario para el popup), copiar después
      window.open(site.url(book), '_blank', 'noopener');
      copyText(`${stars(review.rating)} (${review.rating}/5)\n\n${review.text}`);
      if (!review.postedTo) review.postedTo = [];
      if (!posted) review.postedTo.push(site.id);
      persist('brl.reviews', reviews);
      renderPublishPills(container, review, book);
      toast(`Review copied to clipboard — paste it on ${site.name}`);
      checkAchievements();
    };
    container.appendChild(btn);
  });
}

// ---------- mis reseñas ----------

function updateMineCount() {
  const el = $('#mine-count');
  el.hidden = reviews.length === 0;
  el.textContent = reviews.length;
}

function renderMine() {
  const list = $('#mine-list');
  const statsEl = $('#mine-stats');
  $('#export-json').hidden = $('#export-md').hidden = reviews.length === 0;

  if (!reviews.length) {
    statsEl.textContent = '';
    list.innerHTML = `<div class="empty">You haven't written any reviews yet.<br>Search for a book and say what you thought.</div>`;
    return;
  }

  const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
  statsEl.textContent = `${reviews.length} ${reviews.length === 1 ? 'review' : 'reviews'} · ${avg.toFixed(1)}★ average`;

  list.innerHTML = reviews.map((r, i) => `
    <div class="mine-item" data-i="${i}">
      ${coverHtml(r)}
      <div class="info">
        <div class="title">${esc(r.title)}</div>
        <div class="meta"><span class="stars">${stars(r.rating)}</span> · ${esc(r.author || '')} · ${fmtDate(r.updatedAt)}</div>
        <div class="snippet">${esc(r.text)}</div>
        <div class="badges">${(r.postedTo || []).map(id => {
          const s = SITES.find(s => s.id === id);
          return s ? `<span class="badge">${s.name} ✓</span>` : '';
        }).join('')}</div>
      </div>
    </div>`).join('');

  document.querySelectorAll('.mine-item').forEach(el => {
    el.onclick = () => {
      const r = reviews[+el.dataset.i];
      showView('search');
      openBook(bookFields(r));
    };
  });
}

$('#export-json').onclick = () => {
  const blob = new Blob([JSON.stringify({ reviews, books, goal }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'my-reading-log.json';
  a.click();
  URL.revokeObjectURL(a.href);
};

$('#export-md').onclick = async () => {
  const md = reviews.map(r =>
    `## ${r.title}${r.author ? ` — ${r.author}` : ''}\n${stars(r.rating)} (${r.rating}/5) · ${fmtDate(r.updatedAt)}\n\n${r.text}`
  ).join('\n\n---\n\n');
  await copyText(md);
  toast('Markdown copied to clipboard');
};

$('#import-json').onclick = () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json';
  input.onchange = async () => {
    try {
      const data = JSON.parse(await input.files[0].text());
      if (!Array.isArray(data.reviews) || !Array.isArray(data.books)) throw new Error();
      if (reviews.length && !confirm('This will replace your current reviews. Continue?')) return;
      persist('brl.reviews', data.reviews);
      persist('brl.books', data.books);
      persist('brl.goal', data.goal ?? goal);
      location.reload();
    } catch {
      toast("Couldn't read that file");
    }
  };
  input.click();
};

// ---------- init ----------

updateMineCount();
checkAchievements(true); // baseline silencioso: no festejar logros viejos al cargar
renderBoard();
