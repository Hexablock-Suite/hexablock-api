// Wrong example: a logging adapter imports a package other than @nestjs/common.
import { JwtService } from '@nestjs/jwt';

export const signer = JwtService;
