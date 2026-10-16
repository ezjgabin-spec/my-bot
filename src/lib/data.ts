import "server-only";
import { localAttemptView, localState, publicAttempt } from "./local-store";

export { publicAttempt };

export async function getState(_userId?: string) {
  void _userId;
  return localState();
}

export async function getAttempt(_userId: string, id: string) {
  void _userId;
  return localAttemptView(id);
}
