import {loadPyodide} from '../public/runtime/pyodide.mjs';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const runtime=resolve('public/runtime');
const py=await loadPyodide({indexURL:runtime,packageCacheDir:runtime});
await py.loadPackage(['pillow','cryptography','micropip']);
const wheels=JSON.parse(await readFile('public/wheels/manifest.json','utf8'));
py.FS.mkdir('/wheels');
for(const name of wheels)py.FS.writeFile('/wheels/'+name,await readFile('public/wheels/'+name));
py.globals.set('_wheel_urls',JSON.stringify(wheels.map(n=>'emfs:///wheels/'+n)));
await py.runPythonAsync('import json, micropip\nawait micropip.install(json.loads(_wheel_urls),deps=False)');
await py.runPythonAsync(await readFile('public/pdf_engine.py','utf8'));
await py.runPythonAsync(`
from pypdf import PdfReader
from reportlab.pdfgen import canvas
from PIL import Image
os.makedirs('/test',exist_ok=True)
pdf=canvas.Canvas('/test/source.pdf')
for index in range(3):
    pdf.drawString(72,720,'RabPDF mobile sample '+str(index))
    pdf.showPage()
pdf.save()
app=PDFEngine()
files=['/test/source.pdf']
def check_pages(path,count):
    assert len(PdfReader(path).pages)==count,path
app.do_merge(files+files,'/test/merged.pdf',{})
check_pages('/test/merged.pdf',6)
app.do_split(files,'/test/split',{'ranges':'1-2,3'})
check_pages('/test/split/source_part_001.pdf',2)
app.do_extract(files,'/test/extract.pdf',{'pages':'1,3'})
check_pages('/test/extract.pdf',2)
app.do_remove(files,'/test/remove.pdf',{'pages':'2'})
check_pages('/test/remove.pdf',2)
app.do_rotate(files,'/test/rotate.pdf',{'pages':'2','rotation':'90 clockwise'})
assert PdfReader('/test/rotate.pdf').pages[1].rotation==90
app.do_compress(files,'/test/compress.pdf',{'quality':'Balanced'})
check_pages('/test/compress.pdf',3)
app.do_protect(files,'/test/protected.pdf',{'password':'test123','owner':'owner123'})
assert PdfReader('/test/protected.pdf').is_encrypted
app.do_unlock(['/test/protected.pdf'],'/test/unlocked.pdf',{'password':'test123'})
check_pages('/test/unlocked.pdf',3)
assert not PdfReader('/test/unlocked.pdf').is_encrypted
app.do_text(files,'/test/text.txt',{})
assert 'RabPDF mobile sample' in Path('/test/text.txt').read_text()
app.do_watermark(files,'/test/watermarked.pdf',{'text':'TEST','position':'Diagonal','opacity':'20%','pages':''})
check_pages('/test/watermarked.pdf',3)
app.do_numbers(files,'/test/numbered.pdf',{'start':'1','prefix':'Page ','position':'Bottom center'})
assert 'Page 1' in PdfReader('/test/numbered.pdf').pages[0].extract_text()
app.do_metadata(files,'/test/meta.pdf',{'title':'Mobile','author':'Nishan','subject':'Test','keywords':'pdf'})
assert PdfReader('/test/meta.pdf').metadata.title=='Mobile'
Image.new('RGB',(120,80),'blue').save('/test/image.png')
app.do_image_convert(['/test/image.png'],'/test/converted.jpg',{'format':'JPG'})
assert Image.open('/test/converted.jpg').format=='JPEG'
app.do_image_upscale(['/test/image.png'],'/test/upscaled.png',{'format':'PNG','scale':'2x','engine':'Lanczos'})
assert Image.open('/test/upscaled.png').size==(240,160)
app.do_image_compress(['/test/image.png'],'/test/compressed.jpg',{'format':'JPG','compression':'Target size','target':'1','unit':'KB'})
assert os.path.getsize('/test/compressed.jpg')<=1024
app.do_images_to_pdf(['/test/image.png'],'/test/image.pdf',{'fit':'Fit image','page_size':'A4'})
check_pages('/test/image.pdf',1)
app.do_images(['/test/image.pdf'],'/test/images',{})
assert list(Path('/test/images').iterdir())
print('All 17 Python-backed mobile tools passed in the offline WebAssembly engine')
`);
await mkdir('.test-fixtures',{recursive:true});
await writeFile('.test-fixtures/source.pdf',py.FS.readFile('/test/source.pdf'));
await writeFile('.test-fixtures/image.png',py.FS.readFile('/test/image.png'));
