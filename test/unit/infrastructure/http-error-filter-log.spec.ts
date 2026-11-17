import { type ArgumentsHost, Logger } from '@nestjs/common';
import type { ErrorDto } from '../../../src/adapters/http/error.dto.js';
import { HttpErrorFilter } from '../../../src/adapters/http/http-error.filter.js';

// HttpErrorFilter logs each error that is not an HttpException. The log line
// holds the name of the error, its string code and its stack frames, never
// its message, because a message can quote a value that the client sent.
const PATH = '/probe';

// The 500 body of every error that is not an HttpException.
const INTERNAL_BODY: ErrorDto = {
  statusCode: 500,
  error: 'Internal Server Error',
  message: 'Internal server error',
  details: [],
  path: PATH,
};

interface SentResponse {
  status?: number;
  body?: ErrorDto;
}

// Gives the filter a request on PATH. It records the status and the body
// that the filter sends.
function httpHost(): { host: ArgumentsHost; sent: SentResponse } {
  const sent: SentResponse = {};
  const response = {
    status(code: number) {
      sent.status = code;
      return {
        json(body: ErrorDto) {
          sent.body = body;
        },
      };
    },
  };
  const http = {
    getRequest: () => ({ originalUrl: PATH, url: PATH }),
    getResponse: () => response,
  };
  const host = { switchToHttp: () => http } as unknown as ArgumentsHost;
  return { host, sent };
}

// An error class with its own name, as a database driver throws.
class DriverError extends Error {
  override name = 'DriverError';
}

// The stack of an error with a one-line message, without its first line.
function framesOf(error: Error): string {
  const stack = error.stack ?? '';
  return stack.slice(stack.indexOf('\n') + 1);
}

describe('HttpErrorFilter log', () => {
  const filter = new HttpErrorFilter();
  let logError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logError = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // A domain error can quote a value that the client sent. The log keeps the
  // name of the error and its frames, never its message.
  it('should_log_no_client_value_when_an_unexpected_error_quotes_it', () => {
    const failure = new RangeError('gameId "Hexa Lines" is invalid');
    const { host, sent } = httpHost();

    filter.catch(failure, host);

    expect(sent.status).toBe(500);
    expect(sent.body).toEqual(INTERNAL_BODY);
    expect(logError).toHaveBeenCalledExactlyOnceWith('error=RangeError', framesOf(failure));
    expect(JSON.stringify(logError.mock.calls)).not.toContain('Hexa Lines');
  });

  // A driver or network error gives its operational clue in a string code.
  it('should_log_name_string_code_and_frames_when_an_unexpected_error_has_a_string_code', () => {
    const failure = Object.assign(new DriverError('connect to "Hexa Lines" refused'), {
      code: 'ECONNREFUSED',
    });
    const { host, sent } = httpHost();

    filter.catch(failure, host);

    expect(sent.status).toBe(500);
    expect(sent.body).toEqual(INTERNAL_BODY);
    expect(logError).toHaveBeenCalledExactlyOnceWith(
      'error=DriverError code=ECONNREFUSED',
      framesOf(failure),
    );
    expect(framesOf(failure)).toMatch(/^ {4}at /);
  });

  // The text of a thrown value that is not an Error can quote a value that
  // the client sent, so the log keeps only its type.
  it('should_log_only_the_type_when_an_unexpected_value_is_not_an_error', () => {
    const { host, sent } = httpHost();

    filter.catch('gameId "Hexa Lines" is invalid', host);

    expect(sent.status).toBe(500);
    expect(sent.body).toEqual(INTERNAL_BODY);
    expect(logError).toHaveBeenCalledExactlyOnceWith('error=string', undefined);
  });

  // String() throws a TypeError on an object without a prototype. The log
  // keeps only the type, so the filter needs no text of it.
  it('should_answer_the_same_500_and_log_the_type_when_an_object_without_prototype_is_thrown', () => {
    const { host, sent } = httpHost();

    filter.catch(Object.create(null), host);

    expect(sent.status).toBe(500);
    expect(sent.body).toEqual(INTERNAL_BODY);
    expect(logError).toHaveBeenCalledExactlyOnceWith('error=object', undefined);
  });

  // The filter builds the log line inside a guard. A stack that throws when
  // the filter reads it stops the log line, not the 500 answer.
  it('should_answer_the_same_500_without_a_log_line_when_reading_the_stack_throws', () => {
    const failure = new Error('database is down');
    Object.defineProperty(failure, 'stack', {
      get() {
        throw new Error('stack is unreadable');
      },
    });
    const { host, sent } = httpHost();

    filter.catch(failure, host);

    expect(sent.status).toBe(500);
    expect(sent.body).toEqual(INTERNAL_BODY);
    expect(logError).not.toHaveBeenCalled();
  });

  // A library error, such as an error of the body parser, can carry a client
  // status in `status` or in `statusCode`. The client can send that input at
  // will, so the filter keeps the status, hides the text and writes no log.
  it.each([
    [{ status: 413, expose: true, message: 'request entity too large' }, 413, 'Payload Too Large'],
    [
      { statusCode: 415, expose: true, message: 'unsupported charset "UTF-7"' },
      415,
      'Unsupported Media Type',
    ],
    [{ status: 499, expose: true, message: 'client closed "Hexa Lines"' }, 499, 'Error'],
  ])(
    'should_keep_the_client_status_without_a_log_line_when_an_error_carries_a_4xx_status',
    (fields, status, reason) => {
      const failure = Object.assign(new Error(fields.message), fields);
      const { host, sent } = httpHost();

      filter.catch(failure, host);

      expect(sent.status).toBe(status);
      expect(sent.body).toEqual({
        statusCode: status,
        error: reason,
        message: reason,
        details: [],
        path: PATH,
      });
      expect(logError).not.toHaveBeenCalled();
    },
  );

  // A status outside 400 to 499 is no client error, so the error stays a 500
  // with its log line.
  it.each([503, 399, 413.5, '413'])(
    'should_answer_the_same_500_and_log_it_when_an_error_carries_a_status_that_is_not_4xx',
    (status) => {
      const failure = Object.assign(new DriverError('upstream is down'), {
        status,
        expose: true,
      });
      const { host, sent } = httpHost();

      filter.catch(failure, host);

      expect(sent.status).toBe(500);
      expect(sent.body).toEqual(INTERNAL_BODY);
      expect(logError).toHaveBeenCalledExactlyOnceWith('error=DriverError', framesOf(failure));
    },
  );

  // An internal error can carry a 4xx status, for example the answer of a
  // service that the API calls. Only an exposed error is a client error, so
  // this one stays a 500 with its log line.
  it.each([undefined, false])(
    'should_answer_the_same_500_and_log_it_when_a_4xx_error_is_not_exposed',
    (expose) => {
      const failure = Object.assign(new DriverError('upstream said not found'), {
        status: 404,
        expose,
      });
      const { host, sent } = httpHost();

      filter.catch(failure, host);

      expect(sent.status).toBe(500);
      expect(sent.body).toEqual(INTERNAL_BODY);
      expect(logError).toHaveBeenCalledExactlyOnceWith('error=DriverError', framesOf(failure));
    },
  );
});
