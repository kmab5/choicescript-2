#!/usr/bin/env node
/*
 * Runs every UI-producing command the fixture corpus uses through the real
 * engine and asserts the bridge produced the right bus state.
 */
'use strict';
const fs=require('fs'),path=require('path');
const {JSDOM}=require('/home/claude/node_modules/jsdom');
const web=path.join(__dirname,'..','web');
let pass=0,fail=0;
const ok=(n,c,e)=>{c?(pass++,console.log('  ok   '+n)):(fail++,console.log('  FAIL '+n+(e?'  -> '+e:'')));};

function run(lines, extraStartup) {
  const dom=new JSDOM(`<!DOCTYPE html><html><body><div id="container1"><h1 id="title"></h1><p id="author"></p><div id="main"></div></div></body></html>`,
    {runScripts:'outside-only',pretendToBeVisual:true});
  const win=dom.window;
  win.requestAnimationFrame=f=>setTimeout(f,0);
  win.scrollTo=()=>{};
  win.reportError=(e)=>{ win.__lastError=e; };
  const load=r=>win.eval(fs.readFileSync(path.join(web,r),'utf8'));
  win.eval('var isWeb=true; var rootDir="";');
  ['util.js','vendor/preact-htm.umd.js','ui/bus.js','ui/stubs.js','ui/legacy.js','ui/bridge.js',
   'ui/app.js','ui/shell.js','scene.js','navigator.js','ui/screens/stats.js',
   'ui/screens/achievements.js','ui/screens/saves.js','ui/screens/settings.js'].forEach(load);
  win.allScenes={startup:{crc:0,labels:{},lines:(extraStartup||[]).concat(lines)}};
  win.appMount();
  win.stats={}; win.nav=new win.SceneNavigator(['startup']);
  const s=new win.Scene('startup',win.stats,win.nav,{saveSlot:''});
  win.bridgeAttachScene(s);
  let err=null; try{s.execute();}catch(e){err=e;}
  return {win,err};
}

const cases=[
  ['*image', ['*image cover.png center'], r=>{
    const b=r.win.bus.blocks.find(x=>x.kind==='image');
    return b && b.source==='cover.png' && b.alignment==='center';
  }],
  ['*text_image alt text + invert', ['*text_image logo.png center A dragon'], r=>{
    const b=r.win.bus.blocks.find(x=>x.kind==='image');
    return b && /dragon/i.test(b.alt||'') && b.invert===true;
  }],
  ['*line_break emits <br>', ['Line one','*line_break','Line two'], r=>
    r.win.bus.blocks.some(x=>/<br>/.test(x.html||''))],
  ['*page_break', ['Hello','*page_break Continue'], r=>
    r.win.bus.pending && r.win.bus.pending.kind==='next' && r.win.bus.pending.name==='Continue'],
  ['*input_text', ['*create name ""','*input_text name'], r=>
    r.win.bus.pending && r.win.bus.pending.kind==='input' && !r.win.bus.pending.numeric],
  ['*input_number', ['*create age 0','*input_number age 1 100'], r=>
    r.win.bus.pending && r.win.bus.pending.kind==='input' && r.win.bus.pending.numeric],
  ['*achievement + *achieve', ['*achievement first visible 10 First Step','  Got going','  Get going','*achieve first','Done'],
    r=>r.win.nav.achieved && r.win.nav.achieved.first===true],
  ['*check_purchase unlocks', ['*check_purchase adfree','*if choice_purchased_adfree','  Owned','*finish'],
    r=>/Owned/.test(r.win.bus.blocks.map(b=>b.html||'').join(' '))],
  ['*ending', ['*ending'], r=>!r.err || !/undefined/.test(r.err.message)],
  ['*link', ['*link https://example.com Example'], r=>
    r.win.bus.blocks.some(x=>x.kind==='link'||/example/i.test(x.html||''))],
  ['*stat_chart', ['*create hp 40','*stat_chart','  percent hp Health'], r=>
    r.win.bus.blocks.some(x=>x.kind==='statchart')],
  ['*title / *author', ['*title The Deep','*author Ada'], r=>
    r.win.document.getElementById('title').textContent==='The Deep' &&
    /Ada/.test(r.win.document.getElementById('author').textContent)],
];

let i=0;
(function next(){
  if(i>=cases.length){
    console.log('\n'+pass+' passed, '+fail+' failed\n');
    return process.exit(fail?1:0);
  }
  const [name,lines,check]=cases[i++];
  let r;
  try{ r=run(lines); }catch(e){ ok(name,false,'setup: '+e.message); return next(); }
  setTimeout(()=>{
    let good=false,detail='';
    try{ good=check(r); }catch(e){ detail=e.message; }
    if(!good && r.err) detail=detail||r.err.message;
    ok(name,good,detail);
    next();
  },60);
})();
