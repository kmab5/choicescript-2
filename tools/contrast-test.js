#!/usr/bin/env node
/* Verifies WCAG 2.1 AA contrast for every theme and brightness scope by
 * parsing the token values straight out of the stylesheets. */
'use strict';
const fs=require('fs'),path=require('path');
const web=path.join(__dirname,'..','web');
const css=fs.readFileSync(path.join(web,'theme','tokens.css'),'utf8')
        +fs.readFileSync(path.join(web,'theme','themes.css'),'utf8');

function lum(hex){
  const h=hex.replace('#','');
  const v=[0,2,4].map(i=>parseInt(h.substr(i,2),16)/255)
    .map(c=>c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4));
  return 0.2126*v[0]+0.7152*v[1]+0.0722*v[2];
}
const ratio=(a,b)=>{const l1=lum(a),l2=lum(b);
  return ((Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05));};

/* pull each selector block and its tokens */
const blocks={};
const re=/(body[^{]*)\{([^}]*)\}/g;let m;
while((m=re.exec(css))){
  const sel=m[1].trim(); const body=m[2];
  const t={};
  const tr=/--(cs-[\w-]+):\s*([^;]+);/g;let n;
  while((n=tr.exec(body))) t['--'+n[1]]=n[2].trim();
  if(Object.keys(t).length) blocks[sel]=Object.assign(blocks[sel]||{},t);
}

let pass=0,fail=0;
const base=blocks['body']||{};
for(const sel in blocks){
  const t=Object.assign({},base,blocks[sel]);
  const paper=t['--cs-paper'], raised=t['--cs-paper-raised'];
  if(!paper||!/^#/.test(paper)) continue;
  const checks=[
    ['ink on paper', t['--cs-ink'], paper, 4.5],
    ['muted ink on paper', t['--cs-ink-muted'], paper, 4.5],
    ['ink on raised', t['--cs-ink'], raised, 4.5],
    ['accent on paper (large)', t['--cs-accent'], paper, 3.0],
    ['accent-ink on accent', t['--cs-accent-ink'], t['--cs-accent'], 4.5],
  ];
  for(const [label,fg,bg,min] of checks){
    if(!fg||!bg||!/^#/.test(fg)||!/^#/.test(bg)) continue;
    const r=ratio(fg,bg);
    const good=r>=min;
    if(good)pass++;else fail++;
    if(!good) console.log('  FAIL '+sel+' :: '+label+'  '+r.toFixed(2)+':1 (need '+min+')');
  }
}
console.log('\n'+pass+' contrast checks passed, '+fail+' failed\n');
process.exit(fail?1:0);
