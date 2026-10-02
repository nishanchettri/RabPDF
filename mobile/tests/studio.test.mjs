import test from 'node:test';
import assert from 'node:assert/strict';
import {PDFDocument, degrees, PDFName} from 'pdf-lib';
import {safeWebLink, splitBounds, signaturePlacement, scanPDF, reorderPDF, signPDF} from '../src/studio-core.js';

const png=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aChkAAAAASUVORK5CYII=','base64'));

test('QR links require explicit web schemes and no embedded credentials',()=>{
  assert.equal(safeWebLink('https://nishanchettri.com'),'https://nishanchettri.com/');
  for(const value of ['javascript:alert(1)','file:///secret','intent://app','https://user:password@example.com','not a URL'])assert.equal(safeWebLink(value),null);
});
test('book halves exactly cover an odd-width capture',()=>{
  const boxes=splitBounds(301,200,.4);assert.equal(boxes[0][2]+boxes[1][2],301);assert.equal(boxes[1][0],boxes[0][2]);
  assert.throws(()=>splitBounds(300,200,0));
});
test('ID export requires two sides and places them on one page',async()=>{
  const bytes=await scanPDF([png,png],'scan_id');const pdf=await PDFDocument.load(bytes);assert.equal(pdf.getPageCount(),1);
  assert.equal((await PDFDocument.load(await scanPDF([png,png],'scan_document'))).getPageCount(),2);
  await assert.rejects(scanPDF([png],'scan_id'),/two sides/);
});
test('page reorder retains sizes, metadata and base rotation',async()=>{
  const source=await PDFDocument.create();source.setTitle('Keep this title');
  source.addPage([200,300]);source.addPage([300,400]).setRotation(degrees(90));source.addPage([400,500]);
  const bytes=await source.save();
  const result=await PDFDocument.load(await reorderPDF(bytes,[{index:2,rotation:90},{index:1,rotation:90}]));
  assert.equal(result.getPageCount(),2);assert.equal(result.getPage(0).getWidth(),400);assert.equal(result.getPage(1).getRotation().angle,180);assert.equal(result.getTitle(),'Keep this title');
  await assert.rejects(reorderPDF(bytes,[{index:0,rotation:0},{index:0,rotation:0}]),/Invalid page order/);
  await assert.rejects(reorderPDF(bytes,[]),/at least one/);
});
test('signature placement converts display coordinates for cropped and rotated pages',()=>{
  const straight=signaturePlacement({convertToPdfPoint:(x,y)=>[10+x/2,820-y/2]},{x:20,y:40,width:80,height:20});
  assert.equal(straight.x,20);assert.equal(straight.y,790);assert.equal(straight.width,40);assert.equal(straight.height,10);assert.equal(straight.rotate.angle,0);
  const turned=signaturePlacement({convertToPdfPoint:(x,y)=>[10+y/2,20+x/2]},{x:20,y:40,width:80,height:20});
  assert.equal(turned.x,40);assert.equal(turned.y,30);assert.equal(turned.rotate.angle,90);
});
test('visual signature embeds an image without rasterizing the whole page',async()=>{
  const source=await PDFDocument.create();source.addPage([200,300]).drawText('Searchable text');
  const result=await PDFDocument.load(await signPDF(await source.save(),0,png,{x:20,y:20,width:40,height:10,rotate:degrees(0)}));
  const resources=result.getPage(0).node.Resources();assert(resources.has(PDFName.of('XObject')));assert(resources.has(PDFName.of('Font')));
});
