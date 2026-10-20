const sharp=require('/mnt/d/ClutchX3D/clutchx3d/node_modules/sharp');const fs=require('fs');const L='/mnt/d/ClutchX3D/logo/';
(async()=>{
  const svgs=fs.readdirSync(L+'svg').filter(f=>f.endsWith('.svg'));
  for(const f of svgs){ const base=f.replace('.svg','');
    for(const w of (base.includes('horizontal')?[800,1600,3200]:[256,512,1024])){
      await sharp(L+'svg/'+f,{density:1200}).resize({width:w}).png().toFile(`${L}png/${base}-${w}.png`);
    }}
  const icon=L+'svg/clutchx3d-app-icon.svg';
  const sizes={ 'favicon-16.png':16,'favicon-32.png':32,'favicon-48.png':48,'apple-touch-icon.png':180,'icon-192.png':192,'icon-512.png':512 };
  for(const [n,s] of Object.entries(sizes)) await sharp(icon,{density:600}).resize(s,s).png().toFile(L+'favicon/'+n);
  // ICO with embedded PNGs (16/32/48)
  const pngs=[16,32,48].map(s=>fs.readFileSync(L+`favicon/favicon-${s}.png`));
  const head=Buffer.alloc(6);head.writeUInt16LE(0,0);head.writeUInt16LE(1,2);head.writeUInt16LE(pngs.length,4);
  let off=6+16*pngs.length;const dir=[];
  pngs.forEach((p,i)=>{const s=[16,32,48][i];const e=Buffer.alloc(16);e[0]=s;e[1]=s;e.writeUInt16LE(1,4);e.writeUInt16LE(32,6);e.writeUInt32LE(p.length,8);e.writeUInt32LE(off,12);off+=p.length;dir.push(e)});
  fs.writeFileSync(L+'favicon/favicon.ico',Buffer.concat([head,...dir,...pngs]));
  fs.writeFileSync(L+'favicon/site.webmanifest',JSON.stringify({name:'ClutchX3D',short_name:'ClutchX3D',icons:[{src:'/icon-192.png',sizes:'192x192',type:'image/png'},{src:'/icon-512.png',sizes:'512x512',type:'image/png'}],theme_color:'#2B44E6',background_color:'#F3F5F7',display:'standalone'},null,2));
})();
