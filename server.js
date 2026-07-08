const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(__dirname, 'data', 'store.json');
const SEED_FILE = path.join(__dirname, 'seed-data', 'store.json');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const LEGACY_UPLOAD_DIR = path.join(PUBLIC_DIR, 'uploads');
const DEFAULT_CATEGORIES = ['목걸이', '팔찌', '귀걸이', '반지'];
const DEFAULT_BRANDS = ['반클리프', '불가리', '까르띠에', '샤넬', '디올', '티파니', '프레드', '에르메스', '루이비통', '쇼메', '부쉐론', '크롬하츠'];
const DEFAULT_SECTIONS = ['이벤트'];
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'lihuxing20';
const ADMIN_COOKIE_NAME = 'admin_auth';
const ADMIN_COOKIE_SECRET = process.env.ADMIN_COOKIE_SECRET || 'jewelry-admin-secret-change-me';
const BRAND_LOGOS = {
  '반클리프': '/public/logos/vancleef.svg',
  '불가리': '/public/logos/bulgari.svg',
  '까르띠에': '/public/logos/cartier.svg',
  '샤넬': '/public/logos/chanel.svg',
  '디올': '/public/logos/dior.svg',
  '티파니': '/public/logos/tiffany.svg',
  '프레드': '/public/logos/fred.svg',
  '에르메스': '/public/logos/hermes.svg',
  '루이비통': '/public/logos/louisvuitton.svg',
  '쇼메': '/public/logos/chaumet.svg',
  '부쉐론': '/public/logos/boucheron.svg',
  '크롬하츠': '/public/logos/chromehearts.svg'
};

function defaultSubcategories() {
  return Object.fromEntries(DEFAULT_CATEGORIES.map(category => [category, [...DEFAULT_BRANDS]]));
}

function createDefaultStore() {
  return {
    categories: [...DEFAULT_CATEGORIES],
    subcategories: defaultSubcategories(),
    items: []
  };
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

function loadSeedStore() {
  if (!fs.existsSync(SEED_FILE)) return null;
  try {
    return readJsonFile(SEED_FILE);
  } catch (_error) {
    return null;
  }
}

function shouldRestoreSeed(store) {
  const items = Array.isArray(store.items) ? store.items.length : 0;
  const banners = Array.isArray(store.banners) ? store.banners.length : 0;
  return items === 0 && banners === 0 && !store.liveLink;
}

function normalizeStore(store) {
  store.categories = Array.isArray(store.categories) && store.categories.length ? store.categories : [...DEFAULT_CATEGORIES];
  store.subcategories = store.subcategories && typeof store.subcategories === 'object' ? store.subcategories : {};
  store.liveLink = typeof store.liveLink === 'string' ? store.liveLink : '';

  for (const category of store.categories) {
    if (!Array.isArray(store.subcategories[category])) {
      store.subcategories[category] = [...DEFAULT_BRANDS];
    }
  }

  store.banners = Array.isArray(store.banners) ? store.banners : [];
  store.sections = Array.isArray(store.sections) && store.sections.length ? store.sections : [...DEFAULT_SECTIONS];
  store.items = Array.isArray(store.items) ? store.items : [];
  store.items = store.items.map(item => {
    const coverImage = item.coverImage || item.image || '';
    const detailImages = Array.isArray(item.detailImages) ? item.detailImages : [];
    const sections = Array.isArray(item.sections) ? item.sections : [];
    const pinned = Boolean(item.pinned);
    return { ...item, coverImage, detailImages, sections, pinned };
  });
  return store;
}

function ensureStore() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    const seedStore = loadSeedStore();
    const initialStore = seedStore && Array.isArray(seedStore.items) && seedStore.items.length
      ? seedStore
      : createDefaultStore();
    fs.writeFileSync(DATA_FILE, JSON.stringify(initialStore, null, 2));
  }
}

function loadStore() {
  ensureStore();
  let store;
  try {
    store = readJsonFile(DATA_FILE);
  } catch (_error) {
    const seedStore = loadSeedStore();
    store = seedStore || createDefaultStore();
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
  }
  const normalized = normalizeStore(store);
  if (shouldRestoreSeed(normalized)) {
    const seedStore = loadSeedStore();
    if (seedStore && Array.isArray(seedStore.items) && seedStore.items.length) {
      const restored = normalizeStore(seedStore);
      saveStore(restored);
      return restored;
    }
  }
  saveStore(normalized);
  return normalized;
}

function saveStore(store) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
}

function parseCookies(req) {
  const cookieHeader = req.headers.cookie || '';
  return Object.fromEntries(cookieHeader.split(';').map(part => part.trim()).filter(Boolean).map(part => {
    const index = part.indexOf('=');
    if (index < 0) return [part, ''];
    return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
  }));
}

function createAdminToken(password) {
  return crypto.createHmac('sha256', ADMIN_COOKIE_SECRET).update(password).digest('hex');
}

function isAdminAuthenticated(req) {
  const cookies = parseCookies(req);
  const token = cookies[ADMIN_COOKIE_NAME];
  if (!token) return false;
  const expected = createAdminToken(ADMIN_PASSWORD);
  const tokenBuffer = Buffer.from(token);
  const expectedBuffer = Buffer.from(expected);
  if (tokenBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(tokenBuffer, expectedBuffer);
}

function setAdminCookie(res) {
  const maxAge = 1000 * 60 * 60 * 24 * 7;
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${ADMIN_COOKIE_NAME}=${createAdminToken(ADMIN_PASSWORD)}; Max-Age=${Math.floor(maxAge / 1000)}; Path=/; HttpOnly; SameSite=Lax${secure}`);
}

function clearAdminCookie(res) {
  res.setHeader('Set-Cookie', `${ADMIN_COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`);
}

function getImageFileCandidates(imageUrl) {
  if (!imageUrl || typeof imageUrl !== 'string') return [];
  if (!imageUrl.startsWith('/public/uploads/')) {
    return [path.join(__dirname, imageUrl.replace('/public/', 'public/'))];
  }

  const fileName = path.basename(imageUrl);
  return [
    path.join(UPLOAD_DIR, fileName),
    path.join(LEGACY_UPLOAD_DIR, fileName)
  ];
}

function deleteImageFile(imageUrl) {
  for (const filePath of getImageFileCandidates(imageUrl)) {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return;
    }
  }
}

function seedUploadsFromLegacyDir() {
  if (!fs.existsSync(LEGACY_UPLOAD_DIR)) return;

  const volumeFiles = fs.readdirSync(UPLOAD_DIR);
  if (volumeFiles.length > 0) return;

  for (const entry of fs.readdirSync(LEGACY_UPLOAD_DIR, { withFileTypes: true })) {
    if (!entry.isFile()) continue;

    const sourcePath = path.join(LEGACY_UPLOAD_DIR, entry.name);
    const targetPath = path.join(UPLOAD_DIR, entry.name);
    if (!fs.existsSync(targetPath)) {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

function requireAdmin(req, res, next) {
  if (isAdminAuthenticated(req)) return next();
  const nextPath = req.originalUrl && req.originalUrl !== '/admin/login' ? req.originalUrl : '/admin';
  return res.redirect('/admin/login?next=' + encodeURIComponent(nextPath));
}

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(LEGACY_UPLOAD_DIR, { recursive: true });
seedUploadsFromLegacyDir();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  }
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('이미지 파일만 업로드할 수 있습니다.'));
    cb(null, true);
  },
  limits: { fileSize: 8 * 1024 * 1024 }
});

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use('/public/uploads', express.static(UPLOAD_DIR));
app.use('/public/uploads', express.static(LEGACY_UPLOAD_DIR));
app.use('/public', express.static(PUBLIC_DIR));

app.get('/', (req, res) => {
  const store = loadStore();
  const category = req.query.category || '전체';
  const brand = req.query.brand || '전체';
  const section = req.query.section || '전체';
  const q = String(req.query.q || '').trim();
  const query = q.toLowerCase();
  const perPage = 28;
  const requestedPage = Number.parseInt(req.query.page, 10) || 1;
  const matchesSearch = item => {
    const searchText = [item.title, item.category, item.brand, item.description, ...(item.sections || [])].filter(Boolean).join(' ').toLowerCase();
    return !query || searchText.includes(query);
  };
  const matchesSection = item => section === '전체' || (item.sections || []).includes(section);
  const filteredItems = store.items.filter(item => {
    const categoryMatches = category === '전체' || item.category === category;
    const brandMatches = brand === '전체' || item.brand === brand;
    return categoryMatches && brandMatches && matchesSection(item) && matchesSearch(item);
  }).sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)));

  const categoryCounts = Object.fromEntries([
    ['전체', store.items.filter(item => (brand === '전체' || item.brand === brand) && matchesSection(item) && matchesSearch(item)).length],
    ...store.categories.map(cat => [cat, store.items.filter(item => item.category === cat && (brand === '전체' || item.brand === brand) && matchesSection(item) && matchesSearch(item)).length])
  ]);

  const allBrandOptions = [...new Set(Object.values(store.subcategories).flat())];
  const brandCounts = Object.fromEntries([
    ['전체', store.items.filter(item => (category === '전체' || item.category === category) && matchesSection(item) && matchesSearch(item)).length],
    ...allBrandOptions.map(option => [option, store.items.filter(item => item.brand === option && (category === '전체' || item.category === category) && matchesSection(item) && matchesSearch(item)).length])
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / perPage));
  const page = Math.min(Math.max(requestedPage, 1), totalPages);
  const startIndex = (page - 1) * perPage;
  const items = filteredItems.slice(startIndex, startIndex + perPage);
  res.render('index', { store, items, category, brand, section, q, brandLogos: BRAND_LOGOS, page, totalPages, perPage, categoryCounts, brandCounts });
});

app.get('/item/:id', (req, res) => {
  const store = loadStore();
  const item = store.items.find(item => item.id === req.params.id);
  if (!item) return res.status(404).send('상품을 찾을 수 없습니다.');
  res.render('item', { item });
});

app.get('/notice', (_req, res) => {
  res.render('notice');
});

app.get('/company', (_req, res) => {
  res.render('company');
});

app.get('/admin/login', (req, res) => {
  if (isAdminAuthenticated(req)) {
    return res.redirect(req.query.next ? String(req.query.next) : '/admin');
  }
  res.render('login', { message: req.query.message || '', next: req.query.next || '/admin' });
});

app.post('/admin/login', (req, res) => {
  const password = String(req.body.password || '');
  const next = String(req.body.next || '/admin');
  if (password !== ADMIN_PASSWORD) {
    return res.redirect('/admin/login?message=' + encodeURIComponent('비밀번호가 올바르지 않습니다.') + '&next=' + encodeURIComponent(next));
  }
  setAdminCookie(res);
  res.redirect(next.startsWith('/admin') ? next : '/admin');
});

app.post('/admin/logout', (_req, res) => {
  clearAdminCookie(res);
  res.redirect('/admin/login?message=' + encodeURIComponent('로그아웃되었습니다.'));
});

app.get('/admin', requireAdmin, (req, res) => {
  const store = loadStore();
  const category = req.query.category || '전체';
  const brand = req.query.brand || '전체';
  const q = String(req.query.q || '').trim();
  const query = q.toLowerCase();
  const adminPerPage = 10;
  const requestedPage = Number.parseInt(req.query.page, 10) || 1;
  const filteredAdminItems = store.items.filter(item => {
    const categoryMatches = category === '전체' || item.category === category;
    const brandMatches = brand === '전체' || item.brand === brand;
    const searchText = [item.title, item.category, item.brand, item.description].filter(Boolean).join(' ').toLowerCase();
    const searchMatches = !query || searchText.includes(query);
    return categoryMatches && brandMatches && searchMatches;
  });
  const adminTotalPages = Math.max(1, Math.ceil(filteredAdminItems.length / adminPerPage));
  const adminPage = Math.min(Math.max(requestedPage, 1), adminTotalPages);
  const adminStartIndex = (adminPage - 1) * adminPerPage;
  const adminItems = filteredAdminItems.slice(adminStartIndex, adminStartIndex + adminPerPage);
  res.render('admin', {
    store,
    adminItems,
    category,
    brand,
    q,
    message: req.query.message || '',
    brandLogos: BRAND_LOGOS,
    adminPage,
    adminTotalPages,
    adminPerPage,
    adminTotalItems: filteredAdminItems.length
  });
});

app.post('/admin/category', requireAdmin, (req, res) => {
  const name = String(req.body.name || '').trim();
  const store = loadStore();
  if (name && !store.categories.includes(name)) {
    store.categories.push(name);
    store.subcategories[name] = [...DEFAULT_BRANDS];
    saveStore(store);
  }
  res.redirect('/admin?message=' + encodeURIComponent('카테고리가 저장되었습니다.'));
});

app.post('/admin/category/delete', requireAdmin, (req, res) => {
  const category = String(req.body.category || '').trim();
  const store = loadStore();

  if (!category || !store.categories.includes(category)) {
    return res.redirect('/admin?message=' + encodeURIComponent('삭제할 카테고리를 찾을 수 없습니다.'));
  }

  if (store.categories.length <= 1) {
    return res.redirect('/admin?message=' + encodeURIComponent('마지막 카테고리는 삭제할 수 없습니다.'));
  }

  if (store.items.some(item => item.category === category)) {
    return res.redirect('/admin?message=' + encodeURIComponent('상품에서 사용 중인 카테고리는 삭제할 수 없습니다.'));
  }

  store.categories = store.categories.filter(item => item !== category);
  delete store.subcategories[category];
  saveStore(store);
  return res.redirect('/admin?message=' + encodeURIComponent('카테고리가 삭제되었습니다.'));
});

app.post('/admin/banner', requireAdmin, upload.array('banners', 6), (req, res) => {
  const store = loadStore();
  const files = Array.isArray(req.files) ? req.files : [];
  if (files.length) {
    for (const banner of store.banners || []) {
      deleteImageFile(banner);
    }
    store.banners = files.slice(0, 6).map(file => `/public/uploads/${file.filename}`);
    saveStore(store);
  }
  res.redirect('/admin?message=' + encodeURIComponent('배너 이미지가 저장되었습니다.'));
});

app.post('/admin/subcategory', requireAdmin, (req, res) => {
  const category = String(req.body.category || '').trim();
  const brand = String(req.body.brand || '').trim();
  const store = loadStore();

  if (category && brand && store.categories.includes(category)) {
    store.subcategories[category] = store.subcategories[category] || [];
    if (!store.subcategories[category].includes(brand)) {
      store.subcategories[category].push(brand);
      saveStore(store);
    }
  }

  res.redirect('/admin?message=' + encodeURIComponent('브랜드가 저장되었습니다.'));
});

app.post('/admin/subcategory/delete', requireAdmin, (req, res) => {
  const category = String(req.body.category || '').trim();
  const brand = String(req.body.brand || '').trim();
  const store = loadStore();

  if (!category || !brand || !store.categories.includes(category)) {
    return res.redirect('/admin?message=' + encodeURIComponent('삭제할 브랜드 정보를 찾을 수 없습니다.'));
  }

  const brands = Array.isArray(store.subcategories[category]) ? store.subcategories[category] : [];
  if (!brands.includes(brand)) {
    return res.redirect('/admin?message=' + encodeURIComponent('삭제할 브랜드 정보를 찾을 수 없습니다.'));
  }

  if (store.items.some(item => item.category === category && item.brand === brand)) {
    return res.redirect('/admin?message=' + encodeURIComponent('해당 카테고리 상품에서 사용 중인 브랜드는 삭제할 수 없습니다.'));
  }

  store.subcategories[category] = brands.filter(item => item !== brand);
  saveStore(store);
  return res.redirect('/admin?message=' + encodeURIComponent('브랜드가 삭제되었습니다.'));
});

app.post('/admin/live-link', requireAdmin, (req, res) => {
  const liveLink = String(req.body.liveLink || '').trim();
  const store = loadStore();
  store.liveLink = liveLink;
  saveStore(store);
  res.redirect('/admin?message=' + encodeURIComponent('라이브 링크가 저장되었습니다.'));
});

app.get('/admin/edit/:id', requireAdmin, (req, res) => {
  const store = loadStore();
  const item = store.items.find(item => item.id === req.params.id);
  if (!item) return res.status(404).send('상품을 찾을 수 없습니다.');
  res.render('edit', { store, item, message: req.query.message || '' });
});

app.post('/admin/edit/:id', requireAdmin, upload.any(), (req, res) => {
  const store = loadStore();
  const item = store.items.find(item => item.id === req.params.id);
  if (!item) return res.status(404).send('상품을 찾을 수 없습니다.');

  item.title = String(req.body.title || '').trim();
  item.category = String(req.body.category || '').trim();
  item.brand = String(req.body.brand || '').trim();
  item.description = String(req.body.description || '').trim();
  item.sections = Array.isArray(req.body.sections) ? req.body.sections : (req.body.sections ? [req.body.sections] : []);
  item.pinned = req.body.pinned === 'on';

  const files = Array.isArray(req.files) ? req.files : [];
  const coverFile = files.find(file => file.fieldname === 'coverImage');
  const detailFiles = files.filter(file => file.fieldname === 'detailImages');

  if (coverFile) {
    const oldCover = item.coverImage || item.image;
    deleteImageFile(oldCover);
    item.coverImage = `/public/uploads/${coverFile.filename}`;
    item.image = item.coverImage;
  }

  if (detailFiles.length) {
    item.detailImages = [...(item.detailImages || []), ...detailFiles.map(file => `/public/uploads/${file.filename}`)];
  }

  saveStore(store);
  res.redirect('/admin?message=' + encodeURIComponent('상품이 수정되었습니다.') + '#uploaded-images');
});

app.post('/admin/edit/:id/move-detail', requireAdmin, (req, res) => {
  const store = loadStore();
  const item = store.items.find(item => item.id === req.params.id);
  const image = String(req.body.image || '').trim();
  const direction = String(req.body.direction || '').trim();

  if (item && image && Array.isArray(item.detailImages)) {
    const index = item.detailImages.indexOf(image);
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (index >= 0 && targetIndex >= 0 && targetIndex < item.detailImages.length) {
      [item.detailImages[index], item.detailImages[targetIndex]] = [item.detailImages[targetIndex], item.detailImages[index]];
      saveStore(store);
    }
  }

  res.redirect('/admin/edit/' + req.params.id + '?message=' + encodeURIComponent('상세 이미지 순서가 변경되었습니다.'));
});

app.post('/admin/edit/:id/delete-detail', requireAdmin, (req, res) => {
  const store = loadStore();
  const item = store.items.find(item => item.id === req.params.id);
  const image = String(req.body.image || '').trim();
  if (item && image) {
    item.detailImages = (item.detailImages || []).filter(detailImage => detailImage !== image);
    deleteImageFile(image);
    saveStore(store);
  }
  res.redirect('/admin/edit/' + req.params.id + '?message=' + encodeURIComponent('상세 이미지가 삭제되었습니다.'));
});

app.post('/admin/item', requireAdmin, upload.any(), (req, res) => {
  const store = loadStore();
  const title = String(req.body.title || '').trim();
  const category = String(req.body.category || '').trim();
  const brand = String(req.body.brand || '').trim();
  const description = String(req.body.description || '').trim();
  const sections = Array.isArray(req.body.sections) ? req.body.sections : (req.body.sections ? [req.body.sections] : []);
  const pinned = req.body.pinned === 'on';

  const files = Array.isArray(req.files) ? req.files : [];
  const coverFile = files.find(file => file.fieldname === 'coverImage') || files.find(file => file.fieldname === 'image') || files[0];
  const detailFiles = files.filter(file => file.fieldname === 'detailImages' && file !== coverFile);

  if (!title || !category || !brand || !coverFile) {
    return res.status(400).send('이름, 카테고리, 브랜드를 입력하고 대표 이미지를 업로드해 주세요.');
  }

  const coverImage = `/public/uploads/${coverFile.filename}`;
  const detailImages = detailFiles.map(file => `/public/uploads/${file.filename}`);

  store.items.unshift({
    id: Date.now().toString(),
    title,
    category,
    brand,
    description,
    coverImage,
    image: coverImage,
    detailImages,
    sections,
    pinned,
    createdAt: new Date().toISOString()
  });
  saveStore(store);
  res.redirect('/admin?message=' + encodeURIComponent('주얼리가 업로드되었습니다.'));
});

app.post('/admin/delete/:id', requireAdmin, (req, res) => {
  const store = loadStore();
  const item = store.items.find(i => i.id === req.params.id);
  store.items = store.items.filter(i => i.id !== req.params.id);
  saveStore(store);
  const imagesToDelete = [item?.coverImage || item?.image, ...(item?.detailImages || [])].filter(Boolean);
  for (const image of imagesToDelete) {
    deleteImageFile(image);
  }
  res.redirect('/admin?message=' + encodeURIComponent('삭제되었습니다.'));
});

app.listen(PORT, () => {
  console.log(`주얼리 쇼케이스 실행 중: http://localhost:${PORT}`);
});
