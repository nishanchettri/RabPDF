import {Capacitor, registerPlugin} from '@capacitor/core';
import {createIcons, Camera, Upload, ArrowLeft, ArrowUp, ArrowDown, RotateCw, Trash2, GripVertical, Undo2, Eraser, PenTool, Download, Share2, ExternalLink, Copy, Scissors, Check} from 'lucide';
import Sortable from 'sortablejs';
import jsQR from 'jsqr';
import {safeWebLink, splitBounds, signaturePlacement, scanPDF, reorderPDF, signPDF} from './studio-core.js';

const Scanner = registerPlugin('Scanner');
const SaveFile = registerPlugin('SaveFile');
const icons = {Camera, Upload, ArrowLeft, ArrowUp, ArrowDown, RotateCw, Trash2, GripVertical, Undo2, Eraser, PenTool, Download, Share2, ExternalLink, Copy, Scissors, Check};
const glyph = name => `<i data-lucide="${name}"></i>`;
const escape = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const iconButton = (id, icon, label) => `<button type="button" id="${id}" class="quiet" aria-label="${label}" title="${label}">${glyph(icon)}</button>`;
const blobOf = canvas => new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Unable to create image.')), 'image/jpeg', .94));

export function mountStudio(main, mode, host) {
  const titles = {scan_document:'Document scan', scan_id:'ID card scan', scan_book:'Book scan', scan_qr:'QR code scan', sign_pdf:'Sign PDF', reorder_pages:'Page reorder'};
  let disposed = false, working = false, pdfTask, sortable;
  const urls = new Set();
  const url = blob => { const value = URL.createObjectURL(blob); urls.add(value); return value; };
  const revoke = value => { if (value) { URL.revokeObjectURL(value); urls.delete(value); } };
  const refreshIcons = () => {createIcons({icons});main.querySelectorAll('button[aria-label]').forEach(button=>button.title=button.getAttribute('aria-label'));};
  main.innerHTML = `<button id="back" class="back" title="Back" aria-label="Back">${glyph('arrow-left')}</button><span class="category">${mode.startsWith('scan_')?'Scan tools':'PDF tools'}</span><h1>${titles[mode]}</h1><div id="studio"></div><p id="status" role="status" aria-live="polite"></p><section id="results" hidden><h2>Results</h2><div id="result-list"></div><button id="save" class="primary">${glyph('download')}<span>Save file</span></button><button id="share" class="quiet">${glyph('share-2')}<span>Share</span></button></section>`;
  const studio = main.querySelector('#studio');
  const note = (text, error = false) => { if (disposed) return; const node = main.querySelector('#status'); node.textContent = text; node.classList.toggle('error', error); };
  const invalidate = () => { main.querySelector('#results').hidden = true; host.clearOutputs(); note(''); };
  const action = async fn => {
    if (working || disposed) return;
    working = true; host.lock(true); sortable?.option('disabled',true);
    try { await fn(); } catch (error) { note(error.message || String(error), true); }
    finally { working = false; if (!disposed) {host.lock(false);sortable?.option('disabled',false);} }
  };
  const finish = (bytes, name) => { host.finish([{name, bytes}]); note('PDF ready. Choose Save file to select its destination.'); };
  main.querySelector('#back').onclick = host.back;
  main.querySelector('#save').onclick = () => host.save('save');
  main.querySelector('#share').onclick = () => host.save('share');

  async function loadPDF(file) {
    if (file.size > 80 * 1024 * 1024) throw new Error('Choose a PDF smaller than 80 MB.');
    const bytes = new Uint8Array(await file.arrayBuffer());
    pdfTask = host.pdfjs.getDocument({data: bytes.slice(), isEvalSupported:false, cMapUrl:'/pdfjs/cmaps/', cMapPacked:true, standardFontDataUrl:'/pdfjs/standard_fonts/', wasmUrl:'/pdfjs/wasm/'});
    const pdf = await pdfTask.promise;
    if (pdf.numPages > 200) throw new Error('This editor supports up to 200 pages. Split larger PDFs first.');
    return {pdf, bytes};
  }
  async function renderPage(pdf, index, maxWidth = 700) {
    const page = await pdf.getPage(index + 1);
    const initial = page.getViewport({scale:1});
    const viewport = page.getViewport({scale: Math.min(maxWidth / initial.width, 1000 / initial.height)});
    const canvas = document.createElement('canvas'); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
    await page.render({canvasContext:canvas.getContext('2d'), viewport}).promise;
    page.cleanup(); return {canvas, viewport};
  }

  if (mode === 'scan_qr') {
    studio.innerHTML = `<div class="studio-actions"><button id="capture" class="primary">${glyph('camera')}<span>Scan QR</span></button><button id="import" class="quiet">${glyph('upload')}<span>Import image</span></button></div><input id="picker" type="file" accept="image/png,image/jpeg" hidden><section id="qr-content" hidden><h2>Scanned contents</h2><pre id="qr-text"></pre><div class="studio-actions"><button id="copy-qr" class="quiet">${glyph('copy')}<span>Copy</span></button><button id="open-qr" class="quiet" hidden>${glyph('external-link')}<span>Open link</span></button></div></section>`;
    let text = '';
    const showCode = value => {
      if (!value) throw new Error('No QR code found. Try a clearer image.');
      text = value; studio.querySelector('#qr-text').textContent = text;
      studio.querySelector('#qr-content').hidden = false;
      studio.querySelector('#open-qr').hidden = !safeWebLink(text); note('QR contents ready.');
    };
    studio.querySelector('#capture').onclick = () => action(async () => {
      if (!Capacitor.isNativePlatform()) throw new Error('Camera scanning is available in the Android app. Import an image in this preview.');
      const result = await Scanner.qr(); if (!result.cancelled) showCode(result.text);
    });
    studio.querySelector('#import').onclick = () => studio.querySelector('#picker').click();
    studio.querySelector('#picker').onchange = event => action(async () => {
      const file = event.target.files[0]; event.target.value = ''; if (!file) return;
      text='';studio.querySelector('#qr-content').hidden=true;
      const bitmap = await createImageBitmap(file); const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas'); canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
      const context = canvas.getContext('2d', {willReadFrequently:true}); context.drawImage(bitmap,0,0,canvas.width,canvas.height); bitmap.close();
      const pixels = context.getImageData(0,0,canvas.width,canvas.height); const code = jsQR(pixels.data,pixels.width,pixels.height,{inversionAttempts:'attemptBoth'});
      showCode(code?.data);
    });
    studio.querySelector('#copy-qr').onclick = () => action(async () => { await navigator.clipboard.writeText(text); note('Copied.'); });
    studio.querySelector('#open-qr').onclick = () => action(async () => {
      const link = safeWebLink(text); if (!link) throw new Error('Only HTTP or HTTPS links can be opened.');
      if (Capacitor.isNativePlatform()) await SaveFile.openLink({url:link}); else window.open(link,'_blank','noopener,noreferrer');
    });
  } else if (mode === 'reorder_pages') {
    studio.innerHTML = `<button id="import" class="quiet">${glyph('upload')}<span>Choose PDF</span></button><input id="picker" type="file" accept="application/pdf" hidden><div class="studio-actions">${iconButton('undo','undo-2','Undo page change')}</div><div id="pages" class="page-grid"></div><button id="export" class="primary">${glyph('check')}<span>Apply page changes</span></button>`;
    let bytes, order = [], history = [], thumbnails = [];
    const snapshot = () => history.push(order.map(item => ({...item})));
    const draw = () => {
      studio.querySelector('#pages').innerHTML = order.map((item, position) => `<article class="page-tile" data-id="${item.index}"><div class="page-preview"><img src="${thumbnails[item.index]}" alt="Page ${item.index+1}" style="transform:rotate(${item.rotation}deg)"></div><div class="page-caption"><span>Page ${item.index+1}</span><button class="quiet drag-handle" aria-label="Drag page ${item.index+1}" title="Drag page">${glyph('grip-vertical')}</button></div><div class="page-actions"><button data-move="${position}" data-offset="-1" aria-label="Move page ${item.index+1} up" ${position===0?'disabled':''}>${glyph('arrow-up')}</button><button data-move="${position}" data-offset="1" aria-label="Move page ${item.index+1} down" ${position===order.length-1?'disabled':''}>${glyph('arrow-down')}</button><button data-rotate="${position}" aria-label="Rotate page ${item.index+1}">${glyph('rotate-cw')}</button><button data-delete="${position}" aria-label="Delete page ${item.index+1}">${glyph('trash-2')}</button></div></article>`).join('');
      refreshIcons(); sortable?.destroy();
      sortable = Sortable.create(studio.querySelector('#pages'), {animation:120, handle:'.drag-handle', draggable:'.page-tile', forceFallback:true, fallbackTolerance:4, delay:120, delayOnTouchOnly:true,
        onEnd: event => { if(event.oldIndex===event.newIndex)return; snapshot(); order.splice(event.newIndex,0,order.splice(event.oldIndex,1)[0]); invalidate(); draw(); }});
      studio.querySelectorAll('[data-move]').forEach(button => button.onclick = () => {snapshot(); const position=Number(button.dataset.move); const target=position+Number(button.dataset.offset); [order[position],order[target]]=[order[target],order[position]]; invalidate(); draw();});
      studio.querySelectorAll('[data-rotate]').forEach(button => button.onclick = () => {snapshot(); order[Number(button.dataset.rotate)].rotation=(order[Number(button.dataset.rotate)].rotation+90)%360; invalidate(); draw();});
      studio.querySelectorAll('[data-delete]').forEach(button => button.onclick = () => {if(order.length===1){note('Keep at least one page.',true);return;}snapshot();order.splice(Number(button.dataset.delete),1);invalidate();draw();});
    };
    studio.querySelector('#import').onclick = () => studio.querySelector('#picker').click();
    studio.querySelector('#picker').onchange = event => action(async () => {
      const file=event.target.files[0];event.target.value='';if(!file)return;
      invalidate(); bytes=null; order=[]; await pdfTask?.destroy(); thumbnails.forEach(revoke); thumbnails=[];
      const loaded=await loadPDF(file);bytes=loaded.bytes;order=[];history=[];
      studio.querySelector('#source-name').textContent=file.name;
      for(let index=0;index<loaded.pdf.numPages;index++){
        const {canvas}=await renderPage(loaded.pdf,index,160);thumbnails.push(url(await blobOf(canvas)));canvas.width=0;order.push({index,rotation:0});note(`Preparing page ${index+1} of ${loaded.pdf.numPages}...`);
      }
      draw(); note(`${order.length} pages ready.`);
    });
    studio.querySelector('#undo').onclick = () => {if(history.length){order=history.pop();invalidate();draw();}};
    studio.querySelector('#export').onclick = () => action(async () => {if(!bytes)throw new Error('Choose a PDF first.');finish(await reorderPDF(bytes,order),'rabpdf_reordered.pdf');});
  } else if (mode === 'sign_pdf') {
    studio.innerHTML = `<div class="studio-actions"><button id="import" class="quiet">${glyph('upload')}<span>Choose PDF</span></button><input id="picker" type="file" accept="application/pdf" hidden></div><label>Page<select id="page"><option value="0">1</option></select></label><section><div class="section-head"><h2>Visual signature</h2><div>${iconButton('undo-sign','undo-2','Undo stroke')}${iconButton('clear-sign','eraser','Clear signature')}</div></div><canvas id="signature-pad" width="600" height="180" aria-label="Draw signature"></canvas><div class="studio-actions"><button id="import-sign" class="quiet">${glyph('upload')}<span>Import signature</span></button><input id="signature-picker" type="file" accept="image/png,image/jpeg" hidden><button class="ink-swatch" data-ink="#17243a" aria-label="Black ink" aria-pressed="true"></button><button class="ink-swatch blue" data-ink="#246fd6" aria-label="Blue ink" aria-pressed="false"></button></div></section><label>Signature size<input id="size" type="range" min="10" max="55" value="30"></label><div id="signature-page" class="signature-stage"><canvas id="pdf-preview"></canvas><img id="signature-overlay" alt="Signature placement" hidden draggable="false"></div><button id="export" class="primary">${glyph('pen-tool')}<span>Apply signature</span></button>`;
    let bytes, pdf, viewport, signatureURL, signatureBytes, signatureAspect=.3, imported=false, ink='#17243a', strokes=[], activeStroke;
    let box={x:.1,y:.72,width:.3,height:.09};
    const pad=studio.querySelector('#signature-pad'), context=pad.getContext('2d');
    const fitSignature=()=>{box.width=Number(studio.querySelector('#size').value)/100;box.height=box.width*signatureAspect*(viewport?viewport.width/viewport.height:1);if(box.height>.8){box.width*=.8/box.height;box.height=.8;}box.x=Math.max(0,Math.min(box.x,1-box.width));box.y=Math.max(0,Math.min(box.y,1-box.height));};
    const redraw=()=>{context.clearRect(0,0,pad.width,pad.height);context.lineWidth=3;context.lineCap='round';context.lineJoin='round';for(const stroke of strokes){context.strokeStyle=stroke.ink;context.beginPath();stroke.points.forEach(([x,y],i)=>i?context.lineTo(x,y):context.moveTo(x,y));context.stroke();}};
    const updateOverlay=()=>{const overlay=studio.querySelector('#signature-overlay');overlay.hidden=!signatureURL||!viewport;overlay.src=signatureURL||'';overlay.style.cssText=`left:${box.x*100}%;top:${box.y*100}%;width:${box.width*100}%;height:${box.height*100}%;`;};
    const updateSignature=()=>{if(imported)return;revoke(signatureURL);signatureURL=strokes.length?urlFromPad():null;signatureBytes=null;signatureAspect=.3;fitSignature();updateOverlay();};
    function urlFromPad(){return pad.toDataURL('image/png');}
    pad.onpointerdown=event=>{if(working)return; imported=false; const rect=pad.getBoundingClientRect();activeStroke={ink,points:[[(event.clientX-rect.left)/rect.width*600,(event.clientY-rect.top)/rect.height*180]]};strokes.push(activeStroke);pad.setPointerCapture(event.pointerId);invalidate();};
    pad.onpointermove=event=>{if(!activeStroke)return;const rect=pad.getBoundingClientRect();activeStroke.points.push([(event.clientX-rect.left)/rect.width*600,(event.clientY-rect.top)/rect.height*180]);redraw();};
    const endStroke=()=>{if(activeStroke){activeStroke=null;redraw();updateSignature();}};pad.onpointerup=endStroke;pad.onpointercancel=endStroke;
    studio.querySelector('#undo-sign').onclick=()=>{imported=false;strokes.pop();redraw();updateSignature();invalidate();};
    studio.querySelector('#clear-sign').onclick=()=>{imported=false;strokes=[];redraw();updateSignature();invalidate();};
    studio.querySelectorAll('[data-ink]').forEach(button=>button.onclick=()=>{ink=button.dataset.ink;studio.querySelectorAll('[data-ink]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));});
    studio.querySelector('#import-sign').onclick=()=>studio.querySelector('#signature-picker').click();
    studio.querySelector('#signature-picker').onchange=event=>action(async()=>{const file=event.target.files[0];event.target.value='';if(!file)return;if(file.size>20*1024*1024)throw new Error('Choose a signature image under 20 MB.');const bitmap=await createImageBitmap(file);const canvas=document.createElement('canvas');const scale=Math.min(1,1200/Math.max(bitmap.width,bitmap.height));canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();revoke(signatureURL);signatureURL=canvas.toDataURL('image/png');signatureBytes=new Uint8Array(await (await fetch(signatureURL)).arrayBuffer());imported=true;signatureAspect=canvas.height/canvas.width;fitSignature();updateOverlay();invalidate();});
    const preview=async()=>{if(!pdf)return;const rendered=await renderPage(pdf,Number(studio.querySelector('#page').value));viewport=rendered.viewport;const canvas=studio.querySelector('#pdf-preview');canvas.width=rendered.canvas.width;canvas.height=rendered.canvas.height;canvas.getContext('2d').drawImage(rendered.canvas,0,0);rendered.canvas.width=0;studio.querySelector('#signature-page').style.aspectRatio=`${canvas.width}/${canvas.height}`;fitSignature();updateOverlay();};
    studio.querySelector('#import').onclick=()=>studio.querySelector('#picker').click();
    studio.querySelector('#picker').onchange=event=>action(async()=>{const file=event.target.files[0];event.target.value='';if(!file)return;invalidate();bytes=null;pdf=null;viewport=null;updateOverlay();await pdfTask?.destroy();const loaded=await loadPDF(file);bytes=loaded.bytes;pdf=loaded.pdf;studio.querySelector('#source-name').textContent=file.name;studio.querySelector('#page').innerHTML=Array.from({length:pdf.numPages},(_,i)=>`<option value="${i}">${i+1}</option>`).join('');await preview();note('Page ready.');});
    studio.querySelector('#page').onchange=()=>action(async()=>{invalidate();await preview();});
    studio.querySelector('#size').oninput=()=>{fitSignature();invalidate();updateOverlay();};
    const overlay=studio.querySelector('#signature-overlay');let drag;
    overlay.onpointerdown=event=>{if(working)return;drag={x:event.clientX,y:event.clientY,left:box.x,top:box.y};overlay.setPointerCapture(event.pointerId);invalidate();};
    overlay.onpointermove=event=>{if(!drag)return;const rect=studio.querySelector('#signature-page').getBoundingClientRect();box.x=Math.max(0,Math.min(1-box.width,drag.left+(event.clientX-drag.x)/rect.width));box.y=Math.max(0,Math.min(1-box.height,drag.top+(event.clientY-drag.y)/rect.height));updateOverlay();};overlay.onpointerup=overlay.onpointercancel=()=>drag=null;
    studio.querySelector('#export').onclick=()=>action(async()=>{if(!bytes||!viewport)throw new Error('Choose a PDF first.');if(!signatureURL)throw new Error('Draw or import a signature first.');const png=signatureBytes||new Uint8Array(await(await fetch(signatureURL)).arrayBuffer());const placement=signaturePlacement(viewport,{x:box.x*viewport.width,y:box.y*viewport.height,width:box.width*viewport.width,height:box.height*viewport.height});finish(await signPDF(bytes,Number(studio.querySelector('#page').value),png,placement),'rabpdf_signed.pdf');});
  } else {
    studio.innerHTML = `<div class="studio-actions"><button id="capture" class="primary">${glyph('camera')}<span>${mode==='scan_id'?'Scan front and back':'Scan pages'}</span></button><button id="import" class="quiet">${glyph('upload')}<span>Import photos</span></button></div><input id="picker" type="file" accept="image/png,image/jpeg" multiple hidden>${mode==='scan_id'?'<label>Layout<select id="layout"><option>Stacked</option><option>Side by side</option></select></label>':''}<div id="scan-pages" class="scan-strip"></div><section id="editor" hidden><div class="section-head"><h2 id="page-label">Page</h2><div>${iconButton('rotate','rotate-cw','Rotate page')}${iconButton('delete','trash-2','Delete page')}</div></div><div id="crop-stage" class="crop-stage"><canvas id="scan-preview"></canvas><div id="crop-box"><button data-corner="tl" aria-label="Top left crop corner"></button><button data-corner="tr" aria-label="Top right crop corner"></button><button data-corner="bl" aria-label="Bottom left crop corner"></button><button data-corner="br" aria-label="Bottom right crop corner"></button></div><div id="book-divider" hidden></div></div><div class="scan-settings"><label>Enhancement<select id="filter"><option>Original</option><option>Grayscale</option><option>Black and white</option></select></label><label>Straighten<input id="angle" type="range" min="-15" max="15" value="0" step="1"></label></div><div class="studio-actions">${iconButton('previous','arrow-up','Move page earlier')}${iconButton('next','arrow-down','Move page later')}</div>${mode==='scan_book'?`<label>Book gutter<input id="gutter" type="range" min="10" max="90" value="50"></label><button id="split" class="quiet">${glyph('scissors')}<span>Split facing pages</span></button>`:''}</section><button id="export" class="primary">${glyph('check')}<span>Create PDF</span></button>`;
    let pages=[],current=0,rendered,renderSerial=0;
    const selected=()=>pages[current];
    const makeEntry=file=>({file,turn:0,angle:0,filter:'Original',crop:{left:0,top:0,right:1,bottom:1},split:false,flattenTop:0,flattenBottom:0});
    async function imageCanvas(entry, cropped=false){
      const bitmap=await createImageBitmap(entry.file);const angle=(entry.turn+entry.angle)*Math.PI/180;
      let width=Math.ceil(Math.abs(bitmap.width*Math.cos(angle))+Math.abs(bitmap.height*Math.sin(angle))),height=Math.ceil(Math.abs(bitmap.width*Math.sin(angle))+Math.abs(bitmap.height*Math.cos(angle)));
      const scale=Math.min(1,2400/Math.max(width,height),Math.sqrt(12000000/(width*height)));width=Math.max(1,Math.round(width*scale));height=Math.max(1,Math.round(height*scale));
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.fillStyle='white';ctx.fillRect(0,0,width,height);ctx.translate(width/2,height/2);ctx.rotate(angle);ctx.drawImage(bitmap,-bitmap.width*scale/2,-bitmap.height*scale/2,bitmap.width*scale,bitmap.height*scale);bitmap.close();ctx.resetTransform();
      if(entry.filter!=='Original'){const pixels=ctx.getImageData(0,0,width,height);for(let i=0;i<pixels.data.length;i+=4){let gray=.299*pixels.data[i]+.587*pixels.data[i+1]+.114*pixels.data[i+2];if(entry.filter==='Black and white')gray=gray>160?255:0;pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=gray;}ctx.putImageData(pixels,0,0);}
      if(mode==='scan_book'&&entry.split&&(entry.flattenTop||entry.flattenBottom)){
        const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
        const result=await host.process({top:entry.flattenTop,bottom:entry.flattenBottom},[new File([blob],'book.png',{type:'image/png'})],'book_flatten');
        const flattened=await createImageBitmap(new Blob([result.outputs[0].bytes],{type:'image/png'}));ctx.drawImage(flattened,0,0);flattened.close();
      }
      if(!cropped)return canvas;
      const {left,top,right,bottom}=entry.crop;const output=document.createElement('canvas');output.width=Math.max(1,Math.round((right-left)*width));output.height=Math.max(1,Math.round((bottom-top)*height));output.getContext('2d').drawImage(canvas,left*width,top*height,(right-left)*width,(bottom-top)*height,0,0,output.width,output.height);canvas.width=0;return output;
    }
    const updateCrop=()=>{const c=selected().crop;studio.querySelector('#crop-box').style.cssText=`left:${c.left*100}%;top:${c.top*100}%;width:${(c.right-c.left)*100}%;height:${(c.bottom-c.top)*100}%;`;updateDivider();};
    const list=()=>{studio.querySelector('#scan-pages').innerHTML=pages.map((page,index)=>`<button class="scan-tab" aria-pressed="${index===current}" data-page="${index}">${mode==='scan_id'?(index===0?'Front':'Back'):`${page.split?'Page':'Capture'} ${index+1}`}</button>`).join('');studio.querySelectorAll('[data-page]').forEach(button=>button.onclick=()=>action(async()=>{current=Number(button.dataset.page);list();await preview();}));studio.querySelector('#editor').hidden=!pages.length;};
    async function preview(){
      if(!pages.length)return;const serial=++renderSerial;rendered=await imageCanvas(selected());if(disposed||serial!==renderSerial)return;
      const canvas=studio.querySelector('#scan-preview');canvas.width=rendered.width;canvas.height=rendered.height;canvas.getContext('2d').drawImage(rendered,0,0);studio.querySelector('#crop-stage').style.aspectRatio=`${canvas.width}/${canvas.height}`;studio.querySelector('#filter').value=selected().filter;studio.querySelector('#angle').value=selected().angle;studio.querySelector('#page-label').textContent=mode==='scan_id'?(current===0?'Front':'Back'):`Page ${current+1}`;updateCrop();if(mode==='scan_book'){studio.querySelector('#book-divider').hidden=selected().split;studio.querySelector('#split').hidden=selected().split;studio.querySelector('#gutter').parentElement.hidden=selected().split;updateDivider();}
      if(mode==='scan_book'){
        studio.querySelector('#book-flatten').hidden=!selected().split;
        studio.querySelector('#flatten-top').value=selected().flattenTop;
        studio.querySelector('#flatten-bottom').value=selected().flattenBottom;
      }
    }
    async function append(files){
      const limit=mode==='scan_id'?2:mode==='scan_book'?60:30;
      if(pages.length+files.length>limit)throw new Error(mode==='scan_id'?'Keep exactly two ID sides. Delete a side before replacing it.':'This scan has too many pages. Export it before adding more.');
      if([...pages.map(page=>page.file),...files].reduce((sum,file)=>sum+file.size,0)>100*1024*1024)throw new Error('Keep scan photos below 100 MB total.');
      for(const file of files){if(file.size>20*1024*1024)throw new Error('Choose photos smaller than 20 MB.');const bitmap=await createImageBitmap(file);const tooLarge=bitmap.width*bitmap.height>40000000;bitmap.close();if(tooLarge)throw new Error('Choose photos below 40 million pixels.');}
      pages.push(...files.map(makeEntry));current=Math.max(0,pages.length-files.length);invalidate();list();await preview();
    }
    studio.querySelector('#import').onclick=()=>studio.querySelector('#picker').click();
    studio.querySelector('#picker').onchange=event=>{const files=[...event.target.files];event.target.value='';action(()=>append(files));};
    studio.querySelector('#capture').onclick=()=>action(async()=>{
      if(!Capacitor.isNativePlatform())throw new Error('Camera scanning is available in the Android app. Import photos in this preview.');
      if(mode==='scan_id'&&pages.length>=2)throw new Error('Delete an ID side before replacing it.');
      const result=await Scanner.document({limit:mode==='scan_id'?2-pages.length:20});if(result.cancelled)return;
      try{const photos=await Promise.all(result.pages.map(async(path,index)=>{const response=await fetch(Capacitor.convertFileSrc(path));if(!response.ok)throw new Error('Cannot read scanned image.');return new File([await response.blob()],`scan_${index+1}.jpg`,{type:'image/jpeg'});}));await append(photos);}finally{await Scanner.release({paths:result.pages}).catch(()=>{});}
    });
    studio.querySelector('#rotate').onclick=()=>action(async()=>{if(!selected())return;selected().turn=(selected().turn+90)%360;selected().crop={left:0,top:0,right:1,bottom:1};invalidate();await preview();});
    studio.querySelector('#delete').onclick=()=>action(async()=>{pages.splice(current,1);current=Math.max(0,Math.min(current,pages.length-1));invalidate();list();await preview();});
    studio.querySelector('#filter').onchange=event=>action(async()=>{selected().filter=event.target.value;invalidate();await preview();});
    studio.querySelector('#angle').onchange=event=>action(async()=>{selected().angle=Number(event.target.value);selected().crop={left:0,top:0,right:1,bottom:1};invalidate();await preview();});
    for(const [id,offset] of [['previous',-1],['next',1]])studio.querySelector('#'+id).onclick=()=>action(async()=>{const next=current+offset;if(next<0||next>=pages.length)return;[pages[current],pages[next]]=[pages[next],pages[current]];current=next;invalidate();list();await preview();});
    let cropDrag;
    studio.querySelectorAll('[data-corner]').forEach(handle=>{
      handle.onpointerdown=event=>{if(working)return;cropDrag={corner:handle.dataset.corner,x:event.clientX,y:event.clientY,crop:{...selected().crop}};handle.setPointerCapture(event.pointerId);invalidate();};
      handle.onpointermove=event=>{if(!cropDrag)return;const rect=studio.querySelector('#crop-stage').getBoundingClientRect();const dx=(event.clientX-cropDrag.x)/rect.width,dy=(event.clientY-cropDrag.y)/rect.height;const c=selected().crop,initial=cropDrag.crop;const x=Math.max(0,Math.min(1,(cropDrag.corner.endsWith('l')?initial.left:initial.right)+dx)),y=Math.max(0,Math.min(1,(cropDrag.corner.startsWith('t')?initial.top:initial.bottom)+dy));if(cropDrag.corner.endsWith('l'))c.left=Math.min(c.right-.05,x);else c.right=Math.max(c.left+.05,x);if(cropDrag.corner.startsWith('t'))c.top=Math.min(c.bottom-.05,y);else c.bottom=Math.max(c.top+.05,y);updateCrop();};
      handle.onpointerup=handle.onpointercancel=()=>cropDrag=null;
      handle.onkeydown=event=>{
        if(working||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
        event.preventDefault();const corner=handle.dataset.corner,c=selected().crop,step=event.shiftKey ? .05 : .01;
        if(event.key.startsWith('Arrow')&&['ArrowLeft','ArrowRight'].includes(event.key)){
          const delta=event.key==='ArrowLeft'?-step:step;
          if(corner.endsWith('l'))c.left=Math.max(0,Math.min(c.right-.05,c.left+delta));else c.right=Math.min(1,Math.max(c.left+.05,c.right+delta));
        }else{
          const delta=event.key==='ArrowUp'?-step:step;
          if(corner.startsWith('t'))c.top=Math.max(0,Math.min(c.bottom-.05,c.top+delta));else c.bottom=Math.min(1,Math.max(c.top+.05,c.bottom+delta));
        }
        invalidate();updateCrop();
      };
    });
    function updateDivider(){if(mode==='scan_book'&&selected()){const c=selected().crop;studio.querySelector('#book-divider').style.left=`${(c.left+(c.right-c.left)*Number(studio.querySelector('#gutter').value)/100)*100}%`;}}
    if(mode==='scan_book'){
      const flatten=document.createElement('div');flatten.id='book-flatten';flatten.className='scan-settings';flatten.hidden=true;
      flatten.innerHTML='<label>Flatten top curve<input id="flatten-top" type="range" min="-25" max="25" step="1" value="0"></label><label>Flatten bottom curve<input id="flatten-bottom" type="range" min="-25" max="25" step="1" value="0"></label>'+iconButton('reset-flatten','undo-2','Reset flattening');
      studio.querySelector('#editor').append(flatten);
      studio.querySelector('#reset-flatten').onclick=()=>action(async()=>{selected().flattenTop=0;selected().flattenBottom=0;invalidate();await preview();});
      for(const [id,property] of [['flatten-top','flattenTop'],['flatten-bottom','flattenBottom']])studio.querySelector('#'+id).onchange=event=>action(async()=>{selected()[property]=Number(event.target.value);invalidate();note('Applying manual curve correction...');await preview();note('Manual curve preview ready.');});
      studio.querySelector('#gutter').oninput=updateDivider;
      studio.querySelector('#split').onclick=()=>action(async()=>{if(pages.length>=60)throw new Error('Export this book before adding more pages (60-page limit).');const canvas=await imageCanvas(selected(),true);const halves=[];for(const [x,y,w,h] of splitBounds(canvas.width,canvas.height,Number(studio.querySelector('#gutter').value)/100)){const half=document.createElement('canvas');half.width=w;half.height=h;half.getContext('2d').drawImage(canvas,x,y,w,h,0,0,w,h);halves.push({...makeEntry(await blobOf(half)),split:true});half.width=0;}canvas.width=0;pages.splice(current,1,...halves);invalidate();list();await preview();});
    }
    if(mode==='scan_id')studio.querySelector('#layout').onchange=invalidate;
    studio.querySelector('#export').onclick=()=>action(async()=>{
      if(!pages.length)throw new Error('Scan or import pages first.');if(mode==='scan_book'&&pages.some(page=>!page.split))throw new Error('Split each book capture into facing pages first.');
      const images=[];let totalBytes=0;for(const [index,page] of pages.entries()){note(`Preparing page ${index+1}...`);const canvas=await imageCanvas(page,true);const bytes=new Uint8Array(await(await blobOf(canvas)).arrayBuffer());canvas.width=0;totalBytes+=bytes.length;if(totalBytes>100*1024*1024)throw new Error('Scan output exceeds 100 MB. Export fewer pages at a time.');images.push(bytes);}
      finish(await scanPDF(images,mode,studio.querySelector('#layout')?.value),`rabpdf_${mode.replace('scan_','')}.pdf`);
    });
  }
  if(['sign_pdf','reorder_pages'].includes(mode)){
    const name=document.createElement('p');name.id='source-name';name.className='source-name';studio.querySelector('#picker').after(name);
  }
  refreshIcons();
  return () => {disposed=true;sortable?.destroy();pdfTask?.destroy();urls.forEach(value=>URL.revokeObjectURL(value));};
}
