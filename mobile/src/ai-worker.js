importScripts('/ort/ort.wasm.min.js');
ort.env.wasm.numThreads=1;
ort.env.wasm.wasmPaths=new URL('/ort/',self.location.origin).href;
let session;
self.onmessage=async ({data})=>{
  try {
    session ||= await ort.InferenceSession.create('/brand/image-super-resolution.onnx',{executionProviders:['wasm']});
    const {width,height,pixels}=data;
    const source=new Float32Array(width*height);
    for(let i=0;i<source.length;i++)source[i]=(.299*pixels[i*4]+.587*pixels[i*4+1]+.114*pixels[i*4+2])/255;
    const output=new Uint8Array(width*height*9), stride=width*3;
    for(let top=0;top<height;top+=192)for(let left=0;left<width;left+=192){
      const tile=new Float32Array(224*224);
      for(let y=0;y<224;y++)for(let x=0;x<224;x++){
        const row=Math.max(0,Math.min(height-1,top+y-16));
        const column=Math.max(0,Math.min(width-1,left+x-16));
        tile[y*224+x]=source[row*width+column];
      }
      const result=await session.run({[session.inputNames[0]]:new ort.Tensor('float32',tile,[1,1,224,224])});
      const predicted=result[session.outputNames[0]].data;
      const rows=Math.min(192,height-top)*3,columns=Math.min(192,width-left)*3;
      for(let y=0;y<rows;y++)for(let x=0;x<columns;x++)
        output[(top*3+y)*stride+left*3+x]=Math.round(Math.max(0,Math.min(1,predicted[(y+48)*672+x+48]))*255);
      self.postMessage({progress:true});
    }
    self.postMessage({output},[output.buffer]);
  } catch(error){self.postMessage({error:error.message||String(error)});}
};
