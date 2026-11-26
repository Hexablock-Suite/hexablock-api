// Wrong example: an adapter helper outside http/ and persistence/ imports a package.
import { Injectable } from '@nestjs/common';

export const framework = Injectable;
