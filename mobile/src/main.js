import './style.css';
import './trial.css';
import {createIcons, icons} from 'lucide';
import {Capacitor, registerPlugin} from '@capacitor/core';
import {Filesystem, Directory} from '@capacitor/filesystem';
import {Share} from '@capacitor/share';
import QRCode from 'qrcode';
import JSZip from 'jszip';
import * as pdfjs from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import engineWorker from './engine-worker.js?url';
import {tools, fields, parsePages} from './tools.js';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;
let selected = null, files = [], outputs = [], busy = false, worker = null, sequence = 0;
let pendingReject = null;
const app = document.querySelector('#app');
const SaveFile = registerPlugin('SaveFile');
const Trial = registerPlugin('Trial');
async function refreshAccess() {
  if(!Capacitor.isNativePlatform())return {active:true,remainingSeconds:86400};
  const access=await Trial.status();
  const label=document.querySelector('#trial-status');
  if(label)label.textContent=access.active?`Trial: ${Math.ceil(access.remainingSeconds/3600)} hours left`:'Trial ended';
  return access;
}
function showUnlock() {
  let dialog=document.querySelector('#unlock-dialog');
  if(!dialog){
    dialog=document.createElement('dialog');dialog.id='unlock-dialog';
    dialog.innerHTML=`<h2>Unlock RabPDF</h2><p>Your 24-hour free trial has ended.</p><p><strong>US$0.99</strong> one-time unlock. No subscription.</p><p>Checkout is not available in this preview release.</p><button class="primary" disabled>Payment setup pending</button><button class="quiet" id="close-unlock">Close</button>`;
    document.body.append(dialog);dialog.querySelector('#close-unlock').onclick=()=>dialog.close();
  }
  dialog.showModal();
}
const escape = value => String(value).replace(/[&<>"']/g, ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
function glyph(name) { return `<i data-lucide="${name}"></i>`; }
function render() {
  app.innerHTML = `<header><button class="brand" id="home"><img src="/brand/rabpdf_mascot_animated.gif" alt="Rabbit"><span>RabPDF</span></button><div class="header-actions"><button id="qr" class="quiet">${glyph('qr-code')}<span>Link to QR</span></button><span class="offline">${glyph('shield-check')}<span>Offline</span></span></div></header><main id="main"></main><footer><a href="https://nishanchettri.com" target="_blank" rel="noopener">Nishan Chettri</a><span> + ChatGPT 5.6 Sol Light</span><span class="version">Android preview 0.1.0</span></footer>`;
  document.querySelector('#home').onclick=()=>{if(!busy) {selected=null;files=[];outputs=[];render();}};
  document.querySelector('#qr').onclick=()=>{if(!busy) open('qr');};
  const main=document.querySelector('#main');
  if(!selected) {
    main.innerHTML='<h1>Your PDF workspace</h1>';
    for(const group of [...new Set(tools.map(t=>t[2]))]) {
      const section=document.createElement('section');
      section.innerHTML=`<h2>${group}</h2><div class="tool-grid">${tools.filter(t=>t[2]===group).map(t=>`<button class="tool" data-tool="${t[0]}">${glyph(t[3])}<span>${t[1]}</span>${glyph('chevron-right')}</button>`).join('')}</div>`;
      main.append(section);
    }
    main.querySelectorAll('[data-tool]').forEach(b=>b.onclick=()=>open(b.dataset.tool));
  } else {
    const meta=tools.find(t=>t[0]===selected);
    main.innerHTML=`<button id="back" class="back" aria-label="Back">${glyph('arrow-left')}</button><span class="category">${meta[2]}</span><h1>${meta[1]}</h1><form id="form" novalidate>${selected!=='qr'?`<section><div class="section-head"><h2>Files</h2><button type="button" id="add" class="quiet">${glyph('plus')}<span>${['merge','images_to_pdf'].includes(selected)?'Add files':'Choose file'}</span></button></div><input id="picker" type="file" hidden ${['merge','images_to_pdf'].includes(selected)?'multiple':''} accept="${selected==='images_to_pdf'?'image/png,image/jpeg,image/tiff,image/bmp':'.pdf,application/pdf'}"><ul id="file-list"></ul></section>`:''}<section class="options">${(fields[selected]||[]).map(([name,label,type,value])=>`<label>${label}${Array.isArray(type)?`<select name="${name}">${type.map(v=>`<option ${v===(value||type[0])?'selected':''}>${escape(v)}</option>`).join('')}</select>`:`<input name="${name}" type="${type}" value="${escape(value||'')}" ${type==='number'?'min="1" step="1"':''} autocomplete="off">`}</label>`).join('')}</section><button class="primary" id="run" type="submit">${glyph(selected==='qr'?'qr-code':'play')}<span>${selected==='qr'?'Generate QR':'Process files'}</span></button><button id="cancel" class="quiet" type="button" hidden>${glyph('x')}<span>Cancel</span></button><p id="status" role="status" aria-live="polite"></p></form><section id="results" hidden><h2>Results</h2><div id="result-list"></div><button id="save" class="primary">${glyph('share-2')}<span>Save or share</span></button></section>`;
    document.querySelector('#back').onclick=()=>{if(!busy){selected=null;files=[];outputs=[];render();}};
    const picker=document.querySelector('#picker');
    if(picker){
      document.querySelector('#add').onclick=()=>picker.click();
      picker.onchange=()=>{
        const newFiles=[...picker.files];
        if(['merge','images_to_pdf'].includes(selected)) files.push(...newFiles);
        else files=newFiles.slice(0,1);
        picker.value=''; updateFiles();
      };
      updateFiles();
    }
    document.querySelector('#form').onsubmit=run;
    document.querySelector('#save').onclick=()=>save('save');
    const shareButton=document.createElement('button');
    shareButton.className='quiet';shareButton.innerHTML=glyph('share-2')+'<span>Share</span>';
    shareButton.onclick=()=>save('share');document.querySelector('#results').append(shareButton);
    document.querySelector('#save span').textContent='Save file';
    document.querySelector('#cancel').onclick=()=>{
      worker?.terminate();worker=null;pendingReject?.(new Error('Operation cancelled.'));pendingReject=null;
    };
  }
  createIcons({icons});
  const trial=document.createElement('p');trial.id='trial-status';trial.className='trial-status';
  trial.textContent=Capacitor.isNativePlatform()?'24-hour free trial':'Browser preview';
  main.prepend(trial);
  refreshAccess().catch(()=>{trial.textContent='Unable to check trial access';});
}
function open(tool){selected=tool;files=[];outputs=[];render();}
function updateFiles(){
  const list=document.querySelector('#file-list');
  list.innerHTML=files.map((file,i)=>`<li><div>${glyph('file')}<span>${escape(file.name)}<small>${(file.size/1024/1024).toFixed(1)} MB</small></span></div><div class="file-actions">${['merge','images_to_pdf'].includes(selected)?`<button type="button" data-up="${i}" aria-label="Move up" ${i===0?'disabled':''}>${glyph('arrow-up')}</button><button type="button" data-down="${i}" aria-label="Move down" ${i===files.length-1?'disabled':''}>${glyph('arrow-down')}</button>`:''}<button type="button" data-remove="${i}" aria-label="Remove file">${glyph('x')}</button></div></li>`).join('');
  list.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{files.splice(Number(b.dataset.remove),1);updateFiles();});
  for(const [key,offset] of [['up',-1],['down',1]]) list.querySelectorAll(`[data-${key}]`).forEach(b=>b.onclick=()=>{const n=Number(b.dataset[key]);[files[n],files[n+offset]]=[files[n+offset],files[n]];updateFiles();});
  createIcons({icons});
}
function setBusy(value){
  busy=value;
  document.querySelectorAll('button,input,select').forEach(e=>e.disabled=value);
  const cancel=document.querySelector('#cancel');
  cancel.hidden=!value;cancel.disabled=false;
}
function status(message,error=false){const node=document.querySelector('#status');node.textContent=message;node.classList.toggle('error',error);}
async function run(event){
  event.preventDefault();
  try { if(!(await refreshAccess()).active){showUnlock();return;} }
  catch { status('Unable to check trial access. Restart the app.',true);return; }
  const settings=Object.fromEntries(new FormData(event.target));
  if(selected!=='qr' && !files.length){status('Choose an input file.',true);return;}
  if(files.reduce((sum,f)=>sum+f.size,0)>128*1024*1024){status('Choose files totalling less than 128 MB.',true);return;}
  setBusy(true);outputs=[];document.querySelector('#results').hidden=true;status('Processing on this device...');
  try {
    if(selected==='qr') {
      const link=settings.link.trim();
      let url;
      try{url=new URL(link);}catch{throw new Error('Enter a valid http:// or https:// web link.');}
      if(!['http:','https:'].includes(url.protocol)||!url.hostname||/\s/.test(link))throw new Error('Enter a valid http:// or https:// web link.');
      const canvas=document.createElement('canvas');
      await QRCode.toCanvas(canvas,link,{errorCorrectionLevel:'M',scale:{Small:6,Medium:10,Large:16}[settings.size],margin:settings.border==='Standard'?8:4});
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
      outputs=[{name:'rabpdf_qr.png',bytes:new Uint8Array(await blob.arrayBuffer())}];
    } else if(selected==='pdf_to_images') {
      outputs=await renderPages(files[0],settings);
    } else {
      const data=await processPython(settings);
      outputs=data.outputs;
    }
    status(`Done. ${outputs.length} file${outputs.length===1?'':'s'} ready.`);
    showResults();
  } catch(error){status(error.message||String(error),true);}
  finally{setBusy(false);}
}
async function processPython(settings){
  if(!worker) worker=new Worker(engineWorker);
  const input=await Promise.all(files.map(async f=>({name:f.name,bytes:await f.arrayBuffer()})));
  return new Promise((resolve,reject)=>{
    pendingReject=reject;
    const id=++sequence;
    worker.onmessage=({data})=>{if(data.id!==id)return;pendingReject=null;data.error?reject(new Error(data.error)):resolve(data);};
    worker.onerror=()=>{worker?.terminate();worker=null;pendingReject=null;reject(new Error('PDF engine could not start. Restart the app and try again.'));};
    worker.postMessage({id,tool:selected,files:input,settings},input.map(f=>f.bytes));
  });
}
async function renderPages(file,settings){
  const task=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),cMapUrl:'/pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:'/pdfjs/standard_fonts/',wasmUrl:'/pdfjs/wasm/',isEvalSupported:false});
  const pdf=await task.promise;
  const result=[];
  try{
    for(const index of parsePages(settings.pages,pdf.numPages)){
      const page=await pdf.getPage(index+1), viewport=page.getViewport({scale:Number(settings.dpi)/72});
      if(viewport.width*viewport.height>12000000)throw new Error('This page is too large at that resolution. Choose a lower resolution.');
      const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
      await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
      const type=settings.format==='JPG'?'image/jpeg':'image/png';
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,type,0.92));
      result.push({name:`page_${String(index+1).padStart(3,'0')}.${settings.format==='JPG'?'jpg':'png'}`,bytes:new Uint8Array(await blob.arrayBuffer())});
      canvas.width=0;canvas.height=0;page.cleanup();
      status(`Rendered ${result.length} page${result.length===1?'':'s'}...`);
    }
  }finally{await task.destroy();}
  return result;
}
let previewURL;
function showResults(){
  if(previewURL)URL.revokeObjectURL(previewURL);
  const list=document.querySelector('#result-list');
  list.innerHTML=outputs.map(o=>`<p>${escape(o.name)} <small>${Math.ceil(o.bytes.length/1024)} KB</small></p>`).join('');
  if(selected==='qr' && outputs[0]){
    previewURL=URL.createObjectURL(new Blob([outputs[0].bytes],{type:'image/png'}));
    const image=document.createElement('img');image.className='qr-preview';image.src=previewURL;image.alt='Generated QR code';list.prepend(image);
  }
  document.querySelector('#results').hidden=false;
}
async function save(action='save'){
  try{
    let name,bytes;
    if(outputs.length===1){({name,bytes}=outputs[0]);}
    else{const zip=new JSZip();outputs.forEach(o=>zip.file(o.name,o.bytes));bytes=await zip.generateAsync({type:'uint8array'});name=`rabpdf_${selected}.zip`;}
    if(Capacitor.isNativePlatform()){
      const path=`rabpdf/${Date.now()}_${name}`;
      let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
      const {uri}=await Filesystem.writeFile({path,data:btoa(binary),directory:Directory.Cache,recursive:true});
      if(action==='save'){
        const result=await SaveFile.export({source:uri,name,mimeType:name.endsWith('.pdf')?'application/pdf':name.endsWith('.png')?'image/png':name.endsWith('.txt')?'text/plain':'application/zip'});
        status(result.cancelled?'Save cancelled.':'File saved.');
      }else await Share.share({title:'RabPDF',files:[uri],dialogTitle:'Share'});
    }else{
      const url=URL.createObjectURL(new Blob([bytes]));const anchor=document.createElement('a');anchor.href=url;anchor.download=name;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
    }
  }catch(error){status(error.message||'Unable to save the file.',true);}
}
render();
