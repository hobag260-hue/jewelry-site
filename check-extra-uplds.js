const fs=require('fs');
const store=JSON.parse(fs.readFileSync('data/store.json','utf8'));
const titles=new Set((store.items||[]).map(i=>(i.title||'').trim()).filter(Boolean));
const u='C:/Users/A/Desktop/라이브/uplds';
const dirs=fs.readdirSync(u,{withFileTypes:true}).filter(e=>e.isDirectory()).map(e=>e.name.trim()).filter(Boolean);
const extra=dirs.filter(n=>!titles.has(n));
function walk(dir){let count=0; for(const e of fs.readdirSync(dir,{withFileTypes:true})){ const p=require('path').join(dir,e.name); if(e.isDirectory()) count+=walk(p); else count++; } return count;}
for(const n of extra){ const p=require('path').join(u,n); const st=fs.statSync(p); console.log(JSON.stringify({name:n,lastWriteTime:st.mtime.toISOString(),fileCount:walk(p)})); }
