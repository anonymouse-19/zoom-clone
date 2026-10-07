/**
 * One live audio/video link between me and ONE other participant: an RTCPeerConnection,
 * plus the "perfect negotiation" pattern that sets it up.
 *
 * The meeting is a mesh: every participant has one PeerLink to every other participant
 * (lib/roomConnection.ts keeps the set). Video and audio flow directly between the two
 * browsers. The server only carries the small setup messages ("signals") between them.
 *
 * How a link gets set up ("negotiation"):
 *   1. A change that the other side must agree to (e.g. a new media slot) makes the
 *      browser fire `negotiationneeded`.
 *   2. We create an *offer* (an SDP: "here are the codecs and media I'll send") and signal it.
 *   3. The other side applies it and signals back an *answer*.
 *   4. Meanwhile both sides signal ICE *candidates* (possible network addresses) until
 *      a working path between them is found. Then media flows.
 *
 * Who calls whom: the *initiator* (whoever joined later) sets up its audio and video
 * slots straight away, so its browser sends the first offer. The other side creates its
 * link only when that offer arrives, and answers it. (If both offered at the same moment
 * on every join, Chrome sometimes never found a network path: docs/LEARNING_LOG.md.)
 *
 * Perfect negotiation, for everything after that (camera turned on for the first time,
 * network restarts): either side may send an offer at any time, so two can cross
 * ("glare"). One side of each pair is *polite* (it drops its own offer and accepts
 * theirs) and the other is *impolite* (it ignores the incoming one), which settles it.
 */

import { ICE_SERVERS } from "@/lib/config";
import type { SignalData } from "@/lib/roomProtocol";

export type TrackKind = "audio" | "video";

type PeerLinkOptions = {
  /** True for the side that sends the first offer (see the header). */
  isInitiator: boolean;
  /** In each pair, exactly one side must be polite (see the header). */
  isPolite: boolean;
  /** Pass a setup message to the other participant (through the server). */
  sendSignal: (data: SignalData) => void;
  /** Their audio/video arrived or changed. */
  onRemoteStream: (stream: MediaStream) => void;
};

export class PeerLink {
  private readonly connection = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  private readonly options: PeerLinkOptions;
  private remoteStream = new MediaStream();
  private isMakingOffer = false;
  private isIgnoringOffer = false;
  /** Signals are handled one at a time, in the order they arrived. */
  private signalQueue: Promise<void> = Promise.resolve();

  constructor(options: PeerLinkOptions) {
    this.options = options;
    this.connection.onnegotiationneeded = () => void this.sendOffer();
    this.connection.onicecandidate = (event) => {
      if (event.candidate !== null) {
        options.sendSignal({ candidate: event.candidate.toJSON() });
      }
    };
    this.connection.ontrack = (event) => this.addRemoteTrack(event.track);
    this.connection.onconnectionstatechange = () => {
      // The network path broke (e.g. Wi-Fi switched). Ask for a new one: this fires
      // negotiationneeded, and the normal offer/answer runs again with fresh candidates.
      if (this.connection.connectionState === "failed") {
        this.connection.restartIce();
      }
    };
    if (options.isInitiator) {
      // One audio and one video slot ("transceiver") from the start, sending and
      // receiving, even before my camera/mic are ready, or if they're off. Adding them
      // fires negotiationneeded, which sends the first offer.
      this.connection.addTransceiver("audio", { direction: "sendrecv" });
      this.connection.addTransceiver("video", { direction: "sendrecv" });
    }
  }

  /**
   * Send this track (or nothing, if null) as my audio or video.
   *
   * If a slot for this kind exists, replaceTrack swaps what goes through it instantly,
   * with no new negotiation. That's how camera on/off, changing devices and (Phase 6)
   * screen sharing work. With no slot yet, addTrack creates one.
   */
  async setLocalTrack(kind: TrackKind, track: MediaStreamTrack | null): Promise<void> {
    const transceiver = this.connection
      .getTransceivers()
      .find((candidate) => candidate.receiver.track.kind === kind);
    if (transceiver === undefined) {
      if (track !== null) {
        this.connection.addTrack(track);
      }
      return;
    }
    // A slot created by the other side's offer starts as receive-only. To send through
    // it too, it must become send-and-receive, which takes one more negotiation.
    if (track !== null && transceiver.direction === "recvonly") {
      transceiver.direction = "sendrecv";
    }
    await transceiver.sender.replaceTrack(track);
  }

  /** A setup message from the other participant. */
  handleSignal(data: SignalData): void {
    this.signalQueue = this.signalQueue
      .then(() => this.applySignal(data))
      .catch((error: unknown) => console.error("WebRTC signal failed", error));
  }

  close(): void {
    this.connection.close();
  }

  private async sendOffer(): Promise<void> {
    try {
      this.isMakingOffer = true;
      // With no argument, setLocalDescription creates the right offer by itself.
      await this.connection.setLocalDescription();
      this.signalLocalDescription();
    } catch (error) {
      console.error("Couldn't create a WebRTC offer", error);
    } finally {
      this.isMakingOffer = false;
    }
  }

  private async applySignal(data: SignalData): Promise<void> {
    if (data.description !== undefined) {
      await this.applyDescription(data.description);
    } else if (data.candidate !== undefined) {
      await this.applyCandidate(data.candidate);
    }
  }

  private async applyDescription(description: RTCSessionDescriptionInit): Promise<void> {
    // "Glare": an offer arrives while we're busy with our own.
    const isOfferCollision =
      description.type === "offer" &&
      (this.isMakingOffer || this.connection.signalingState !== "stable");
    this.isIgnoringOffer = !this.options.isPolite && isOfferCollision;
    if (this.isIgnoringOffer) {
      return; // impolite: our offer wins; theirs will be dropped on their side
    }
    // Polite during a collision: applying their offer automatically rolls ours back.
    await this.connection.setRemoteDescription(description);
    if (description.type === "offer") {
      await this.connection.setLocalDescription(); // creates the answer
      this.signalLocalDescription();
    }
  }

  private async applyCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    try {
      await this.connection.addIceCandidate(candidate);
    } catch (error) {
      // Candidates for an offer we chose to ignore are expected to fail.
      if (!this.isIgnoringOffer) {
        throw error;
      }
    }
  }

  private signalLocalDescription(): void {
    const description = this.connection.localDescription;
    if (description !== null) {
      this.options.sendSignal({ description: description.toJSON() });
    }
  }

  /**
   * Collect their tracks into one stream. A new MediaStream object each time, so
   * React notices the change.
   */
  private addRemoteTrack(track: MediaStreamTrack): void {
    this.remoteStream = new MediaStream([...this.remoteStream.getTracks(), track]);
    this.options.onRemoteStream(this.remoteStream);
  }
}
