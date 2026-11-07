

export class ErrorResult extends Error {
  statusCode: number;
  messageCode: string | null;

  constructor(
    name = 'API Error',
    statusCode = 500,
    message?: string | Error,
    code: string | null = null
  ) {
    const msg = message instanceof Error ? message.message : String(message ?? '');
    super(msg);
    this.name = name;
    this.statusCode = statusCode;
    this.messageCode = code;
  }

  static result(
    name: string,
    statusCode: number,
    err: string | Error | ErrorResult,
    code: string | null = null
  ): ErrorResult {
    if (err instanceof ErrorResult) {
      return err;
    }
    return new ErrorResult(name, statusCode, err, code);
  }

  static badRequest(message = 'Bad Request', code: string | null = null): ErrorResult {
    return ErrorResult.result('BAD_REQUEST', 400, message, code);
  }

  static unAuthorized(message = 'Unauthorized', code: string | null = null): ErrorResult {
    return ErrorResult.result('UNAUTHORIZED', 401, message, code);
  }

  static forbidden(message = 'Forbidden', code: string | null = null): ErrorResult {
    return ErrorResult.result('FORBIDDEN', 403, message, code);
  }

  static notFound(message = 'Not Found', code: string | null = null): ErrorResult {
    return ErrorResult.result('NOT_FOUND', 404, message, code);
  }

  static conflict(message = 'Conflict', code: string | null = null): ErrorResult {
    return ErrorResult.result('CONFLICT', 409, message, code);
  }

  static internal(err: unknown, code: string | null = null, functionName?: string): ErrorResult {
    if (err instanceof ErrorResult) {
      return err;
    }

    let error: string | Error = err instanceof Error ? err : new Error(String(err));


    if (true) {
      error = 'Internal Server Error';
      code = null;
    }

    return ErrorResult.result('INTERNAL_SERVER_ERROR', 500, error, code);
  }

  static badGateway(message = 'Bad Gateway', code: string | null = null): ErrorResult {
    return ErrorResult.result('BAD_GATEWAY', 502, message, code);
  }

  static unAvailable(message = 'Service Unavailable', code: string | null = null): ErrorResult {
    return ErrorResult.result('SERVICE_UNAVAILABLE', 503, message, code);
  }

  static gatewayTimeout(message = 'Gateway Timeout', code: string | null = null): ErrorResult {
    return ErrorResult.result('GATEWAY_TIMEOUT', 504, message, code);
  }
}
