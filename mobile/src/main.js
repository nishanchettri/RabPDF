import './style.css';
import {createIcons, icons} from 'lucide';
import {Capacitor, registerPlugin} from '@capacitor/core';
import {Filesystem, Directory} from '@capacitor/filesystem';
import {Share} from '@capacitor/share';
import QRCode from 'qrcode';
import JSZip from 'jszip';
import * as pdfjs from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import engineWorker from './engine-worker.js?url';
import aiWorkerURL from './ai-worker.js?url';
import {tools, fields, parsePages} from './tools.js';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;
let selected = null, files = [], outputs = [], busy = false, worker = null, sequence = 0;
let pendingReject = null;
let batchMode = false;
let aiWorker = null;
const app = document.querySelector('#app');
const SaveFile = registerPlugin('SaveFile');
const Ads = registerPlugin('Ads');
let adsReady = false;
function updateAds() {
  if(!adsReady)return;
  Ads.visibility({visible:!selected}).catch(()=>{});
}
async function initializeAds() {
  if(!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable('Ads'))return;
  try { await Ads.initialize(); adsReady=true; updateAds(); } catch { /* Ads never block tools. */ }
}
const escape = value => String(value).replace(/[&<>"']/g, ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
function glyph(name) { return `<i data-lucide="${name}"></i>`; }
function render() {
  app.innerHTML = `<header><button class="brand" id="home"><img src="/brand/rabpdf_mascot_animated.gif" alt="Rabbit"><span>RabPDF</span></button><div class="header-actions"><button id="qr" class="quiet">${glyph('qr-code')}<span>Link to QR</span></button><span class="offline">${glyph('shield-check')}<span>Offline</span></span></div></header><main id="main"></main><footer><a href="https://nishanchettri.com" target="_blank" rel="noopener">Nishan Chettri</a><span> + ChatGPT</span><span class="version">Android preview 0.2.0</span></footer>`;
  document.querySelector('#home').onclick=()=>{if(!busy) {selected=null;files=[];outputs=[];render();}};
  document.querySelector('#qr').onclick=()=>{if(!busy) open('qr');};
  const main=document.querySelector('#main');
  const navigation=document.createElement('nav');navigation.id='tool-navigation';navigation.hidden=true;
  navigation.innerHTML=['PDF tools','Image tools'].map(group=>`<details open><summary>${group}</summary>${tools.filter(t=>t[0]!=='qr' && t[0].startsWith('image_')===(group==='Image tools')).map(t=>`<button type="button" data-nav="${t[0]}">${glyph(t[3])}<span>${t[1]}</span></button>`).join('')}</details>`).join('');
  document.querySelector('header').after(navigation);
  navigation.querySelectorAll('[data-nav]').forEach(button=>button.onclick=()=>{if(!busy)open(button.dataset.nav);});
  const menu=document.createElement('button');menu.className='quiet';menu.setAttribute('aria-label','Tools menu');menu.setAttribute('aria-expanded','false');
  menu.innerHTML=glyph('panel-left');
  menu.onclick=()=>{navigation.hidden=!navigation.hidden;menu.setAttribute('aria-expanded',String(!navigation.hidden));};
  document.querySelector('.header-actions').prepend(menu);
  if(!selected) {
    main.innerHTML='<h1>Your PDF workspace</h1>';
    for(const group of ['PDF tools','Image tools']) {
      const section=document.createElement('section');
      section.innerHTML=`<details open><summary>${group}</summary><div class="tool-grid">${tools.filter(t=>t[0]!=='qr' && t[0].startsWith('image_')===(group==='Image tools')).map(t=>`<button class="tool" data-tool="${t[0]}">${glyph(t[3])}<span>${t[1]}</span>${glyph('chevron-right')}</button>`).join('')}</div></details>`;
      main.append(section);
    }
    main.querySelectorAll('[data-tool]').forEach(b=>b.onclick=()=>open(b.dataset.tool));
  } else {
    const meta=tools.find(t=>t[0]===selected);
    main.innerHTML=`<button id="back" class="back" aria-label="Back">${glyph('arrow-left')}</button><span class="category">${meta[2]}</span><h1>${meta[1]}</h1><form id="form" novalidate>${selected!=='qr'?`<section><div class="section-head"><h2>Files</h2><button type="button" id="add" class="quiet">${glyph('plus')}<span>${['merge','images_to_pdf'].includes(selected)?'Add files':'Choose file'}</span></button></div><input id="picker" type="file" hidden ${['merge','images_to_pdf'].includes(selected)?'multiple':''} accept="${selected==='images_to_pdf'?'image/png,image/jpeg,image/tiff,image/bmp':'.pdf,application/pdf'}"><ul id="file-list"></ul></section>`:''}<section class="options">${(fields[selected]||[]).map(([name,label,type,value])=>`<label>${label}${Array.isArray(type)?`<select name="${name}">${type.map(v=>`<option ${v===(value||type[0])?'selected':''}>${escape(v)}</option>`).join('')}</select>`:`<input name="${name}" type="${type}" value="${escape(value||'')}" ${type==='number'?'min="1" step="1"':''} autocomplete="off">`}</label>`).join('')}</section><button class="primary" id="run" type="submit">${glyph(selected==='qr'?'qr-code':'play')}<span>${selected==='qr'?'Generate QR':'Process files'}</span></button><button id="cancel" class="quiet" type="button" hidden>${glyph('x')}<span>Cancel</span></button><p id="status" role="status" aria-live="polite"></p></form><section id="results" hidden><h2>Results</h2><div id="result-list"></div><button id="save" class="primary">${glyph('share-2')}<span>Save or share</span></button></section>`;
    document.querySelector('#back').onclick=()=>{if(!busy){selected=null;files=[];outputs=[];render();}};
    const picker=document.querySelector('#picker');
    if(!['merge','images_to_pdf','qr'].includes(selected)) {
      const label=document.createElement('label');label.className='processing-mode';
      label.innerHTML='<span>Processing</span><select id="mode"><option>Single file</option><option>Batch</option></select>';
      document.querySelector('#form').prepend(label);
      label.querySelector('select').value=batchMode?'Batch':'Single file';
      label.querySelector('select').onchange=event=>{batchMode=event.target.value==='Batch';files=[];updateFiles();picker.multiple=batchMode;document.querySelector('#add span').textContent=batchMode?'Add files':'Choose file';};
      picker.multiple=batchMode;
    }
    if(selected.startsWith('image_'))picker.accept='image/png,image/jpeg,image/tiff,image/bmp,image/gif';
    if(picker){
      document.querySelector('#add').onclick=()=>picker.click();
      picker.onchange=()=>{
        const newFiles=[...picker.files];
        if(batchMode || ['merge','images_to_pdf'].includes(selected)) files.push(...newFiles);
        else files=newFiles.slice(0,1);
        picker.value=''; updateFiles();
      };
      updateFiles();
    }
    document.querySelector('#form').onsubmit=run;
    if(['compress','image_compress'].includes(selected)) {
      const estimate=document.createElement('button');estimate.type='button';estimate.className='quiet';
      estimate.innerHTML=glyph('scale')+'<span>Estimate size</span>';
      estimate.onclick=event=>run(event,true);document.querySelector('#run').after(estimate);
    }
    document.querySelector('#save').onclick=()=>save('save');
    const shareButton=document.createElement('button');
    shareButton.className='quiet';shareButton.innerHTML=glyph('share-2')+'<span>Share</span>';
    shareButton.onclick=()=>save('share');document.querySelector('#results').append(shareButton);
    document.querySelector('#save span').textContent='Save file';
    document.querySelector('#cancel').onclick=()=>{
      worker?.terminate();worker=null;pendingReject?.(new Error('Operation cancelled.'));pendingReject=null;
      aiWorker?.terminate();aiWorker=null;
    };
  }
  createIcons({icons});
  const footer=document.querySelector('footer');
  footer.querySelector('span').textContent=' + ChatGPT';
  footer.querySelector('.version').textContent='Android preview 0.3.0';
  updateAds();
}
function open(tool){selected=tool;files=[];outputs=[];batchMode=false;render();}
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
async function run(event,estimate=false){
  event.preventDefault();
  const settings=Object.fromEntries(new FormData(document.querySelector('#form')));
  settings.mode=batchMode?'Batch':'Single file';
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
    } else if(selected==='image_upscale' && settings.engine==='AI reconstruction') {
      outputs=[];
      for(const [index,file] of files.entries()) {
        const normalized=await processPython({...settings,format:'PNG',mode:'Single file'},[file],'image_convert');
        const png=await upscaleAI(new Blob([normalized.outputs[0].bytes],{type:'image/png'}),settings);
        const converted=await processPython(settings,[{name:'upscaled.png',arrayBuffer:()=>Promise.resolve(png.buffer)}],'image_convert');
        converted.outputs.forEach(o=>o.name=`${index+1}_upscaled.${settings.format.toLowerCase()}`);
        outputs.push(...converted.outputs);
      }
    } else if(selected==='pdf_to_images') {
      outputs=[];
      for(const [index,file] of files.entries()) {
        const images=await renderPages(file,settings);
        images.forEach(o=>{if(files.length>1)o.name=`${index+1}_${o.name}`;});outputs.push(...images);
      }
    } else {
      const data=await processPython(settings);
      outputs=data.outputs;
    }
    if(estimate) {
      const size=outputs.reduce((sum,o)=>sum+o.bytes.length,0);
      status(`Input: ${(files.reduce((sum,f)=>sum+f.size,0)/1024).toFixed(1)} KB\nEstimated output: ${(size/1024).toFixed(1)} KB\nPreview only; no output saved.`);
      outputs=[];
    } else {
      status(`Done. ${outputs.length} file${outputs.length===1?'':'s'} ready.`);
      showResults();
    }
  } catch(error){status(error.message||String(error),true);}
  finally{setBusy(false);}
}
async function upscaleAI(file,settings){
  const bitmap=await createImageBitmap(file);
  const width=bitmap.width,height=bitmap.height;
  if(width*height*9>12000000){bitmap.close();throw new Error('AI preview exceeds 12 million pixels. Use a smaller image.');}
  const source=document.createElement('canvas');source.width=width;source.height=height;
  const context=source.getContext('2d',{willReadFrequently:true});context.drawImage(bitmap,0,0);
  const pixels=context.getImageData(0,0,width,height).data;
  const luminance=await new Promise((resolve,reject)=>{
    pendingReject=reject;aiWorker=new Worker(aiWorkerURL);
    aiWorker.onmessage=({data})=>{if(data.progress)return;pendingReject=null;aiWorker.terminate();aiWorker=null;data.error?reject(new Error(data.error)):resolve(data.output);};
    aiWorker.onerror=()=>{aiWorker?.terminate();aiWorker=null;pendingReject=null;reject(new Error('AI image model could not start.'));};
    aiWorker.postMessage({width,height,pixels},[pixels.buffer]);
  });
  const canvas=document.createElement('canvas');canvas.width=width*3;canvas.height=height*3;
  const output=canvas.getContext('2d',{willReadFrequently:true});output.imageSmoothingEnabled=true;output.imageSmoothingQuality='high';output.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
  const rgba=output.getImageData(0,0,canvas.width,canvas.height);
  for(let i=0;i<luminance.length;i++){
    const j=i*4,delta=luminance[i]-(.299*rgba.data[j]+.587*rgba.data[j+1]+.114*rgba.data[j+2]);
    for(let c=0;c<3;c++)rgba.data[j+c]+=delta;
  }
  output.putImageData(rgba,0,0);
  const scale=parseInt(settings.scale);
  const resized=document.createElement('canvas');resized.width=width*scale;resized.height=height*scale;
  const resizedContext=resized.getContext('2d');resizedContext.imageSmoothingQuality='high';resizedContext.drawImage(canvas,0,0,resized.width,resized.height);
  const blob=await new Promise(resolve=>resized.toBlob(resolve,'image/png'));
  source.width=0;canvas.width=0;resized.width=0;
  return new Uint8Array(await blob.arrayBuffer());
}
async function processPython(settings,inputFiles=files,tool=selected){
  if(!worker) worker=new Worker(engineWorker);
  const input=await Promise.all(inputFiles.map(async f=>({name:f.name,bytes:await f.arrayBuffer()})));
  return new Promise((resolve,reject)=>{
    pendingReject=reject;
    const id=++sequence;
    worker.onmessage=({data})=>{if(data.id!==id)return;pendingReject=null;data.error?reject(new Error(data.error)):resolve(data);};
    worker.onerror=()=>{worker?.terminate();worker=null;pendingReject=null;reject(new Error('PDF engine could not start. Restart the app and try again.'));};
    worker.postMessage({id,tool,files:input,settings},input.map(f=>f.bytes));
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
        const mimeTypes={pdf:'application/pdf',png:'image/png',jpg:'image/jpeg',bmp:'image/bmp',tiff:'image/tiff',gif:'image/gif',txt:'text/plain',zip:'application/zip'};
        const result=await SaveFile.export({source:uri,name,mimeType:mimeTypes[name.split('.').pop().toLowerCase()]||'application/octet-stream'});
        status(result.cancelled?'Save cancelled.':'File saved.');
      }else await Share.share({title:'RabPDF',files:[uri],dialogTitle:'Share'});
    }else{
      const url=URL.createObjectURL(new Blob([bytes]));const anchor=document.createElement('a');anchor.href=url;anchor.download=name;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
    }
  }catch(error){status(error.message||'Unable to save the file.',true);}
}
render();
initializeAds();
