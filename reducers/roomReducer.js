import { JOINED_ROOM } from '../constants/ActionTypes';

const initialState = {
  id: null
};

export default (state, action) => {
  switch (action.type) {
    case JOINED_ROOM:
      return {
        ...state,
        id: action.data.id
      };
    default:
      return state ? state : initialState;
  }
};
