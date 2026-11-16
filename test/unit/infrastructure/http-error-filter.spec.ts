import {
  type ArgumentsHost,
  BadRequestException,
  ConflictException,
  HttpException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import type { ErrorDto } from '../../../src/adapters/http/error.dto.js';
import { HttpErrorFilter } from '../../../src/adapters/http/http-error.filter.js';

// API-FR-06: HttpErrorFilter turns every exception into the ErrorDto body.
// These cases have no route that throws them, so the tests call the filter
// with a recorded HTTP response.
const PATH = '/probe';

interface SentResponse {
  status?: number;
  body?: ErrorDto;
}

// Gives the filter a request on url (PATH by default). It records the status
// and the body that the filter sends.
function httpHost(url: string = PATH): { host: ArgumentsHost; sent: SentResponse } {
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
    getRequest: () => ({ originalUrl: url, url }),
    getResponse: () => response,
  };
  const host = { switchToHttp: () => http } as unknown as ArgumentsHost;
  return { host, sent };
}

describe('HttpErrorFilter', () => {
  const filter = new HttpErrorFilter();
  let logError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logError = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ['disk quota exceeded', 'error=string'],
    [undefined, 'error=undefined'],
  ])(
    'should_hide_thrown_value_and_log_it_when_handler_throws_a_value_that_is_not_an_error',
    (thrown, logged) => {
      const { host, sent } = httpHost();

      filter.catch(thrown, host);

      expect(sent.status).toBe(500);
      expect(sent.body).toEqual({
        statusCode: 500,
        error: 'Internal Server Error',
        message: 'Internal server error',
        details: [],
        path: PATH,
      });
      expect(logError).toHaveBeenCalledOnce();
      expect(logError).toHaveBeenCalledWith(logged, undefined);
    },
  );

  it('should_keep_own_message_when_http_exception_has_a_5xx_status', () => {
    const { host, sent } = httpHost();

    filter.catch(new InternalServerErrorException('Level store is offline'), host);

    expect(sent.status).toBe(500);
    expect(sent.body).toEqual({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Level store is offline',
      details: [],
      path: PATH,
    });
    expect(logError).not.toHaveBeenCalled();
  });

  it('should_use_exception_message_when_response_object_has_no_message_field', () => {
    const { host, sent } = httpHost();

    filter.catch(new ConflictException({ reason: 'duplicate', message: 42 }), host);

    expect(sent.status).toBe(409);
    expect(sent.body).toEqual({
      statusCode: 409,
      error: 'Conflict',
      message: 'Conflict Exception',
      details: [],
      path: PATH,
    });
  });

  it('should_name_error_error_when_status_code_has_no_standard_reason_phrase', () => {
    const { host, sent } = httpHost();

    filter.catch(new HttpException('Client closed the request', 499), host);

    expect(sent.status).toBe(499);
    expect(sent.body).toEqual({
      statusCode: 499,
      error: 'Error',
      message: 'Client closed the request',
      details: [],
      path: PATH,
    });
  });

  it('should_list_each_problem_as_text_when_array_message_holds_other_values', () => {
    const { host, sent } = httpHost();

    filter.catch(new BadRequestException([404, true, null, 'name must be a string']), host);

    expect(sent.status).toBe(400);
    expect(sent.body).toEqual({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Request validation failed',
      details: ['404', 'true', 'null', 'name must be a string'],
      path: PATH,
    });
  });

  // An exception can quote the request URL. The query of that URL can hold a
  // secret, so the body keeps no part of it. A row gives the exception and
  // the body that the filter sends.
  const urlWithQuery = `${PATH}?token=secret-value&next=1`;
  it.each([
    [
      new ConflictException(`Level ${urlWithQuery} is locked`),
      {
        statusCode: 409,
        error: 'Conflict',
        message: `Level ${PATH} is locked`,
        details: [],
        path: PATH,
      },
    ],
    [
      new BadRequestException([`Cannot read ${urlWithQuery}`, 'name must be a string']),
      {
        statusCode: 400,
        error: 'Bad Request',
        message: 'Request validation failed',
        details: [`Cannot read ${PATH}`, 'name must be a string'],
        path: PATH,
      },
    ],
  ])(
    'should_remove_the_query_from_message_and_details_when_an_http_exception_quotes_the_url',
    (error, expected) => {
      const { host, sent } = httpHost(urlWithQuery);

      filter.catch(error, host);

      expect(sent.body).toEqual(expected);
      expect(JSON.stringify(sent.body)).not.toContain('token');
    },
  );

  // A message or a detail can quote the URL more than once. The body keeps no
  // copy of the query. One exception fills the message only, and a validation
  // exception fills the details only, so the test uses one of each. A row
  // gives the exception and the body that the filter sends.
  const urlWithSecret = `${PATH}?token=secret-value`;
  it.each([
    [
      new ConflictException(`Move ${urlWithSecret} to ${urlWithSecret}`),
      {
        statusCode: 409,
        error: 'Conflict',
        message: `Move ${PATH} to ${PATH}`,
        details: [],
        path: PATH,
      },
    ],
    [
      new BadRequestException([`Cannot read ${urlWithSecret} or ${urlWithSecret}`]),
      {
        statusCode: 400,
        error: 'Bad Request',
        message: 'Request validation failed',
        details: [`Cannot read ${PATH} or ${PATH}`],
        path: PATH,
      },
    ],
  ])(
    'should_remove_every_copy_of_the_query_when_the_message_quotes_the_url_twice',
    (error, expected) => {
      const { host, sent } = httpHost(urlWithSecret);

      filter.catch(error, host);

      expect(sent.body).toEqual(expected);
      expect(JSON.stringify(sent.body)).not.toContain('secret-value');
    },
  );
});
