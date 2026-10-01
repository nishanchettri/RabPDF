export const tools = [
  ['merge','Merge PDF','Organize','files'],
  ['split','Split PDF','Organize','scissors'],
  ['extract','Extract pages','Organize','copy'],
  ['remove','Remove pages','Organize','trash-2'],
  ['rotate','Rotate PDF','Organize','rotate-cw'],
  ['compress','Compress PDF','Optimize','minimize-2'],
  ['protect','Protect PDF','Security','lock'],
  ['unlock','Unlock PDF','Security','lock-open'],
  ['images_to_pdf','Images to PDF','Convert','image'],
  ['pdf_to_images','PDF to images','Convert','images'],
  ['text','Extract text','Convert','text'],
  ['images','Extract images','Convert','image-down'],
  ['watermark','Watermark','Annotate','stamp'],
  ['numbers','Page numbers','Annotate','list-ordered'],
  ['metadata','Edit metadata','Annotate','file-pen'],
  ['qr','Link to QR','Create','qr-code'],
];
export const fields = {
  split: [['ranges','Ranges','text','']],
  extract: [['pages','Pages','text','1']],
  remove: [['pages','Pages','text','1']],
  rotate: [['rotation','Rotation',['90 clockwise','180','90 counter-clockwise']],['pages','Pages','text','']],
  compress: [['quality','Quality',['Lossless optimization','Balanced','Smallest file'],'Balanced']],
  protect: [['password','Open password','password',''],['owner','Owner password','password','']],
  unlock: [['password','Current password','password','']],
  images_to_pdf: [['fit','Page fit',['Fit image','Fill page']],['page_size','Page size',['A4','Letter','Match each image']]],
  pdf_to_images: [['format','Image format',['PNG','JPG']],['dpi','Resolution',['96','150','200','300'],'150'],['pages','Pages','text','']],
  watermark: [['text','Watermark text','text','CONFIDENTIAL'],['position','Position',['Diagonal','Center','Top','Bottom']],['opacity','Opacity',['10%','20%','30%','40%','50%'],'20%'],['pages','Pages','text','']],
  numbers: [['position','Position',['Bottom center','Bottom right','Bottom left','Top center','Top right','Top left']],['start','Start number','number','1'],['prefix','Prefix','text','']],
  metadata: [['title','Title','text',''],['author','Author','text',''],['subject','Subject','text',''],['keywords','Keywords','text','']],
  qr: [['link','Web link','url','https://'],['size','Size',['Small','Medium','Large'],'Medium'],['border','Border',['Standard','Compact']]],
};
export function parsePages(spec, total) {
  if (!spec.trim()) return Array.from({length:total},(_,i)=>i);
  const result=[];
  for(const part of spec.split(',')) {
    const match=part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if(!match) throw new Error('Use page ranges such as 1,3,5-8.');
    const start=Number(match[1]), end=Number(match[2] || match[1]);
    if(start<1 || end>total || start>end) throw new Error(`Pages must be between 1 and ${total}.`);
    for(let n=start;n<=end;n++) result.push(n-1);
  }
  return [...new Set(result)];
}
