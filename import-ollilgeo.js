const fs = require('fs');
const path = require('path');

const siteDir = process.cwd();
const sourceDir = 'C:/Users/A/Desktop/올릴거';
const dataPath = path.join(siteDir, 'data', 'store.json');
const uploadDir = path.join(siteDir, 'public', 'uploads');
const backupPath = path.join(siteDir, 'data', `store.backup-before-import-${Date.now()}.json`);

const brands = ['반클리프','불가리','까르띠에','샤넬','디올','티파니','프레드','에르메스','루이비통','쇼메','부쉐론','크롬하츠','피아제','그라프'];
const categories = ['목걸이','팔찌','귀걸이','반지'];
const imageExts = new Set(['.jpg','.jpeg','.png','.webp','.gif','.avif']);

function walkImages(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walkImages(p));
    else if (ent.isFile() && imageExts.has(path.extname(ent.name).toLowerCase())) out.push(p);
  }
  return out.sort((a,b)=>a.localeCompare(b, 'ko'));
}

function detectCategory(name) {
  return categories.find(c => name.includes(c)) || null;
}
function detectBrand(name) {
  if (name.startsWith('비드 쇼메') || name.includes(' 쇼메 ')) return '쇼메';
  return brands.find(b => name.includes(b)) || null;
}
function safeExt(file) {
  const ext = path.extname(file).toLowerCase();
  return imageExts.has(ext) ? ext : '.jpg';
}
function copyToUploads(file) {
  const destName = `${Date.now()}-${Math.round(Math.random()*1e9)}${safeExt(file)}`;
  const dest = path.join(uploadDir, destName);
  fs.copyFileSync(file, dest);
  return `/public/uploads/${destName}`;
}

if (!fs.existsSync(sourceDir)) throw new Error(`Source folder not found: ${sourceDir}`);
fs.mkdirSync(uploadDir, { recursive: true });
const store = JSON.parse(fs.readFileSync(dataPath, 'utf8').replace(/^\uFEFF/, ''));
fs.copyFileSync(dataPath, backupPath);

store.categories = Array.isArray(store.categories) ? store.categories : categories.slice();
store.subcategories = store.subcategories && typeof store.subcategories === 'object' ? store.subcategories : {};
for (const c of categories) {
  if (!store.categories.includes(c)) store.categories.push(c);
  if (!Array.isArray(store.subcategories[c])) store.subcategories[c] = [];
}

const existingTitles = new Set((store.items || []).map(i => i.title));
const dirs = fs.readdirSync(sourceDir, { withFileTypes:true }).filter(d=>d.isDirectory());
const report = { added:0, skippedExisting:0, skippedNoImages:0, skippedUnknown:0, backupPath, unknown:[], noImages:[], existing:[] };

for (const dirent of dirs) {
  const title = dirent.name.trim();
  const full = path.join(sourceDir, dirent.name);
  if (existingTitles.has(title)) { report.skippedExisting++; report.existing.push(title); continue; }
  const category = detectCategory(title);
  const brand = detectBrand(title);
  if (!category || !brand) { report.skippedUnknown++; report.unknown.push({title, category, brand}); continue; }
  const images = walkImages(full);
  if (!images.length) { report.skippedNoImages++; report.noImages.push(title); continue; }

  if (!store.subcategories[category].includes(brand)) store.subcategories[category].push(brand);
  const uploaded = images.map(copyToUploads);
  store.items.unshift({
    id: `${Date.now()}${Math.floor(Math.random()*10000)}`,
    title,
    category,
    brand,
    description: '',
    coverImage: uploaded[0],
    image: uploaded[0],
    detailImages: uploaded.slice(1),
    sections: [],
    pinned: false,
    createdAt: new Date().toISOString()
  });
  existingTitles.add(title);
  report.added++;
}

fs.writeFileSync(dataPath, JSON.stringify(store, null, 2), 'utf8');
console.log(JSON.stringify(report, null, 2));
