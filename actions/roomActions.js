import * as types from '../constants/ActionTypes';

export const joinedRoomSuccess = roomId => ({ type: types.JOINED_ROOM_SUCCESS, id: roomId });

export const joinRoom = roomId => ({ type: types.JOIN_ROOM, id: roomId });
