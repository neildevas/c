import * as types from '../constants/ActionTypes';

export const joinedRoom = roomId => ({ type: types.JOINED_ROOM, data: { id: roomId } });
