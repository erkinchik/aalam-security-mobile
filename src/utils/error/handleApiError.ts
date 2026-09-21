import { AxiosError } from "axios";
import { ru } from "../../locale/ru";

/**
 * Единственная воронка ошибок API. Сервер отдаёт машинный `code`, текст берём из
 * локали; незнакомый код — показываем серверное сообщение, поэтому перевод можно
 * катить по частям.
 */
export const handleApiError = (
  error: unknown,
): { status?: number; code?: string; message: string } => {
  if (error instanceof AxiosError) {
    const status = error.response?.status;
    const data = error.response?.data as
      | { code?: string; message?: string | string[]; error?: string }
      | undefined;
    const serverMessage = Array.isArray(data?.message)
      ? data.message.join(", ")
      : data?.message || data?.error || error.message;
    const localized = data?.code ? ru.errorCodes[data.code] : undefined;
    return { status, code: data?.code, message: localized ?? serverMessage };
  }
  if (error instanceof Error) {
    return { message: error.message };
  }
  return { message: ru.errors.unknownApi };
};
