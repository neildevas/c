import { JOINED_ROOM_SUCCESS } from '../constants/ActionTypes';

const initialState = {
  id: null
};

export default (state, action) => {
  switch (action.type) {
    case JOINED_ROOM_SUCCESS:
      return {
        ...state,
        id: action.id
      };
    default:
      return state ? state : initialState;
  }
};
