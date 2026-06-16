import { Injectable, OnModuleInit, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthTokens } from '@spotiseek/shared';
import { PrismaService } from '../prisma/prisma.service';
import { hashPassword, verifyPassword } from '../common/crypto';

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly log = new Logger('Auth');

  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService) {}

  /** Cria o usuário admin a partir de ADMIN_EMAIL/ADMIN_PASSWORD se ainda não existir. */
  async onModuleInit() {
    const email = process.env.ADMIN_EMAIL || 'admin@spotiseek.local';
    const password = process.env.ADMIN_PASSWORD || 'changeme';
    const count = await this.prisma.user.count();
    if (count === 0) {
      await this.prisma.user.create({ data: { email, passwordHash: hashPassword(password) } });
      this.log.warn(`Usuário admin criado: ${email} (troque a senha em produção)`);
    }
  }

  async login(email: string, password: string): Promise<AuthTokens> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !verifyPassword(password, user.passwordHash)) {
      throw new UnauthorizedException('Credenciais inválidas');
    }
    return this.issue(user.id, user.email);
  }

  async refresh(token: string): Promise<AuthTokens> {
    try {
      const p = this.jwt.verify(token, { secret: process.env.JWT_SECRET || 'dev-jwt-secret' });
      return this.issue(p.sub, p.email);
    } catch {
      throw new UnauthorizedException('Refresh inválido');
    }
  }

  async me(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    return u ? { id: u.id, email: u.email, role: u.role } : null;
  }

  private issue(sub: string, email: string): AuthTokens {
    const secret = process.env.JWT_SECRET || 'dev-jwt-secret';
    return {
      accessToken: this.jwt.sign({ sub, email }, { secret, expiresIn: '12h' }),
      refreshToken: this.jwt.sign({ sub, email, t: 'r' }, { secret, expiresIn: '30d' }),
    };
  }
}
