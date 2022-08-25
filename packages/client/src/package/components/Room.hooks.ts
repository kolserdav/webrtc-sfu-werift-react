/******************************************************************************************
 * Repository: https://github.com/kolserdav/werift-sfu-react.git
 * File name: Room.hooks.ts
 * Author: Sergey Kolmiller
 * Email: <uyem.ru@gmail.com>
 * License: MIT
 * License text: See in LICENSE file
 * Copyright: kolserdav, All rights reserved (c)
 * Create Date: Wed Aug 24 2022 14:14:09 GMT+0700 (Krasnoyarsk Standard Time)
 ******************************************************************************************/
/* eslint-disable no-case-declarations */
import { useEffect, useState, useMemo, useCallback } from 'react';
import WS from '../core/ws';
import RTC from '../core/rtc';
import { getCodec, log } from '../utils/lib';
import { getWidthOfItem } from './Room.lib';
import { LocaleClient, MessageType, SendMessageArgs } from '../types/interfaces';
import { Stream } from '../types';
import s from './Room.module.scss';
import c from './ui/CloseButton.module.scss';
import storeStreams, { changeStreams } from '../store/streams';
import { START_DELAY, SPEAKER_LEVEL } from '../utils/constants';

// eslint-disable-next-line import/prefer-default-export
export const useConnection = ({
  id,
  roomId,
  iceServers,
  server,
  port,
  cleanAudioAnalyzer,
  locale,
}: {
  id: number | string;
  roomId: number | string | null;
  iceServers: RTCConfiguration['iceServers'];
  server: string;
  port: string;
  cleanAudioAnalyzer: (uid: string | number) => void;
  locale: LocaleClient;
}) => {
  const [streams, setStreams] = useState<Stream[]>([]);
  const [shareScreen, setShareScreen] = useState<boolean>(false);
  const [localShareScreen, setLocalShareScreen] = useState<boolean>(false);
  const [selfStream, setSelfStream] = useState<Stream | null>(null);
  const [roomIsSaved, setRoomIsSaved] = useState<boolean>(false);
  const [lenght, setLenght] = useState<number>(streams.length);
  const [muted, setMuted] = useState<boolean>(false);
  const [muteds, setMuteds] = useState<string[]>([]);
  const [video, setVideo] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [connectionId, setConnectionId] = useState<string>('');
  const ws = useMemo(
    () => new WS({ shareScreen: localShareScreen, server, port }),
    [localShareScreen, server, port]
  );
  const rtc = useMemo(() => new RTC({ ws }), [ws]);
  const screenShare = useMemo(
    () => (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
      setShareScreen(!shareScreen);
    },
    [shareScreen]
  );

  const changeMuted = () => {
    if (!roomId) {
      return;
    }
    const _muted = !muted;
    setMuted(_muted);
    ws.sendMessage({
      type: MessageType.GET_MUTE,
      id: ws.userId,
      connId: '',
      data: {
        muted: !muted,
        roomId,
      },
    });
    if (rtc.localStream) {
      rtc.localStream.getAudioTracks()[0].enabled = !_muted;
    }
  };

  const changeVideo = () => {
    if (rtc.localStream) {
      const _video = !video;
      setVideo(_video);
      rtc.localStream.getVideoTracks()[0].enabled = _video;
    }
  };

  /**
   * Change media source
   */
  useEffect(() => {
    if (!roomId) {
      return;
    }
    if (localShareScreen !== shareScreen) {
      if (selfStream) {
        rtc.localStream = null;
        rtc.closeAllConnections();
        ws.connection.close();
        setLocalShareScreen(shareScreen);
        setRoomIsSaved(false);
        storeStreams.dispatch(changeStreams({ type: 'clean', stream: selfStream }));
        rtc.roomLength = 0;
        setLenght(0);
        setSelfStream(null);
      } else {
        log('warn', 'Change media source. Self stream is:', selfStream);
      }
    }
  }, [shareScreen, localShareScreen, roomId, rtc, ws, selfStream]);

  /**
   * Set streams from store
   */
  useEffect(() => {
    const cleanSubs = storeStreams.subscribe(() => {
      const state = storeStreams.getState();
      setStreams(state.streams);
    });
    return () => {
      cleanSubs();
    };
  }, []);

  /**
   * Connections handlers
   */
  useEffect(() => {
    if (!roomId) {
      return () => {
        /** */
      };
    }
    if (!ws.userId) {
      ws.setUserId(id);
    }

    const removeStreamHandler = ({
      data: { roomId: _roomId, target: _target },
      connId: _connId,
    }: SendMessageArgs<MessageType.SET_CLOSE_PEER_CONNECTION>) => {
      const peerId = rtc.getPeerId(_roomId, _target, _connId);
      cleanAudioAnalyzer(_target);
      const _stream = streams.find((item) => item.target === _target);
      if (_stream) {
        storeStreams.dispatch(changeStreams({ type: 'delete', stream: _stream }));
      } else {
        log('warn', 'Close call without stream', { peerId });
      }
    };

    const lostStreamHandler: typeof rtc.lostStreamHandler = ({ connId, target, eventName }) => {
      if (!roomId) {
        return;
      }
      let _connId = connId;
      Object.keys(rtc.peerConnections).forEach((item) => {
        const peer = item.split(rtc.delimiter);
        if (peer[1] === target.toString()) {
          // eslint-disable-next-line prefer-destructuring
          _connId = peer[2];
        }
      });
      rtc.closeVideoCall({ roomId, userId: ws.userId, target, connId: _connId });
      ws.sendMessage({
        type: MessageType.GET_CLOSE_PEER_CONNECTION,
        connId: _connId,
        id: ws.userId,
        data: {
          roomId,
          target,
        },
      });
    };

    rtc.lostStreamHandler = lostStreamHandler;

    const addStream = ({
      target,
      stream,
      connId,
      change = false,
    }: {
      target: string | number;
      stream: MediaStream;
      connId: string;
      change?: boolean;
    }) => {
      const _stream: Stream = {
        target,
        stream,
        connId,
        ref: (node) => {
          if (node) {
            // eslint-disable-next-line no-param-reassign
            node.srcObject = stream;
          }
        },
      };
      storeStreams.dispatch(changeStreams({ type: 'add', stream: _stream, change }));
      if (!selfStream && target === ws.userId) {
        setSelfStream(_stream);
      }
      log('info', 'Add stream', { _stream });
    };

    /**
     * 'add' send server/main.js and 'added' listen on Room.hooks.ts
     */
    const changeRoomUnitHandler = ({
      id: userId,
      data: { target, eventName, roomLength, muteds: _muteds },
      connId,
    }: SendMessageArgs<MessageType.SET_CHANGE_UNIT>) => {
      if (lenght !== roomLength) {
        setLenght(roomLength);
      }
      rtc.muteds = _muteds;
      setMuteds(_muteds);
      switch (eventName) {
        case 'add':
        case 'added':
          if (userId !== target) {
            log('info', 'Change room unit handler', {
              userId,
              target,
              roomLength,
              connId,
              eventName,
            });
            rtc.createPeerConnection({
              roomId,
              target,
              userId: id,
              connId,
              onTrack: ({ addedUserId, stream }) => {
                log('info', 'Added unit track', { addedUserId, s: stream.id, connId });
                addStream({ target: addedUserId, stream, connId });
              },
              iceServers,
              eventName: 'back',
            });
            rtc.addTracks({ roomId, userId, target, connId, locale }, (e) => {
              if (!e) {
                if (eventName !== 'added' && target !== userId) {
                  ws.sendMessage({
                    type: MessageType.SET_CHANGE_UNIT,
                    id: target,
                    connId,
                    data: {
                      target: userId,
                      roomLength,
                      eventName: 'added',
                      muteds: _muteds,
                    },
                  });
                }
              }
            });
          }
          break;
        case 'delete':
          log('info', 'Need delete user', {
            roomId,
            target,
            userId,
            connId,
            k: Object.keys(rtc.peerConnections),
          });
          rtc.closeVideoCall({ roomId, target, userId, connId });
          const _stream = streams.find((item) => item.target === target);
          if (_stream) {
            storeStreams.dispatch(changeStreams({ type: 'delete', stream: _stream }));
          }
          break;
      }
    };

    const changeMuteHandler = (args: SendMessageArgs<MessageType.SET_MUTE>) => {
      const {
        data: { muteds: _muteds },
      } = args;
      rtc.muteds = _muteds;
      setMuteds(_muteds);
    };

    const needReconnectHandler = ({
      data: { userId },
      connId,
    }: SendMessageArgs<MessageType.GET_NEED_RECONNECT>) => {
      lostStreamHandler({
        connId,
        target: userId,
        eventName: 'need-reconnect',
      });
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const changeRoomGuestsHandler = async ({
      rawMessage,
    }: {
      rawMessage: SendMessageArgs<MessageType.SET_ROOM_GUESTS>;
    }) => {
      if (!roomId) {
        return;
      }
      const {
        data: { roomUsers, muteds: _muteds },
        connId,
      } = ws.getMessage(MessageType.SET_ROOM_GUESTS, rawMessage);
      rtc.muteds = _muteds;
      const _streams: Stream[] = storeStreams.getState().streams as Stream[];
      log('info', 'Run change room gusets handler', {
        roomUsers,
        id,
        st: _streams.map((i) => i.target),
      });
      rtc.roomLength = roomUsers.length;
      setLenght(roomUsers.length);
      setMuteds(_muteds);
      roomUsers.forEach((item) => {
        if (item !== id) {
          const _isExists = _streams.filter((_item) => item === _item.target);
          if (!_isExists[0]) {
            log('info', `Check new user ${item}`, { uid: id });
            rtc.createPeerConnection({
              roomId,
              target: item,
              userId: id,
              connId,
              onTrack: ({ addedUserId, stream }) => {
                addStream({ target: addedUserId, stream, connId });
              },
              iceServers,
              eventName: 'check',
            });
            rtc.addTracks({ roomId, userId: id, target: item, connId, locale }, (e) => {
              if (e) {
                log('warn', 'Failed add tracks', { roomId, userId: id, target: item, connId });
                return;
              }
              log('info', 'Change room guests connection', {
                roomId,
                target: item,
                userId: id,
                connId,
              });
            });
          }
        } else if (!streams.find((_item) => _item.target === ws.userId)) {
          const __streams = streams.map((_item) => _item);
          if (selfStream) {
            storeStreams.dispatch(changeStreams({ type: 'add', stream: selfStream }));
          } else {
            log('warn', 'Self stream is not defined', { __streams });
          }
        }
      });
      // Remove disconnected
      streams.forEach((item) => {
        const isExists = roomUsers.filter((_item) => _item === item.target);
        if (!isExists[0]) {
          Object.keys(rtc.peerConnections).forEach((__item) => {
            const peer = __item.split(rtc.delimiter);
            if (peer[1] === item.target) {
              streams.forEach((i, index) => {
                if (i.target === item.target) {
                  storeStreams.dispatch(changeStreams({ type: 'delete', stream: i }));
                }
              });
              rtc.closeVideoCall({
                roomId,
                userId: id,
                target: item.target,
                connId: peer[2],
              });
            }
          });
        }
        return isExists[0] !== undefined;
      });
    };
    ws.onOpen = () => {
      setTimeout(() => {
        ws.sendMessage({
          type: MessageType.GET_USER_ID,
          id,
          data: {},
          connId: '',
        });
      }, START_DELAY);
    };
    ws.onMessage = (ev) => {
      const { data } = ev;
      const rawMessage = ws.parseMessage(data);
      if (!rawMessage) {
        return;
      }
      const { type, connId } = rawMessage;
      switch (type) {
        case MessageType.SET_USER_ID:
          /**
           * Connect to room
           */
          setConnectionId(connId);
          rtc.connId = connId;
          ws.sendMessage({
            type: MessageType.GET_ROOM,
            id: roomId,
            data: {
              userId: id,
              mimeType: getCodec(),
            },
            connId,
          });
          break;
        case MessageType.CANDIDATE:
          rtc.handleCandidateMessage(rawMessage);
          break;
        case MessageType.SET_ROOM_GUESTS:
          changeRoomGuestsHandler({ rawMessage });
          break;
        case MessageType.SET_CLOSE_PEER_CONNECTION:
          removeStreamHandler(rawMessage);
          break;
        case MessageType.SET_MUTE:
          changeMuteHandler(ws.getMessage(MessageType.SET_MUTE, rawMessage));
          break;
        case MessageType.ANSWER:
          rtc.handleVideoAnswerMsg(rawMessage);
          break;
        case MessageType.SET_ROOM:
          setRoomIsSaved(true);
          rtc.createPeerConnection({
            userId: ws.userId,
            target: 0,
            connId,
            roomId,
            onTrack: ({ addedUserId, stream }) => {
              log('info', '-> Added local stream to room', { addedUserId, id });
            },
            iceServers,
            eventName: 'first',
          });
          rtc.addTracks({ userId: ws.userId, roomId, connId, target: 0, locale }, (e, stream) => {
            if (!e) {
              addStream({ target: ws.userId, stream, connId });
            } else if (localShareScreen) {
              ws.shareScreen = false;
              setLocalShareScreen(false);
              setShareScreen(false);
              ws.onOpen = () => {
                ws.sendMessage({
                  type: MessageType.GET_USER_ID,
                  id,
                  data: {},
                  connId: '',
                });
              };
            }
          });
          break;
        case MessageType.GET_NEED_RECONNECT:
          needReconnectHandler(rawMessage);
          break;
        case MessageType.SET_CHANGE_UNIT:
          changeRoomUnitHandler(ws.getMessage(MessageType.SET_CHANGE_UNIT, rawMessage));
          break;
        case MessageType.SET_ERROR:
          const {
            data: { message },
          } = ws.getMessage(MessageType.SET_ERROR, rawMessage);
          setError(message);
          log('warn', 'error', message);
          break;
        default:
      }
    };
    ws.onError = (e) => {
      log('error', 'Ws error', e);
    };
    ws.onClose = (e) => {
      log('warn', 'Ws close', e);
    };
    return () => {
      ws.onOpen = () => {
        /** */
      };
      ws.onMessage = () => {
        /** */
      };
      ws.onError = () => {
        /** */
      };
      ws.onClose = () => {
        /** */
      };
    };
  }, [
    cleanAudioAnalyzer,
    roomId,
    streams,
    ws,
    rtc,
    id,
    roomIsSaved,
    lenght,
    selfStream,
    iceServers,
    localShareScreen,
    rtc.lostStreamHandler,
  ]);

  /**
   * Check room list
   */
  useEffect(() => {
    if (!roomId) {
      return () => {
        //
      };
    }
    let interval = setTimeout(() => {
      //
    });
    let _streams: Stream[] = storeStreams.getState().streams as Stream[];
    interval = setInterval(() => {
      _streams = storeStreams.getState().streams as Stream[];
      if (_streams.length !== lenght && ws.connection.readyState) {
        ws.sendMessage({
          type: MessageType.GET_ROOM_GUESTS,
          id,
          connId: connectionId,
          data: {
            roomId,
          },
        });
      }
    }, 1000);

    return () => {
      clearTimeout(interval);
    };
  }, [roomId, ws, lenght, streams, connectionId, id, shareScreen]);

  return {
    streams,
    lenght,
    ws,
    rtc,
    lostStreamHandler: rtc.lostStreamHandler,
    screenShare,
    shareScreen,
    muted,
    changeMuted,
    muteds,
    video,
    changeVideo,
    error,
  };
};

export const useVideoDimensions = ({
  lenght,
  container,
}: {
  lenght: number;
  container: HTMLDivElement | null;
}) => {
  let time = 0;
  return useCallback(
    (e: React.SyntheticEvent<HTMLVideoElement, Event>, stream: MediaStream) => {
      time++;
      if (time % 5 === 0) {
        requestAnimationFrame(() => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { target }: { target: HTMLVideoElement } = e as any;
          const isFull = target.getAttribute('data') === 'full';
          const _container = !isFull ? container : (target.parentElement as HTMLDivElement);
          if (_container) {
            const { clientHeight, clientWidth } = _container;
            const { videoHeight, videoWidth } = target;
            const coeff = videoWidth / videoHeight;
            const { width, cols, rows } = getWidthOfItem({
              lenght,
              container: _container,
              coeff: videoWidth / videoHeight,
            });
            // Change track constraints
            stream.getVideoTracks().forEach((item) => {
              const oldWidth = item.getConstraints().width;
              if (oldWidth !== width) {
                let _width = width;
                let _height = width;
                if (coeff >= 1) {
                  _height = Math.floor(width / coeff);
                  if (isFull) {
                    _height =
                      clientWidth > clientHeight * coeff
                        ? clientHeight
                        : Math.floor(clientWidth / coeff);
                    _width = Math.floor(_height * coeff);
                  }
                  target.setAttribute('width', _width.toString());
                  target.setAttribute('height', _height.toString());
                } else {
                  _width = Math.floor(width * coeff);
                  if (isFull) {
                    _width =
                      clientHeight > clientWidth / coeff
                        ? clientWidth
                        : Math.floor(clientHeight * coeff);
                    _height = Math.floor(_width / coeff);
                  }
                  target.setAttribute('width', _width.toString());
                  target.setAttribute('height', _height.toString());
                }
                target.parentElement?.parentElement?.setAttribute(
                  'style',
                  `grid-template-columns: repeat(${cols}, auto);
                  grid-template-rows: repeat(${rows}, auto);
                  transition: width 0.3s ease-in`
                );
                item
                  .applyConstraints(coeff < 1 ? { height: _height } : { width: _width })
                  .then(() => {
                    log('log', 'Constraints changed', {
                      width,
                      oldWidth,
                    });
                  })
                  .catch((error) => {
                    log('log', 'Constraints not changed', {
                      error,
                      width: _width,
                      height: _height,
                      oldWidth,
                    });
                  });
              }
            });
          }
        });
      }
    },
    [lenght, container, time]
  );
};

export const useOnclickClose =
  ({ lenght, container }: { lenght: number; container: HTMLDivElement | null }) =>
  (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    if (container) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { target }: any = e;
      const { nodeName } = target;
      const button: HTMLButtonElement =
        nodeName === 'path'
          ? target.parentElement?.parentElement
          : nodeName === 'svg'
          ? target.parentElement
          : target;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const video: HTMLVideoElement = button.nextElementSibling as any;
      const { videoWidth, videoHeight } = video;
      const { width } = getWidthOfItem({ lenght, container, coeff: videoWidth / videoHeight });
      const coeff = videoWidth / videoHeight;
      const height = width / coeff;
      video.parentElement?.classList.remove(s.video__fixed);
      button.classList.remove(c.open);
      video.setAttribute('data', '');
      video.setAttribute('width', width.toString());
      video.setAttribute('height', height.toString());
    }
  };

export const usePressEscape = () => (e: React.KeyboardEvent<HTMLDivElement>) => {
  /** TODO */
};

export const useVideoStarted = ({
  roomId,
  streams,
  ws,
  rtc,
  container,
  lostStreamHandler,
}: {
  roomId: string | number;
  streams: Stream[];
  ws: WS;
  rtc: RTC;
  container: HTMLDivElement | null;
  lostStreamHandler: typeof rtc.lostStreamHandler;
}) => {
  const [played, setPlayed] = useState<Record<string, boolean>>({});
  const [timeStart, setTimeStart] = useState<boolean>(false);
  const [attempts, setAttempts] = useState<Record<string | number, number>>({});

  /**
   * Clean played
   */
  useEffect(() => {
    if (!timeStart) {
      setTimeStart(true);
      const _played = { ...played };
      streams.forEach((item) => {
        _played[item.target] = false;
      });
      setPlayed(_played);
    }
  }, [streams, timeStart, played]);

  /**
   * Check not played
   */
  useEffect(() => {
    let mounted = true;
    const timeout = setInterval(() => {
      if (timeStart) {
        const diffs: Stream[] = [];
        if (Object.keys(played).length === streams.length) {
          streams.forEach((item) => {
            const that = Object.keys(played).find(
              (_item) => _item === item.target.toString() && !played[_item]
            );
            if (that) {
              diffs.push(item);
            }
          });
        } else {
          streams.forEach((item) => {
            const that = Object.keys(played).find((_item) => _item === item.target.toString());
            if (!that) {
              diffs.push(item);
            }
          });
        }
        const _attempts = { ...attempts };
        diffs.forEach((item) => {
          if (!_attempts[item.target]) {
            _attempts[item.target] = 0;
          }
          if (_attempts[item.target] === 1) {
            if (!played[item.target] && mounted) {
              lostStreamHandler({ ...item, eventName: 'not-played' });
              log('error', `Video not played ${item.target}`, {
                target: item.target,
                streamL: item.stream.getTracks().length,
              });
            }
          } else {
            log('info', `${_attempts[item.target]} attempts of restart:`, { target: item.target });
            if (_attempts[item.target] === 5) {
              // _attempts[item.target] = 0;
            }
          }

          if (_attempts[item.target] !== undefined) {
            _attempts[item.target] += 1;
          } else {
            _attempts[item.target] = 1;
          }
        });
        setAttempts(_attempts);
      }
    }, 2000);
    return () => {
      clearInterval(timeout);
      mounted = false;
    };
  }, [played, streams, lostStreamHandler, attempts, ws, timeStart, rtc.muteds, rtc.roomLength]);

  return { played, setPlayed };
};

const analyzer: Record<string, AnalyserNode[]> = {};
const freqs: Record<string, Uint8Array[]> = {};
const audioLevels: Record<string, number> = {};

export const useAudioAnalyzer = () => {
  const [speaker, setSpeaker] = useState<string | number>(0);
  const createAudioAnalyzer = (item: Stream) => {
    const audioContext = new AudioContext();
    const audioSource = audioContext.createMediaStreamSource(item.stream);
    const audioGain = audioContext.createGain();
    const audioChannelSplitter = audioContext.createChannelSplitter(audioSource.channelCount);
    audioSource.connect(audioGain);
    audioGain.connect(audioChannelSplitter);
    audioGain.connect(audioContext.destination);
    analyzer[item.target] = [];
    freqs[item.target] = [];
    for (let i = 0; i < audioSource.channelCount; i++) {
      analyzer[item.target][i] = audioContext.createAnalyser();
      analyzer[item.target][i].minDecibels = -100;
      analyzer[item.target][i].maxDecibels = 0;
      analyzer[item.target][i].smoothingTimeConstant = 0.8;
      analyzer[item.target][i].fftSize = 32;
      freqs[item.target][i] = new Uint8Array(analyzer[item.target][i].frequencyBinCount);
      audioChannelSplitter.connect(analyzer[item.target][i], i, 0);
    }
  };

  const analyzeSoundLevel = (uid: string | number) => {
    if (analyzer[uid]) {
      for (let i = 0; i < analyzer[uid].length; i++) {
        analyzer[uid][i].getByteFrequencyData(freqs[uid][i]);
        let level = 0;
        freqs[uid][i].forEach((item) => {
          level = Math.max(level, item);
        });
        audioLevels[uid] = level / 256;
      }
    }
  };

  const cleanAudioAnalyzer = (uid: string | number) => {
    if (analyzer[uid]) {
      delete analyzer[uid];
    } else {
      log('warn', 'Audio analyzer not found', uid);
    }
    if (freqs[uid]) {
      delete freqs[uid];
    } else {
      log('warn', 'Audio analyzer freqs not found', uid);
    }
    if (audioLevels[uid]) {
      delete audioLevels[uid];
    } else {
      log('warn', 'Audio analyzer levels not found', uid);
    }
  };

  /**
   * Compare audio levels
   */
  useEffect(() => {
    const timeout = setInterval(() => {
      const audioLevelsArr: { uid: string | number; level: number }[] = [];
      const keys = Object.keys(audioLevels);
      for (let i = 0; keys[i]; i++) {
        audioLevelsArr.push({
          uid: keys[i],
          level: audioLevels[keys[i]],
        });
      }
      const target = audioLevelsArr.sort((a, b) => {
        if (a.level < b.level) {
          return 1;
        }
        return -1;
      });
      if (target[0]) {
        let _speaker: number | string = 0;
        if (target[0].level >= SPEAKER_LEVEL) {
          _speaker = target[0].uid;
        }
        setSpeaker(_speaker);
      }
    }, 1000);
    return () => {
      clearInterval(timeout);
    };
  }, []);

  return { analyzeSoundLevel, createAudioAnalyzer, cleanAudioAnalyzer, speaker };
};
