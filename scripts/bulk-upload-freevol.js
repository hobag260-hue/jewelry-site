const fs = require('fs');
const path = require('path');

const root = 'C:\\Users\\A\\Desktop\\악세올리기전\\프리볼 시리즈';
const uploadUrl = 'http://127.0.0.1:3000/admin/item';
const brand = '반클리프';
const categoryMap = [
  ['목걸이', '목걸이'],
  ['팔찌', '팔찌'],
  ['이어링', '귀걸이'],
  ['귀걸이', '귀걸이'],
  ['반지', '반지']
];

function inferCategory(title) {
  return (categoryMap.find(([key]) => title.includes(key)) || [null, '목걸이'])[1];
}

function mimeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}

async function uploadOne(dir) {
  const title = dir.name;
  const full = path.join(root, dir.name);
  const files = fs.readdirSync(full)
    .filter(name => /\.(jpe?g|png|webp)$/i.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

  if (!files.length) {
    console.log(`skip(no images): ${title}`);
    return;
  }

  const form = new FormData();
  form.append('title', title);
  form.append('category', inferCategory(title));
  form.append('brand', brand);
  form.append('description', '');

  const coverPath = path.join(full, files[0]);
  form.append('coverImage', new Blob([fs.readFileSync(coverPath)], { type: mimeFor(coverPath) }), path.basename(coverPath));

  for (const file of files.slice(1)) {
    const filePath = path.join(full, file);
    form.append('detailImages', new Blob([fs.readFileSync(filePath)], { type: mimeFor(filePath) }), path.basename(filePath));
  }

  const res = await fetch(uploadUrl, {
    method: 'POST',
    body: form,
    redirect: 'manual'
  });

  const location = res.headers.get('location') || '';
  console.log(`${title} => ${res.status} ${location}`);

  if (res.status < 200 || res.status >= 400) {
    const text = await res.text();
    throw new Error(`Upload failed for ${title}: ${res.status}\n${text}`);
  }
}

async function main() {
  const entries = fs.readdirSync(root, { withFileTypes: true }).filter(d => d.isDirectory());
  for (const dir of entries) {
    await uploadOne(dir);
  }
  console.log('DONE');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
