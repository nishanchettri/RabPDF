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
    const folder = ['split','images'].includes(tool);
    const output = folder ? '/job/output' : `/job/output/rabpdf_${tool}.${tool==='text'?'txt':'pdf'}`;
    engine.globals.set('_job_json', JSON.stringify({tool,paths,output,settings}));
    const message = await engine.runPythonAsync('job=json.loads(_job_json)\ngetattr(PDFEngine(), "do_"+job["tool"])(job["paths"], job["output"], job["settings"])');
    const outputs = [];
    for (const name of engine.FS.readdir('/job/output').filter(n=>!['.','..'].includes(n))) {
      const bytes = engine.FS.readFile('/job/output/'+name);
      outputs.push({name, bytes});
    }
    await engine.runPythonAsync('shutil.rmtree("/job", ignore_errors=True)');
    self.postMessage({id, message, outputs}, outputs.map(x=>x.bytes.buffer));
  } catch(error) {
    if(engine) await engine.runPythonAsync('import shutil\nshutil.rmtree("/job", ignore_errors=True)').catch(()=>{});
    self.postMessage({id, error: error.message || String(error)});
  }
};
ready.catch(()=>{});
