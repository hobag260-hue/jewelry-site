const fs = require('fs');
const path = require('path');

const siteDir = process.cwd();
const sourceDir = 'C:/Users/A/Desktop/올릴거';
const dataPath = path.join(siteDir, 'data', 'store.json');
const uploadDir = path.join(siteDir, 'public', 'uploads');
const backupPath = path.join(siteDir, 'data', `store.backup-before-damour-${Date.now()}.json`);
const imageExts = new Set(['.jpg','.jpeg','.png','.webp','.gif','.avif']);
const titles = ['다무르 귀걸이 9캐럿', '다무르 목걸이 9캐럿'];

function walkImages(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walkImages(p));
    else if (ent.isFile() && imageExts.has(path.extname(ent.name).toLowerCase())) out.push(p);
  }
  return out.sort((a,b)=>a.localeCompare(b, 'ko'));
}
function categoryOf(title) {
  if (title.includes('귀걸이')) return '귀걸이';
  if (title.includes('목걸이')) return '목걸이';
  if (title.includes('팔찌')) return '팔찌';
  if (title.includes('반지')) return '반지';
  return null;
}
function copyToUploads(file) {
  const ext = path.extname(file).toLowerCase();
  const destName = `${Date.now()}-${Math.round(Math.random()*1e9)}${imageExts.has(ext) ? ext : '.jpg'}`;
  fs.copyFileSync(file, path.join(uploadDir, destName));
  return `/public/uploads/${destName}`;
}

const store = JSON.parse(fs.readFileSync(dataPath, 'utf8').replace(/^\uFEFF/, ''));
fs.copyFileSync(dataPath, backupPath);
store.items = Array.isArray(store.items) ? store.items : [];
store.subcategories = store.subcategories && typeof store.subcategories === 'object' ? store.subcategories : {};
const existing = new Set(store.items.map(i => i.title));
const report = { added: 0, skippedExisting: [], missingFolder: [], noImages: [], backupPath };

for (const title of titles) {
  if (existing.has(title)) { report.skippedExisting.push(title); continue; }
  const folder = path.join(sourceDir, title);
  if (!fs.existsSync(folder)) { report.missingFolder.push(title); continue; }
  const images = walkImages(folder);
  if (!images.length) { report.noImages.push(title); continue; }
  const category = categoryOf(title);
  const brand = '까르띠에';
  if (!Array.isArray(store.subcategories[category])) store.subcategories[category] = [];
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
  existing.add(title);
  report.added++;
}

fs.writeFileSync(dataPath, JSON.stringify(store, null, 2), 'utf8');
console.log(JSON.stringify(report, null, 2));
