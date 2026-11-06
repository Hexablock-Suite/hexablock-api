import {
  BadRequestException,
  type CanActivate,
  Controller,
  type ExecutionContext,
  Get,
  Injectable,
  Param,
  ParseIntPipe,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';

// A test-only guard. It rejects a request with no Authorization header,
// as the real token guard of API-FR-01 will.
@Injectable()
class RequireAuthorizationHeader implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, unknown> }>();
    if (request.headers.authorization === undefined) {
      throw new UnauthorizedException('Missing bearer token');
    }
    return true;
  }
}

// Test-only endpoints. Each one produces one kind of HTTP error, so the
// e2e tests can check that every error gets the same body shape.
@Controller('error-probe')
export class ErrorProbeController {
  @Get('items/:id')
  item(@Param('id', ParseIntPipe) id: number): { id: number } {
    return { id };
  }

  @Get('invalid-fields')
  invalidFields(): never {
    throw new BadRequestException(['name must be a string', 'gameId should not be empty']);
  }

  @Get('protected')
  @UseGuards(RequireAuthorizationHeader)
  protectedResource(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('crash')
  crash(): never {
    throw new Error('database password is hunter2');
  }
}
