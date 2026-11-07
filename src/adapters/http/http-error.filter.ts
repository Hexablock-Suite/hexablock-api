import { STATUS_CODES } from 'node:http';
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { describeThrown } from '../../application/thrown-value.js';
import type { ErrorDto } from './error.dto.js';

const VALIDATION_MESSAGE = 'Request validation failed';
const INTERNAL_MESSAGE = 'Internal server error';

type HttpRequest = { originalUrl?: string; url: string };
type HttpResponse = { status(code: number): { json(body: ErrorDto): void } };

// Turns every exception into the ErrorDto body (API-FR-06).
// An HttpException keeps its status and message. Any other error becomes a
// 500 that hides its message, because that message can hold internal data.
// No part of the body holds the query of the request.
@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpErrorFilter.name);

  catch(error: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<HttpRequest>();
    const url = request.originalUrl ?? request.url;
    const path = pathOf(url);
    const body =
      error instanceof HttpException
        ? fromHttpException(error, path)
        : this.unexpected(error, path);
    const reply = withoutQuery(body, url.slice(path.length));
    http.getResponse<HttpResponse>().status(reply.statusCode).json(reply);
  }

  private unexpected(error: unknown, path: string): ErrorDto {
    // The client never sees the cause, so the log keeps its name, its string
    // code and its frames. The log never keeps the message, because it can
    // quote a value that the client sent. A getter of the error can throw,
    // so a failed log line stops here, and the client still gets the 500.
    try {
      const { name, code, frames } = describeThrown(error);
      this.logger.error(`error=${name}${code === undefined ? '' : ` code=${code}`}`, frames);
    } catch {
      // No source gives a policy for a failed log line, so the filter drops it.
    }
    return errorBody(HttpStatus.INTERNAL_SERVER_ERROR, INTERNAL_MESSAGE, [], path);
  }
}

// The path ends at the first «?» (RFC 3986 §3.3). The query can hold a
// secret, such as a token, and a client can log the error body.
function pathOf(url: string): string {
  const queryStart = url.indexOf('?');
  return queryStart === -1 ? url : url.slice(0, queryStart);
}

// An exception message can quote the request URL. For example, Nest answers
// an unknown route with «Cannot GET <url>». This function removes each copy
// of the query from the message and the details. A query that is only «?»
// holds no data, so the body stays as it is.
function withoutQuery(body: ErrorDto, query: string): ErrorDto {
  if (query.length <= 1) {
    return body;
  }
  const strip = (text: string): string => text.replaceAll(query, '');
  return errorBody(body.statusCode, strip(body.message), body.details.map(strip), body.path);
}

function fromHttpException(error: HttpException, path: string): ErrorDto {
  const status = error.getStatus();
  const message = messageOf(error.getResponse());
  if (Array.isArray(message)) {
    return errorBody(status, VALIDATION_MESSAGE, message.map(String), path);
  }
  return errorBody(status, message ?? error.message, [], path);
}

// Nest puts the message in a string response or in its `message` field.
// A validation pipe gives one message per problem as an array.
function messageOf(response: string | object): string | unknown[] | undefined {
  if (typeof response === 'string') {
    return response;
  }
  const message: unknown = (response as { message?: unknown }).message;
  return typeof message === 'string' || Array.isArray(message) ? message : undefined;
}

function errorBody(statusCode: number, message: string, details: string[], path: string): ErrorDto {
  return {
    statusCode,
    error: STATUS_CODES[statusCode] ?? 'Error',
    message,
    details,
    path,
  };
}
