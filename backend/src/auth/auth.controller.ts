import { Body, Controller, Post, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { APP_MESSAGES } from '../common/constants';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() body: { username: string; password: string }) {
    const result = this.authService.login(body.username, body.password);
    if (!result) {
      throw new UnauthorizedException(APP_MESSAGES.unauthorized);
    }
    return result;
  }
}
