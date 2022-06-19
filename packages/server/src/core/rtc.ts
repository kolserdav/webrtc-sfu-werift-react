/******************************************************************************************
 * Repository: https://github.com/kolserdav/uyem.git
 * File name: rtc.ts
 * Author: Sergey Kolmiller
 * Email: <uyem.ru@gmail.com>
 * License: BSD-2-Clause
 * License text: Binary distributions of this software include WebRTC and other third-party libraries.
 * Copyright: kolserdav, All rights reserved (c)
 * Create Date: Sun Jun 19 2022 01:46:25 GMT+0700 (Krasnoyarsk Standard Time)
 ******************************************************************************************/
import wrtc from 'wrtc';
import { RTCInterface, MessageType, SendMessageArgs } from '../types/interfaces';
import { log } from '../utils/lib';
import WS from './ws';

class RTC implements RTCInterface {
  public peerConnections: RTCInterface['peerConnections'] = {};
  public readonly delimiter = '_';
  public rooms: Record<string, (string | number)[]> = {};
  public roomCons: Record<string, number | string> = {};
  private ws: WS;
  private streams: Record<string, MediaStream> = {};

  public onAddTrack: RTCInterface['onAddTrack'] = () => {
    /** */
  };

  constructor({ ws }: { ws: WS }) {
    this.ws = ws;
  }

  public getPeerId(
    id: number | string,
    userId: number | string,
    target: number | string,
    connId: string
  ) {
    return `${id}${this.delimiter}${userId}${this.delimiter}${target || 0}${
      this.delimiter
    }${connId}`;
  }

  public createRTC: RTCInterface['createRTC'] = ({ roomId, userId, target, connId }) => {
    const peerId = this.getPeerId(roomId, userId, target, connId);
    this.peerConnections[peerId] = new wrtc.RTCPeerConnection({
      iceServers:
        process.env.NODE_ENV === 'production'
          ? [
              {
                urls: ['stun:stun.l.google.com:19302'],
              },
            ]
          : [],
    });
    return this.peerConnections;
  };

  public handleIceCandidate: RTCInterface['handleIceCandidate'] = ({
    roomId,
    userId,
    target,
    connId,
  }) => {
    const peerId = this.getPeerId(roomId, userId, target, connId);
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const core = this;
    this.peerConnections[peerId].onicecandidate = function handleICECandidateEvent(
      event: RTCPeerConnectionIceEvent
    ) {
      if (event.candidate) {
        log('log', '* Outgoing ICE candidate:', { roomId, userId, target });
        core.ws.sendMessage({
          type: MessageType.CANDIDATE,
          id: roomId,
          data: {
            candidate: event.candidate,
            userId,
            target: 0,
          },
          connId,
        });
      }
    };
    const { ws, rooms, delimiter } = this;
    this.peerConnections[peerId].oniceconnectionstatechange =
      function handleICEConnectionStateChangeEvent() {
        log(
          'log',
          `* ICE connection state changed to: ${core.peerConnections[peerId]?.iceConnectionState}`,
          { peerId }
        );
        if (core.peerConnections[peerId]?.iceConnectionState === 'connected') {
          // Send to all users list of room's guest
          const isRoom = peerId.split(delimiter)[2] === '0';
          if (isRoom) {
            rooms[roomId].forEach((id) => {
              ws.sendMessage({
                type: MessageType.SET_CHANGE_ROOM_GUESTS,
                id,
                data: {
                  roomUsers: rooms[roomId],
                },
                connId,
              });
            });
          }
        }
        switch (core.peerConnections[peerId]?.iceConnectionState) {
          case 'closed':
          case 'failed':
          case 'disconnected':
            core.onClosedCall({ roomId, userId, target, connId: connId });
            break;
        }
      };
    this.peerConnections[peerId].onicegatheringstatechange =
      function handleICEGatheringStateChangeEvent(ev: Event) {
        log(
          'log',
          `*** ICE gathering state changed to: ${core.peerConnections[peerId].iceGatheringState}`,
          { peerId }
        );
      };
    this.peerConnections[peerId].onsignalingstatechange = function handleSignalingStateChangeEvent(
      ev: Event
    ) {
      log(
        'info',
        '! WebRTC signaling state changed to:',
        core.peerConnections[peerId].signalingState
      );
      switch (core.peerConnections[peerId].signalingState) {
        case 'closed':
          core.onClosedCall({ roomId, userId, target, connId });
          break;
      }
    };
    this.peerConnections[peerId].onnegotiationneeded = function handleNegotiationNeededEvent() {
      log('info', '--> Creating offer', { roomId, userId, target });
      core.peerConnections[peerId]
        .createOffer()
        .then((offer): 1 | void | PromiseLike<void> => {
          return core.peerConnections[peerId].setLocalDescription(offer).catch((err) => {
            log('error', 'Error create local description', err);
          });
        })
        .then(() => {
          const { localDescription } = core.peerConnections[peerId];
          if (localDescription) {
            log('info', '---> Sending offer to remote peer', { roomId, userId, target });
            core.ws.sendMessage({
              id: roomId,
              type: MessageType.OFFER,
              data: {
                sdp: localDescription,
                userId,
                target: 0,
              },
              connId,
            });
          }
        });
    };
    this.peerConnections[peerId].ontrack = (e) => {
      const stream = e.streams[0];
      this.streams[peerId] = stream;
      this.onAddTrack(userId, stream);
    };
  };

  public handleCandidateMessage: RTCInterface['handleCandidateMessage'] = (msg, cb) => {
    const {
      id,
      connId,
      data: { candidate, userId, target },
    } = msg;
    let _connId = connId;
    if (target === 0) {
      const peerKeys = Object.keys(this.peerConnections);
      peerKeys.forEach((item) => {
        const peer = item.split(this.delimiter);
        if (peer[1] === userId.toString() && peer[2] === '0') {
          _connId = peer[3];
        }
      });
    }
    const peerId = this.getPeerId(id, userId, target, _connId);
    const cand = new wrtc.RTCIceCandidate(candidate);

    log('info', 'Trying to add ice candidate', {
      peerId,
      d: Object.keys(this.peerConnections).length,
      connId,
      id,
      userId,
      target,
      _connId,
    });
    if (!this.peerConnections[peerId]) {
      return;
    }
    this.peerConnections[peerId]
      .addIceCandidate(cand)
      .then(() => {
        log('log', '!! Adding received ICE candidate:', { userId, id, target });
        if (cb) {
          cb(cand);
        }
      })
      .catch((e) => {
        log('warn', 'Set candidate error', {
          error: e.message,
          connId,
          id,
          userId,
          target,
          state: this.peerConnections[peerId].connectionState,
          ice: this.peerConnections[peerId].iceConnectionState,
        });
        this.ws.sendMessage({
          type: MessageType.SET_ERROR,
          id: userId,
          connId,
          data: {
            message: 'Set candidate error',
          },
        });
        if (cb) {
          cb(null);
        }
      });
  };

  public addUserToRoom({ userId, roomId }: { userId: number | string; roomId: number | string }) {
    if (!this.rooms[roomId]) {
      this.rooms[roomId] = [userId];
    } else if (this.rooms[roomId].indexOf(userId) === -1) {
      this.rooms[roomId].push(userId);
    }
  }

  public handleOfferMessage: RTCInterface['handleOfferMessage'] = (msg, cb) => {
    const {
      id,
      connId,
      data: { sdp, userId, target },
    } = msg;
    if (!sdp) {
      log('warn', 'Message offer error because sdp is:', sdp);
      if (cb) {
        cb(null);
      }
      return;
    }
    // If user call to other guest via new connection with room
    if (target) {
      this.createRTC({
        roomId: id,
        userId,
        target,
        connId,
      });
    }
    const peerId = this.getPeerId(id, userId, target, connId);
    this.handleIceCandidate({
      roomId: id,
      userId,
      target,
      connId,
    });
    const desc = new wrtc.RTCSessionDescription(sdp);
    this.peerConnections[peerId]
      .setRemoteDescription(desc)
      .then(() => {
        log('info', '-> Local video stream obtained', { peerId });
        // If a user creates a new connection with a room to get another user's stream
        if (target) {
          this.streams[peerId].getTracks().forEach((track) => {
            this.peerConnections[peerId].addTrack(track, this.streams[peerId]);
          });
        }
      })
      .then(() => {
        log('info', '--> Creating answer', { peerId });
        this.peerConnections[peerId].createAnswer().then((answ) => {
          if (!answ) {
            log('error', 'Failed set local description for answer.', {
              answ,
            });
            if (cb) {
              cb(null);
            }
            return;
          }
          log('info', '---> Setting local description after creating answer');
          this.peerConnections[peerId]
            .setLocalDescription(answ)
            .catch((err) => {
              log('error', 'Error set local description for answer', err);
            })
            .then(() => {
              const { localDescription } = this.peerConnections[peerId];
              if (localDescription) {
                log('info', 'Sending answer packet back to other peer', {
                  peerId,
                });
                this.ws.sendMessage({
                  id: userId,
                  type: MessageType.ANSWER,
                  data: {
                    sdp: localDescription,
                    userId: id,
                    target,
                  },
                  connId,
                });
                if (cb) {
                  cb(localDescription);
                }
              } else {
                log('warn', 'Failed send answer because localDescription is', localDescription);
              }
            });
        });
      })
      .catch((e) => {
        log('error', 'Failed get user media', e);
        if (cb) {
          cb(null);
        }
      });
  };

  public handleVideoAnswerMsg: RTCInterface['handleVideoAnswerMsg'] = (msg, cb) => {
    const {
      id,
      connId,
      data: { sdp, userId, target },
    } = msg;
    // TODO maybe wrong
    const peerId = this.getPeerId(userId, id, target, connId);
    log('info', '----> Call recipient has accepted our call', { userId, target });
    const desc = new wrtc.RTCSessionDescription(sdp);
    this.peerConnections[peerId]
      .setRemoteDescription(desc)
      .then(() => {
        if (cb) {
          cb(0);
        }
      })
      .catch((e) => {
        log('error', 'Error set description for answer', e);
        if (cb) {
          cb(1);
        }
      });
  };

  public handleGetRoomMessage({
    message,
    port,
  }: {
    message: SendMessageArgs<MessageType.GET_ROOM>;
    port: number;
  }) {
    const {
      data: { userId: uid },
      id,
      connId,
    } = message;
    // Room creatting counter local connection with every user
    const connection = new this.ws.websocket(`ws://localhost:${port}`);
    this.addUserToRoom({
      roomId: id,
      userId: uid,
    });
    this.createRTC({ roomId: id, userId: uid, target: 0, connId });
    connection.onopen = () => {
      // FIXME to sendMEssage
      connection.send(
        JSON.stringify({
          type: MessageType.GET_USER_ID,
          id,
          data: {
            isRoom: true,
          },
          connId: '',
        })
      );
      connection.onmessage = (mess) => {
        const msg = this.ws.parseMessage(mess.data as string);
        if (msg) {
          const { type } = msg;
          switch (type) {
            case MessageType.OFFER:
              this.handleOfferMessage(msg);
              break;
            case MessageType.ANSWER:
              this.handleVideoAnswerMsg(msg);
              break;
            case MessageType.CANDIDATE:
              this.handleCandidateMessage(msg);
              break;
          }
        }
      };
    };
    this.ws.sendMessage({
      type: MessageType.SET_ROOM,
      id,
      data: undefined,
      connId,
    });
  }

  public closeVideoCall: RTCInterface['closeVideoCall'] = ({ roomId, userId, target, connId }) => {
    const peerId = this.getPeerId(roomId, userId, target, connId);
    delete this.streams[peerId];
    log('info', '| Closing the call', { peerId, k: Object.keys(this.peerConnections).length });
    this.peerConnections[peerId].onicecandidate = null;
    this.peerConnections[peerId].oniceconnectionstatechange = null;
    this.peerConnections[peerId].onicegatheringstatechange = null;
    this.peerConnections[peerId].onsignalingstatechange = null;
    this.peerConnections[peerId].onnegotiationneeded = null;
    this.peerConnections[peerId].ontrack = null;
    this.peerConnections[peerId].close();
    delete this.peerConnections[peerId];
  };

  public onClosedCall: RTCInterface['onClosedCall'] = (args) => {
    log('log', 'Call is closed', { ...args });
  };

  public cleanConnections(roomId: string, userId: string) {
    const peerKeys = Object.keys(this.peerConnections);
    peerKeys.forEach((__item) => {
      const peer = __item.split(this.delimiter);
      if (peer[1] === userId.toString()) {
        this.closeVideoCall({
          roomId,
          userId,
          target: peer[2],
          connId: peer[3],
        });
      } else if (peer[2] === userId.toString()) {
        this.closeVideoCall({
          roomId,
          userId: peer[1],
          target: userId,
          connId: peer[3],
        });
      }
    });
  }
}

export default RTC;
