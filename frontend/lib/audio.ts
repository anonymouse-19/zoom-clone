/**
 * "Test speaker": plays a short two-note chime through the chosen speaker, like the test
 * sound in Zoom's and Google Meet's device check.
 *
 * Generated with the Web Audio API (an oscillator), so there's no sound file to load.
 */

const FIRST_NOTE_HZ = 660;
const SECOND_NOTE_HZ = 880;
const NOTE_SECONDS = 0.35;
const VOLUME = 0.2;

/**
 * Chrome and Edge let an AudioContext choose its output device (`setSinkId`). Other
 * browsers play through the default speaker. The type is written out here because
 * TypeScript's DOM types don't include it everywhere yet.
 */
type AudioContextWithSink = AudioContext & { setSinkId?: (deviceId: string) => Promise<void> };

/** Play the chime through `speakerId` ("" = default speaker). Resolves when it has finished. */
export async function playTestSound(speakerId: string): Promise<void> {
  const audioContext: AudioContextWithSink = new AudioContext();
  if (speakerId && audioContext.setSinkId) {
    await audioContext.setSinkId(speakerId);
  }

  const startAt = audioContext.currentTime;
  playNote(audioContext, FIRST_NOTE_HZ, startAt);
  playNote(audioContext, SECOND_NOTE_HZ, startAt + NOTE_SECONDS);

  // Close the context once both notes have played, to free the audio device.
  const totalMs = NOTE_SECONDS * 2 * 1000;
  await new Promise((resolve) => setTimeout(resolve, totalMs));
  await audioContext.close();
}

/** One note that fades out, so it doesn't end with a click. */
function playNote(audioContext: AudioContext, frequencyHz: number, startAt: number): void {
  const oscillator = audioContext.createOscillator();
  const volume = audioContext.createGain();
  oscillator.frequency.value = frequencyHz;
  volume.gain.setValueAtTime(VOLUME, startAt);
  volume.gain.exponentialRampToValueAtTime(0.001, startAt + NOTE_SECONDS);
  oscillator.connect(volume).connect(audioContext.destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + NOTE_SECONDS);
}
