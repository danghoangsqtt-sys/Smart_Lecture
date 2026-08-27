import { useCallback, useReducer } from 'react';

export type StateUpdate<T> = T | ((current: T) => T);

interface FieldAction<State extends object> {
  key: keyof State;
  update: StateUpdate<State[keyof State]>;
}

function fieldReducer<State extends object>(state: State, action: FieldAction<State>): State {
  const current = state[action.key];
  const next = typeof action.update === 'function'
    ? (action.update as (value: typeof current) => typeof current)(current)
    : action.update;

  if (Object.is(current, next)) return state;
  return { ...state, [action.key]: next };
}

export function useFieldReducer<State extends object>(initializer: () => State) {
  const [state, dispatch] = useReducer(fieldReducer<State>, undefined, initializer);

  const setField = useCallback(<Key extends keyof State>(key: Key, update: StateUpdate<State[Key]>) => {
    dispatch({ key, update } as FieldAction<State>);
  }, []);

  return [state, setField] as const;
}
