// This file is required by the index.html file and will
// be executed in the renderer process for that window.
// All of the Node.js APIs are available in this process.
var libAVDecoder = require('libavdecoder');

var util = require('util');
var YUVBuffer = require('yuv-buffer');
// var YUVCanvas = require('yuv-canvas');

var webglCanvas = require('./lib/webgl/frame-sink.js');


var playbtn = document.querySelector("#playbtn");
var stopbtn = document.querySelector("#stopbtn");
var progress = document.querySelector("#progress");

var canvas, webgl, metainfo={}, start_time, isRunning=false, isPlaying=false;
var framesDrawn = 0, lastDrawn=0, timeBase, selectedFile={};
var frameBuffer = [];

var decoder = new libAVDecoder();

// var file = document.createElement('input');
// file.type = 'file';
// file.addEventListener('change',function(e){
//   selectedFile = this.files[0];
//   startDecode(selectedFile.path);
//   this.value = '';
//   console.log('file selected', selectedFile);
// });
playbtn.addEventListener('click',function(e){
  // file.click();
  startDecode("./sample_video_cc.mp4");
});

function startDecode(input){
  isPlaying=true;
  playbtn.disabled=true;
  stopbtn.disabled=false;
  console.log('play test file');
  canvas = document.getElementById('video-canvas');
  if(webglCanvas.isAvailable()){
    webgl = new webglCanvas(canvas);
  }else{
    // yuv = YUVCanvas.attach(canvas);
    console.log('webgl not available..');
    return;
  }

  // yuv = YUVCanvas.attach(canvas);
  decoder.on('dataAvailable',function(){
    console.log('available!');
  });
  decoder.on('decodedFinished',function(){
    console.log('finito!');
  })
  decoder.open(input, function(info){

    console.log("opened", info);
    metainfo = info;
    timeBase = info.frame_rate_n/info.frame_rate_d;
    console.log("timebase", timeBase);

    var dataAvailable = function(response){
      console.log('queue ready', response);
      if(!isRunning){
        isRunning=true;
        readVideoFrame();
      }
    };
    var completeCallback = function(){
      console.log('decode finished');
    }

    decoder.decode(dataAvailable, completeCallback);
  });


}
var max_buffer_size = 100;

function readVideoFrame(){
  decoder.readVideo(function(frame){
    if(frame.hasFrame==1){
      // if(!start_time){ start_time = performance.now(); }
      frameBuffer.push(frame);

      if(!isDrawing){
        isDrawing=true;
        digestFrame();
      }
      readVideoWait();
        //requestAnimationFrame(function(ms){ drawFrame(ms, frame); });
      // setTimeout(requestAnimationFrame, ms, readVideoFrame);
    }else{
      console.log('no has framo');
      readVideoFrameComplete();
    }
  });
}

function readVideoWait(){
  if(frameBuffer.length >= max_buffer_size){
    console.log('read wait..');
    setTimeout(readVideoWait, 100);
  }else{
    setImmediate(readVideoFrame);
  }
}

function readVideoFrameComplete(){
  clearTimeout(drawTimeout);

  //reset player
  // isDrawing=false;
  isRunning=false;
  isPlaying=false;
  playbtn.disabled=false;
  stopbtn.disabled=true;
  progress.value = 0;
  webgl.clear();
}

var subTractNext = 0;
var isDrawing=false;
var drawTimeout;
var waitTimeout;


function digestFrame(){
  console.log(frameBuffer.length);
  if(frameBuffer.length > 0){
    var frame = frameBuffer.shift();
    var yuv_format = YUVBuffer.format({
      // Encoded size
      width: metainfo.coded_width,
      height: metainfo.coded_height,
      // 4:2:0, so halve the chroma dimensions.
      chromaWidth: metainfo.coded_width/2,
      chromaHeight: metainfo.coded_height/2,

      // Full frame is visible. ?
      cropLeft: 0,
      cropTop: 0,
      cropWidth: metainfo.width,
      cropHeight: metainfo.height,

      // Final display size stretches back out to 16:9 widescreen:
      displayWidth: canvas.width,
      displayHeight: canvas.height
    });
    var yuv_frame = YUVBuffer.frame(
      yuv_format,
      YUVBuffer.lumaPlane(yuv_format, frame.avY, frame.pitchY, 0),
      YUVBuffer.chromaPlane(yuv_format, frame.avU, frame.pitchU, 0),
      YUVBuffer.chromaPlane(yuv_format, frame.avV, frame.pitchV, 0)
    );

    webgl.clear();
    webgl.drawFrame(yuv_frame);

    var target = 1000/timeBase;
    var diff = 0;

    var since = performance.now() - lastDrawn;
    var wait = target-since;
    subTractNext = 0;

    console.log("last: %s, fps: %s, wait: %s", since, target, wait);

    lastDrawn = performance.now();

    framesDrawn++;

    progress.value = Math.round((frame.pts/metainfo.duration)*100);
    if(wait < 0){
      //drop the frame
      subTractNext = wait*-1;
      if(frameBuffer.length>0){
        console.log('drop');
        framesDrawn++;
        frameBuffer.shift();
        requestAnimationFrame(digestFrame);
      }else{
        console.log('no frame to skip to.. waiting..');
        //sleep and wait for frame?
        if(isDrawing){ digestWait(10); }
      }
    }
    if(isDrawing){
      if(subTractNext){ console.log(subTractNext); }
      requestAnimationFrame(digestFrame);
      // drawTimeout = setTimeout(requestAnimationFrame, wait, digestFrame);
    }
    // setTimeout(readVideoFrame, wait - subTractNext);
    // return target+diff;
  }else{
    //wait for a frame...
    if(isRunning){
      console.log('wait..');
      if(isDrawing){ digestWait(100); }
    }else{
      console.log('prlly done');
    }
  }
}
function digestWait(w){
  clearTimeout(waitTimeout);
  waitTimeout = setTimeout(digestFrame,w);
}
function logFps(txt){
  var logEle = document.getElementById('log');
  logEle.innerHTML = txt;
}
