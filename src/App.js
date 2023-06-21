import { useEffect, useState, useRef } from "react";
import AudioContext from "./contexts/AudioContext";
import autoCorrelate from "./libs/AutoCorrelate";
import AudioVisualizer from './AudioVisualizer';

import {
  noteFromPitch,
  centsOffFromPitch,
  getDetunePercent,
} from "./libs/Helpers";

const mimeType = "audio/webm";
const audioCtx = AudioContext.getAudioContext();
const analyserNode = AudioContext.getAnalyser();
var buf = new Float32Array(analyserNode.fftSize);
var dataArray = new Uint8Array(analyserNode.frequencyBinCount);

const noteStrings = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];

function App() {
  const [source, setSource] = useState(null);
  const [pitchNote, setPitchNote] = useState("C");
  const [pitchScale, setPitchScale] = useState("4");
  const [pitch, setPitch] = useState("0 Hz");
  const [detune, setDetune] = useState("0");
  const [recordingStatus, setRecordingStatus] = useState(false);
  const mediaRecorder = useRef(null);
  const [audioChunks, setAudioChunks] = useState([]);
  const [audio, setAudio] = useState(null)
  const [stream, setStream] = useState(null);
  // const [randomPitch, setRandomPitch] = useState(noteStrings[Math.floor(Math.random() * noteStrings.length)]);
  const [audioData, setAudioData] = useState(new Uint8Array(0));
  const [amplitude, setAmplitude] = useState(0);
  const [score, setScore] = useState(0);
  const sampler = useRef();

  const updatePitch = async (recordingStatus) => {
    analyserNode.getFloatTimeDomainData(buf);
    analyserNode.getByteTimeDomainData(dataArray)
    setAudioData(dataArray)
    // analyze amplitude
    let sumSquares = 0.0;
    for (const amplitude of buf) { sumSquares += amplitude * amplitude; }
    setAmplitude(Math.sqrt(sumSquares / buf.length));
    // analyze pitch
    var ac = autoCorrelate(buf, audioCtx.sampleRate);
    if (ac > -1) {
      let note = noteFromPitch(ac);
      let sym = noteStrings[note % 12];
      let scl = Math.floor(note / 12) - 1;
      let dtune = centsOffFromPitch(ac, note);
      setPitch(parseFloat(ac).toFixed(2) + " Hz");
      setPitchNote(sym);
      setPitchScale(scl);
      setDetune(dtune);
      console.log(note, sym, scl, dtune, ac);
    }
  };

  useEffect(() => {
    if (source != null) {
      source.connect(analyserNode);
    }
    else {
      start();
    }
  }, [source]);

  setInterval(updatePitch, 1);

  const start = async () => {
    const input = await getMicInput();
    setStream(input);

    if (audioCtx.state === "suspended") {
      await audioCtx.resume();
    }
    setSource(audioCtx.createMediaStreamSource(input));
  };

  useEffect(() => {
    return () => clearInterval(sampler.current);
  }, []);
  const startSampler = () => {
    setScore(0);
    sampler.current = setInterval( async () => {
      setScore((prev) => prev + amplitude * (100 - getDetunePercent(detune)));
    }, 50);
  };
  const stopSampler = () => {
    clearInterval(sampler.current);
  };

  const getMicInput = () => {
    return navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        autoGainControl: false,
        noiseSuppression: false,
        latency: 0,
      },
    });
  };

  const startRecording = async () => {
    setRecordingStatus(true);
    //create new Media recorder instance using the stream
    const media = new MediaRecorder(stream, { type: mimeType });
    //set the MediaRecorder instance to the mediaRecorder ref
    mediaRecorder.current = media;
    //invokes the start method to start the recording process
    mediaRecorder.current.start();
    let localAudioChunks = [];
    mediaRecorder.current.ondataavailable = (event) => {
      if (typeof event.data === "undefined") return;
      if (event.data.size === 0) return;
      localAudioChunks.push(event.data);
    };
    setAudioChunks(localAudioChunks);
    startSampler();
  };

  const stopRecording = () => {
    setRecordingStatus(false);
    //stops the recording instance
    mediaRecorder.current.stop();
    mediaRecorder.current.onstop = () => {
      //creates a blob file from the audiochunks data
      const audioBlob = new Blob(audioChunks, { type: mimeType });
      //creates a playable URL from the blob file.
      const audioUrl = URL.createObjectURL(audioBlob);
      setAudio(audioUrl);
      setAudioChunks([]);
    };
    stopSampler();
  };

  return (
    <div className="flex justify-center items-center h-screen" id="wrapper">
      <div id="content_container">
        <div className="flex flex-col items-center text-pink-600">
          {/* <p className="p-5">Chris Martin asks you to sing the note {randomPitch}.</p> */}
          <div
            className={"visible flex flex-col transition-all ease-in delay-75 border-pink-600 border-2 justify-center items-center p-10 rounded-xl shadow-lg mb-5 w-60 h-40"}
          >
            {/* <div className="flex items-start font-mono">
              <span
                className={"visible transition-all delay-75 font-thin text-9xl"}
              >
                {pitchNote}
              </span>
              <span className="bg-pink-600 p-1 px-2 rounded-lg" style={{ color: "#25367c" }}>
                {pitchScale}
              </span>
            </div> */}
            <AudioVisualizer audioData={audioData} />
            <div className="w-full flex justify-center items-center">
              <div
                className="bg-gradient-to-r from-green-400 to-pink-600 py-1 rounded-full rotate-180"
                style={{
                  width: (detune < 0 ? getDetunePercent(detune) : "50") + "%",
                }}
              ></div>
              <span className="font-bold text-lg text-green-800">I</span>
              <div
                className="bg-gradient-to-r from-green-400 to-pink-600 py-1 rounded-full"
                style={{
                  width: (detune > 0 ? getDetunePercent(detune) : "50") + "%",
                }}
              ></div>
            </div>
            <div className="mt-2 text-xs">
              <span>{pitchNote} ({pitch})</span>
            </div> 
          </div>
          {!recordingStatus ? (
            <button
              className="bg-pink-600 text-white w-10 h-10 rounded-full shadow-xl transition-all"
              onClick={startRecording}
            >
              🎤
            </button>
          ) : (
            <button
              className="bg-pink-600 text-black w-10 h-10 shadow-xl transition-all"
              onClick={stopRecording}
            >
            </button>
          )}
          <div className="items-center ">
            {audio && !recordingStatus ? (
              <div className="flex flex-col p-5 items-center space-y-5">
                <audio src={audio} controls></audio>
                {/* <a download href={audio}>
                Download Recording
              </a> */}
                <p>Your score is {Math.trunc(score * 100)}.</p>
                <button className="border-pink-600 border-2 rounded-lg h-10 text-lg px-5">submit</button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;