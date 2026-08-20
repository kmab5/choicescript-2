#!/usr/bin/env node
/*
 * Runs compile.js, then loads and plays the exported single-file game.
 * The export path is how ChoiceScript games get published, so a UI that only
 * works via serve.js fails the project's core constraint.
 */
const fs=require('fs');
const {JSDOM}=require('/home/claude/node_modules/jsdom');
const path=require('path'),cp=require('child_process');
const root=path.join(__dirname,'..');
cp.execFileSync('node',['compile.js'],{cwd:root,stdio:'pipe'});
const html=fs.readFileSync(path.join(root,'output.html'),'utf8');
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://example.com/'});
const win=dom.window;
win.addEventListener('error',e=>console.log('PAGE ERROR:',e.message));
setTimeout(()=>{
  const d=win.document;
  const text=d.getElementById('text');
  const chars=text?text.textContent.trim().length:0;
  console.log('prose chars rendered:',chars);
  console.log('title:',JSON.stringify((d.getElementById('title')||{}).textContent));
  const btn=d.querySelector('.cs-next button, .cs-choices-form button');
  console.log('interactive control present:',!!btn, btn?JSON.stringify(btn.textContent):'');
  console.log(chars>0&&!!btn ? 'EXPORT PLAYS: PASS' : 'EXPORT PLAYS: FAIL');
  process.exit(chars>0&&!!btn?0:1);
},1500);
