import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ROLES } from '../common/constants';

const DEMO_USERS = [
  { username: 'doctor', password: 'doctor123', role: ROLES.doctor, name: '王主任' },
  { username: 'nurse', password: 'nurse123', role: ROLES.nurse, name: '刘护士' },
  { username: 'admin', password: 'admin123', role: ROLES.admin, name: '系统管理员' },
];

@Injectable()
export class AuthService {
  constructor(private readonly jwtService: JwtService) {}

  login(username: string, password: string) {
    const user = DEMO_USERS.find((item) => item.username === username && item.password === password);
    if (!user) {
      return null;
    }
    const token = this.jwtService.sign({ sub: user.username, role: user.role, name: user.name });
    return { token, user: { username: user.username, role: user.role, name: user.name } };
  }
}
