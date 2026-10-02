let engine;
async function initialize() {
  const base = new URL('/runtime/', self.location.origin).href;
  importScripts(base + 'pyodide.js');
  engine = await loadPyodide({indexURL: base});
  await engine.loadPackage(['pillow', 'cryptography', 'micropip']);
  const wheels = await (await fetch('/wheels/manifest.json')).json();
  engine.globals.set('_wheel_urls', JSON.stringify(wheels.map(w => new URL('/wheels/' + w, self.location.origin).href)));
  await engine.runPythonAsync('import json, micropip\nawait micropip.install(json.loads(_wheel_urls), deps=False)');
  await engine.runPythonAsync(await (await fetch('/pdf_engine.py')).text());
}
const ready = initialize();
self.onmessage = async ({data}) => {
  const {id, tool, files, settings} = data;
  try {
    await ready;
    await engine.runPythonAsync('import shutil\nshutil.rmtree("/job", ignore_errors=True)\nos.makedirs("/job/input")\nos.makedirs("/job/output")');
    const paths = [];
    for (const [index, file] of files.entries()) {
      const name = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `/job/input/${index}_${name}`;
      engine.FS.writeFile(path, new Uint8Array(file.bytes));
      paths.push(path);
    }
    const jobs = settings.mode==='Batch' && !['merge','images_to_pdf'].includes(tool) ? paths.map(p=>[p]) : [paths];
    const messages=[];
    for(const [index, inputs] of jobs.entries()) {
      const folder = ['split','images'].includes(tool);
      const ext=tool==='book_flatten'?'png':tool.startsWith('image_')?({JPG:'jpg',PNG:'png',BMP:'bmp',TIFF:'tiff',GIF:'gif'}[settings.format]||'png'):tool==='text'?'txt':'pdf';
      const name=`${index+1}_rabpdf_${tool}`;
      const output = folder ? `/job/output/${name}` : `/job/output/${name}.${ext}`;
      engine.globals.set('_job_json', JSON.stringify({tool,paths:inputs,output,settings}));
      messages.push(await engine.runPythonAsync('job=json.loads(_job_json)\ngetattr(PDFEngine(), "do_"+job["tool"])(job["paths"], job["output"], job["settings"])'));
    }
    const message=messages.join('\n');
    const outputs = [];
    function collect(path,prefix='') {
      for(const name of engine.FS.readdir(path).filter(n=>!['.','..'].includes(n))) {
        const full=path+'/'+name;
        if(engine.FS.isDir(engine.FS.stat(full).mode))collect(full,prefix+name+'_');
        else outputs.push({name:prefix+name,bytes:engine.FS.readFile(full)});
      }
    }
    collect('/job/output');
    await engine.runPythonAsync('shutil.rmtree("/job", ignore_errors=True)');
    self.postMessage({id, message, outputs}, outputs.map(x=>x.bytes.buffer));
  } catch(error) {
    if(engine) await engine.runPythonAsync('import shutil\nshutil.rmtree("/job", ignore_errors=True)').catch(()=>{});
    self.postMessage({id, error: error.message || String(error)});
  }
};
ready.catch(()=>{});
