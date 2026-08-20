#!/usr/bin/env node
/*
 * Renders a *stat_chart exercising all three row types the corpus uses
 * (percent, text, opposed_pair) and asserts the accessible meter output.
 */
const fs=require('fs'),path=require('path');
const {JSDOM}=require('/home/claude/node_modules/jsdom');
const web=path.join(__dirname,'..','web');
let pass=0,fail=0;
const ok=(n,c,e)=>{c?(pass++,console.log('  ok   '+n)):(fail++,console.log('  FAIL '+n+(e?'  -> '+e:'')));};

const dom=new JSDOM(`<!DOCTYPE html><html><body><div id="container1"><div id="main"></div></div></body></html>`,{runScripts:'outside-only',pretendToBeVisual:true});
const win=dom.window; win.requestAnimationFrame=f=>setTimeout(f,0);
const load=r=>win.eval(fs.readFileSync(path.join(web,r),'utf8'));
win.eval('var isWeb=true; var rootDir="";');
['util.js','vendor/preact-htm.umd.js','ui/bus.js','ui/stubs.js','ui/legacy.js','ui/bridge.js','ui/app.js','ui/shell.js','scene.js','navigator.js','ui/screens/stats.js'].forEach(load);

// a stat chart exercising all three row types the corpus uses
const scenes={
  startup:{crc:0,labels:{},lines:[
    '*create brawn 65','*create wounds "Bruised"','*create brutality 30',
    '*stat_chart','  text wounds Wounds','  percent brawn Brawn',
    '    Raw physical power','  opposed_pair brutality','    Brutality','    Finesse',
    '*finish']}
};
win.allScenes=scenes;
win.appMount();
win.stats={}; win.nav=new win.SceneNavigator(['startup']);
const s=new win.Scene('startup',win.stats,win.nav,{saveSlot:''});
win.bridgeAttachScene(s);
let err=null; try{s.execute();}catch(e){err=e;}
ok('stat_chart executed',!err,err&&err.message);

setTimeout(()=>{
  const d=win.document;
  const block=win.bus.blocks.find(b=>b.kind==='statchart');
  ok('statchart block pushed',!!block);
  if(block){
    ok('three rows parsed',block.rows.length===3,JSON.stringify(block.rows.map(r=>r.type)));
    ok('text row carries value',block.rows[0].type==='text'&&block.rows[0].value==='Bruised',JSON.stringify(block.rows[0]));
    ok('percent row numeric',block.rows[1].type==='percent'&&block.rows[1].value===65,JSON.stringify(block.rows[1]));
    ok('percent definition captured',block.rows[1].definition==='Raw physical power',JSON.stringify(block.rows[1].definition));
    ok('opposed pair has both labels',block.rows[2].label==='Brutality'&&block.rows[2].label2==='Finesse',JSON.stringify(block.rows[2]));
  }
  const meters=d.querySelectorAll('[role=meter]');
  ok('bars expose meter role',meters.length===2,meters.length+' meters');
  if(meters.length){
    ok('meter has accessible value',meters[0].getAttribute('aria-valuenow')==='65',meters[0].getAttribute('aria-valuenow'));
    ok('meter has min and max',meters[0].getAttribute('aria-valuemin')==='0'&&meters[0].getAttribute('aria-valuemax')==='100');
    ok('opposed meter has valuetext',/Brutality/.test(meters[1].getAttribute('aria-valuetext')||''),meters[1].getAttribute('aria-valuetext'));
    ok('fill width matches value',/width:\s*65%/.test(meters[0].querySelector('.cs-stat-fill').getAttribute('style')||''),meters[0].querySelector('.cs-stat-fill').getAttribute('style'));
  }
  ok('definitions rendered',d.querySelectorAll('.cs-stat-definition').length>=1);
  console.log('\n'+pass+' passed, '+fail+' failed\n');
  process.exit(fail?1:0);
},120);
