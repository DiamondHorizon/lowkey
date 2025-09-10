// Variables
let expectedNote = 'C4';
let pitch;
let lessonData = null;
let currentIndex = 0;
let lessonStartTime = null;

let micActive = false;
let midiActive = true;

// For Microphone
let audioContext = new (window.AudioContext || window.webkitAudioContext)();
let micStream = null; // For the raw stream data
let micSource = null;

// For midi
let midiAccess = null;

// Microphone Specific
function correctOctave(note) {
    const match = note.match(/^([A-G]#?)(\d)$/);
    if (!match) return note;
    const [_, pitch, octave] = match;
    const correctedOctave = Math.max(0, parseInt(octave) - 1); // Shift down
    return `${pitch}${correctedOctave}`;
}

function frequencyToNote(freq) {
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const A4 = 440;
    const semitone = 12 * Math.log2(freq / A4);
    const noteIndex = Math.round(semitone) + 57;
    const octave = Math.floor(noteIndex / 12);
    const noteName = noteNames[noteIndex % 12];
    return `${noteName}${octave}`;
}

// Check if input matches expected (Mic)
function modelLoaded() {
    if (!micActive) return;
    pitch.getPitch(function(err, frequency) {
        if (!micActive) return;
        if (frequency && lessonData) {
            const detectedNote = correctOctave(frequencyToNote(frequency));
            const expectedTime = lessonData[currentIndex].time;
            const elapsed = audioContext.currentTime - lessonStartTime;
            const timingOffset = elapsed - expectedTime;

            console.log('Detected:', detectedNote, '| Expected:', expectedNote);

            const countdown = expectedTime - elapsed;
            document.getElementById('countdown').textContent = `Next note in: ${Math.max(0, countdown).toFixed(2)}s`;

            if (Math.abs(timingOffset) < 0.5 && detectedNote === expectedNote) {
                document.getElementById('status').textContent = `✅ ${expectedNote} correct! Timing: ${timingOffset.toFixed(2)}s`;
                currentIndex++;

                if (currentIndex < lessonData.length) {
                    expectedNote = lessonData[currentIndex].note;
                    update();
                    setTimeout(() => {
                        document.getElementById('status').textContent = 'Listening for: ' + expectedNote;
                    }, 1000);
                } else {
                    document.getElementById('status').textContent = '🎉 Lesson complete!';
                    update();
                }
            }
        }

        requestAnimationFrame(modelLoaded);
    });
}



// Midi specific
function onMIDISuccess(access) {
    midiAccess = access; // ✅ Now updates the global variable
    for (let input of access.inputs.values()) {
        console.log('🎹 Listening to MIDI device:', input.name);
        input.onmidimessage = handleMIDIMessage;
    }
}

function onMIDIFailure() {
  console.error('MIDI access failed');
  document.getElementById('status').textContent = '❌ MIDI access denied';
}

// Check if input matches expected (Midi)
function handleMIDIMessage(message) {
    console.log('📨 MIDI message received:', message.data);
    const [status, noteNumber, velocity] = message.data;
    const command = status >> 4;

    if (command === 9 && velocity > 0) { // Note-on
        const noteName = midiNoteToName(noteNumber);
        console.log('MIDI Note Played:', noteName);

        if (noteName === expectedNote) {
        document.getElementById('status').textContent = '✅ MIDI match: ' + noteName;
        currentIndex++;
        if (currentIndex < lessonData.length) {
            expectedNote = lessonData[currentIndex].note;
            update();
        } else {
            document.getElementById('status').textContent = '🎉 Lesson complete!';
            update();
        }
        }
    }
}

function midiNoteToName(midiNumber) {
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const octave = Math.floor(midiNumber / 12) - 1;
  const note = noteNames[midiNumber % 12];
  return `${note}${octave}`;
}



// Regardless of Input Mode

// Settings Bar

// Load a user-uploaded MIDI file from local storage
document.getElementById('midiFile').addEventListener('change', function(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const midi = new Midi(e.target.result);

        // Split the notes from the midi tracks into two arrays by hand
        const rightHandNotes = [];
        const leftHandNotes = [];

        
        midi.tracks.forEach(track => {
            track.notes.forEach(note => {
            const midiNumber = note.midi;
            if (midiNumber >= 60) {
                rightHandNotes.push(note);
            } else {
                leftHandNotes.push(note);
            }
            });
        });

        const lesson = {
            title: midi.header.name || "Untitled",
            rightHand: rightHandNotes.map(n => ({
                note: n.name,
                time: n.time,
                duration: n.duration
            })),
            leftHand: leftHandNotes.map(n => ({
                note: n.name,
                time: n.time,
                duration: n.duration
            }))
        };

        console.log('Lesson object:', lesson);
        loadSong(lesson); // ✅ Now you can load the parsed song

    };
    reader.readAsArrayBuffer(file);
});

// Load a MIDI file from the dropdown (served from server or local folder)
function loadSelectedMidi() {
  const selector = document.getElementById('midiSelector');
  const filePath = selector.value;

  fetch(filePath)
    .then(res => res.arrayBuffer())
    .then(buffer => {
      const midi = new Midi(buffer);

      const rightHandNotes = [];
      const leftHandNotes = [];

      midi.tracks.forEach(track => {
        track.notes.forEach(note => {
          const midiNumber = note.midi;
          if (midiNumber >= 60) {
            rightHandNotes.push(note);
          } else {
            leftHandNotes.push(note);
          }
        });
      });

      const lesson = {
        title: midi.header.name || selector.options[selector.selectedIndex].text,
        rightHand: rightHandNotes.map(n => ({
          note: n.name,
          time: n.time,
          duration: n.duration
        })),
        leftHand: leftHandNotes.map(n => ({
          note: n.name,
          time: n.time,
          duration: n.duration
        }))
      };

      console.log('Lesson loaded:', lesson);
      loadSong(lesson);
    })
    .catch(err => {
      console.error('Failed to load MIDI:', err);
      document.getElementById('status').textContent = '❌ Failed to load MIDI file';
    });
}

// Stop which ever input method is active
function stopListening() {
  // Stop pitch detection
  micActive = false;
  pitch = null;

  // Stop mic stream
  if (micStream) {
    micStream.getTracks().forEach(track => track.stop());
    micStream = null;
  }

  // Stop MIDI listeners
  if (midiAccess) {
    for (let input of midiAccess.inputs.values()) {
      input.onmidimessage = null;
    }
  }
}

// Switch between mic and midi and change the status of whether using mic or midi
document.getElementById('inputToggle').addEventListener('click', function () {
  midiActive = this.checked;
  document.getElementById('inputMode').textContent = midiActive ? '🎹 MIDI' : '🎤 Microphone';

  stopListening(); // ✅ Always stop previous input first

  if (midiActive) {
    navigator.requestMIDIAccess().then(access => {
    console.log('✅ MIDI access granted');
    console.log('🔍 Inputs found:', access.inputs.size);
    for (let input of access.inputs.values()) {
        console.log('🎹 Found device:', input.name);
    }
    onMIDISuccess(access);
    }, onMIDIFailure);
  } else {
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        micStream = stream;
        micSource = audioContext.createMediaStreamSource(stream);
        document.querySelector('button').disabled = false;
      })
      .catch(err => {
        console.error('Mic access failed:', err);
        document.getElementById('status').textContent = '❌ Mic access denied';
        document.querySelector('button').disabled = true;
      });
  }
});

// Trainer

function startListening() {
    if (midiActive) {
        document.getElementById('status').textContent = '🎹 MIDI input active';
        micActive = false;
        return;
    }

    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }

    if (!micStream) {
        document.getElementById('status').textContent = '🎤 Mic not ready yet. Please wait...';
        return;
    }

    document.getElementById('status').textContent = 'Listening for: ' + expectedNote;

    pitch = ml5.pitchDetection(
        'https://cdn.jsdelivr.net/gh/ml5js/ml5-data-and-models/models/pitch-detection/crepe/',
        audioContext,
        micStream,
        () => {
        micActive = true;
        modelLoaded();
        }
    );
}

function getNextNote(current) {
    const notes = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'];
    const idx = notes.indexOf(current);
    return notes[(idx + 1) % notes.length];
}

function loadSong(songData) {
    const mode = document.getElementById('handMode').value;

    if (mode === 'right') {
        lessonData = songData.rightHand;
    } else if (mode === 'left') {
        lessonData = songData.leftHand;
    } else {
        lessonData = mergeHands(songData.leftHand, songData.rightHand);
    }

    currentIndex = 0;
    expectedNote = lessonData[currentIndex].note;
    update();
    lessonStartTime = midiActive ? performance.now() / 1000 : audioContext.currentTime;
    document.getElementById('status').textContent = 'Listening for: ' + expectedNote;
}

function mergeHands(left, right) {
    return [...left, ...right].sort((a, b) => a.time - b.time);
}

function update() {
    updateNoteDisplay();
    updateProgressBar();
}

function updateNoteDisplay() {
  const noteList = document.getElementById('noteList');
  noteList.innerHTML = '';

  if (!lessonData) return;

  for (let i = currentIndex; i < Math.min(currentIndex + 5, lessonData.length); i++) {
    const li = document.createElement('li');
    li.textContent = lessonData[i].note;
    if (i === currentIndex) {
      li.style.fontWeight = 'bold';
      li.style.color = 'green';
    }
    noteList.appendChild(li);
  }
}

function updateProgressBar() {
    const progress = document.getElementById('lessonProgress');
    const percent = (currentIndex / lessonData.length) * 100;
    progress.value = percent;
}