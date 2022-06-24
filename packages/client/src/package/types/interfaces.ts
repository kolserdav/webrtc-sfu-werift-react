/******************************************************************************************
 * Repository: https://github.com/kolserdav/uyem.git
 * File name: interfaces.ts
 * Author: Sergey Kolmiller
 * Email: <uyem.ru@gmail.com>
 * License: BSD-2-Clause
 * License text: Binary distributions of this software include 'wrtc' and other third-party libraries.
 * Copyright: kolserdav, All rights reserved (c)
 * Create Date: Tue Jun 21 2022 08:50:18 GMT+0700 (Krasnoyarsk Standard Time)
 ******************************************************************************************/
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-namespace */
/* eslint-disable max-classes-per-file */
/* eslint-disable no-unused-vars */

export type SendMessageArgs<T> = Signaling.SendMessageArgs<T>;
export type WSInterface = Signaling.WSInterface;
export type RTCInterface = Connection.RTCInterface;

export enum MessageType {
  GET_USER_ID = 'GET_USER_ID',
  SET_USER_ID = 'SET_USER_ID',
  GET_LOGIN = 'GET_LOGIN',
  TOKEN = 'TOKEN',
  OFFER = 'OFFER',
  CANDIDATE = 'CANDIDATE',
  ANSWER = 'ANSWER',
  GET_ROOM = 'GET_ROOM',
  SET_ROOM = 'SET_ROOM',
  SET_ERROR = 'SET_ERROR',
  GET_ROOM_GUESTS = 'GET_ROOM_GUESTS',
  SET_ROOM_GUESTS = 'SET_ROOM_GUESTS',
  SET_CHANGE_UNIT = 'SET_CHANGE_UNIT',
}

export namespace DataTypes {
  export namespace MessageTypes {
    export type GetRoomGuests = {
      roomId: number | string;
    };
    export type GetGuestId = {
      isRoom?: boolean;
    };
    export type SetChangeRoomUnit = {
      target: number | string;
      eventName: 'delete' | 'add' | 'added';
      roomLenght: number;
    };
    export type SetGuestId = undefined;
    export type GetRoom = {
      userId: number | string;
    };
    export type SetRoomGuests = {
      roomUsers: (number | string)[];
    };
    export type SetRoom = undefined;
    export type SetError = {
      message: string;
      context: SendMessageArgs<any>;
    };
    export type Offer = {
      sdp: RTCSessionDescriptionInit;
      userId: number | string;
      target: number | string;
    };
    export type Candidate = {
      candidate: RTCIceCandidate;
      userId: number | string;
      target: number | string;
    };
    export type Answer = {
      sdp: RTCSessionDescriptionInit;
      userId: number | string;
      target: number | string;
    };
    export type ConnectionId<T> = T extends infer R ? R : never;
  }

  export type ArgsSubset<T> = T extends MessageType.OFFER
    ? DataTypes.MessageTypes.Offer
    : T extends MessageType.ANSWER
    ? DataTypes.MessageTypes.Answer
    : T extends MessageType.CANDIDATE
    ? DataTypes.MessageTypes.Candidate
    : T extends MessageType.GET_USER_ID
    ? DataTypes.MessageTypes.GetGuestId
    : T extends MessageType.SET_USER_ID
    ? DataTypes.MessageTypes.SetGuestId
    : T extends MessageType.GET_ROOM
    ? DataTypes.MessageTypes.GetRoom
    : T extends MessageType.SET_ROOM
    ? DataTypes.MessageTypes.SetRoom
    : T extends MessageType.GET_ROOM_GUESTS
    ? DataTypes.MessageTypes.GetRoomGuests
    : T extends MessageType.SET_ROOM_GUESTS
    ? DataTypes.MessageTypes.SetRoomGuests
    : T extends MessageType.SET_CHANGE_UNIT
    ? DataTypes.MessageTypes.SetChangeRoomUnit
    : T extends MessageType.SET_ERROR
    ? DataTypes.MessageTypes.SetError
    : unknown;
}

export namespace Signaling {
  // eslint-disable-next-line @typescript-eslint/no-shadow
  export interface SendMessageArgs<T> {
    type: T;
    id: number | string;
    data: DataTypes.ArgsSubset<T>;
    connId: DataTypes.MessageTypes.ConnectionId<string>;
  }
  export abstract class WSInterface {
    public abstract connection: any;

    public abstract createConnection(args: any): any;

    public abstract parseMessage(text: string): SendMessageArgs<any> | null;

    public abstract getMessage<T extends keyof typeof MessageType>(
      type: T,
      message: SendMessageArgs<any>
    ): SendMessageArgs<T>;

    public abstract sendMessage: <T extends keyof typeof MessageType>(
      args: SendMessageArgs<T>
    ) => Promise<1 | 0>;
  }
}

export namespace Connection {
  export abstract class RTCInterface {
    public abstract peerConnections: Record<string, RTCPeerConnection | undefined>;

    public readonly delimiter = '_';

    public abstract createRTC(args: {
      connId: string;
      roomId: number | string;
      userId: number | string;
      target: string | number;
    }): Record<number, RTCPeerConnection | undefined>;

    public abstract handleIceCandidate({
      connId,
      roomId,
      userId,
      target,
    }: {
      connId: string;
      roomId: number | string;
      userId: number | string;
      target: string | number;
    }): any;

    public abstract getPeerId(...args: (number | string)[]): string;

    public abstract closeVideoCall({
      connId,
      roomId,
      userId,
      target,
    }: {
      connId: string;
      roomId: number | string;
      userId: number | string;
      target: string | number;
    }): void;

    public abstract onClosedCall({
      connId,
      roomId,
      userId,
      target,
    }: {
      connId: string;
      roomId: number | string;
      userId: number | string;
      target: string | number;
    }): void;

    public abstract handleOfferMessage(
      msg: Signaling.SendMessageArgs<MessageType.OFFER>,
      cb?: (desc: RTCSessionDescription | null) => any
    ): void;

    public abstract handleCandidateMessage(
      msg: Signaling.SendMessageArgs<MessageType.CANDIDATE>,
      cb?: (cand: RTCIceCandidate | null) => any
    ): void;

    public abstract handleVideoAnswerMsg(
      msg: Signaling.SendMessageArgs<MessageType.ANSWER>,
      cb?: (res: 1 | 0) => any
    ): void;
  }
}

export namespace Handlers {
  export type Awaited<T> = T extends PromiseLike<infer U> ? U : T;
}
