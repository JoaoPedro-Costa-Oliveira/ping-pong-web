import type { ErrorCode } from "../../server/src/protocol";

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  INVALID_NAME: "Digite um nome com até 16 caracteres.",
  INVALID_CODE: "O código da sala tem 4 letras/números.",
  ROOM_NOT_FOUND: "Sala não encontrada. Confira o código.",
  ROOM_FULL: "Esta sala já tem dois jogadores.",
  ROOM_ALREADY_STARTED: "Esta partida já começou.",
  SESSION_EXPIRED: "Sua sessão expirou.",
  NOT_IN_ROOM: "Você não está em uma sala.",
};
