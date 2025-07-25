// mu-auth/src/session/session.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth/auth.service';
import { createHash, randomBytes, createCipheriv, createDecipheriv, scrypt } from 'crypto';
import { promisify } from 'util';

interface SessionData {
  userId: string;
  email: string;
  username: string;
  roles: string[];
  organizations: string[];
  sessionId: string;
  createdAt: number;
  lastActivity: number;
  fingerprint: string;
  source: 'auth' | 'dashboard' | 'api';
}

interface CookieData {
  session: SessionData;
  signature: string;
  expires: number;
}

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);
  private readonly algorithm = 'aes-256-gcm';
  private readonly sessionSecret: string;
  private readonly cookieName = 'smp_session';
  private readonly sessionTTL = 24 * 60 * 60 * 1000; // 24h
  
  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService
  ) {
    this.sessionSecret = this.configService.get<string>('SESSION_SECRET') || this.generateSecret();
  }

  /**
   * Créer une nouvelle session
   */
  async createSession(
    userId: string, 
    fingerprint: string = '', 
    source: SessionData['source'] = 'auth'
  ): Promise<{ sessionData: SessionData; cookie: string }> {
    try {
      // Récupérer les informations utilisateur
      const userInfo = await this.authService.getUserInfo(userId);
      
      if (!userInfo) {
        throw new Error('User not found');
      }

      const now = Date.now();
      const sessionId = this.generateSessionId();
      
      const sessionData: SessionData = {
        userId,
        email: userInfo.email || '',
        username: userInfo.preferred_username || '',
        roles: userInfo.roles || [],
        organizations: userInfo.organization_ids || [],
        sessionId,
        createdAt: now,
        lastActivity: now,
        fingerprint: fingerprint || this.generateFingerprint(),
        source
      };

      const cookie = await this.encryptSessionToCookie(sessionData);
      
      this.logger.log(`Session created for user ${userId} from ${source}`);
      
      return { sessionData, cookie };
      
    } catch (error) {
      this.logger.error(`Failed to create session: ${error.message}`);
      throw error;
    }
  }

  /**
   * Valider et décrypter une session depuis un cookie
   */
  async validateSession(cookieValue: string): Promise<SessionData | null> {
    try {
      if (!cookieValue) {
        return null;
      }

      const sessionData = await this.decryptCookieToSession(cookieValue);
      
      // Vérifier l'expiration
      const now = Date.now();
      if (now - sessionData.lastActivity > this.sessionTTL) {
        this.logger.debug(`Session expired for user ${sessionData.userId}`);
        return null;
      }

      // Vérifier que l'utilisateur existe toujours
      const userInfo = await this.authService.getUserInfo(sessionData.userId);
      if (!userInfo) {
        this.logger.debug(`User not found for session ${sessionData.sessionId}`);
        return null;
      }

      this.logger.debug(`Session validated for user ${sessionData.userId}`);
      return sessionData;
      
    } catch (error) {
      this.logger.error(`Session validation failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Rafraîchir une session
   */
  async refreshSession(sessionData: SessionData): Promise<{ sessionData: SessionData; cookie: string }> {
    const refreshedSession: SessionData = {
      ...sessionData,
      lastActivity: Date.now()
    };

    const cookie = await this.encryptSessionToCookie(refreshedSession);
    
    this.logger.debug(`Session refreshed for user ${sessionData.userId}`);
    
    return { sessionData: refreshedSession, cookie };
  }

  /**
   * Invalider une session
   */
  async invalidateSession(sessionId: string): Promise<void> {
    // Pour l'instant, on ne stocke pas les sessions côté serveur
    // Mais on pourrait ajouter une blacklist Redis ici
    this.logger.log(`Session invalidated: ${sessionId}`);
  }

  /**
   * Invalider toutes les sessions d'un utilisateur
   */
  async invalidateAllUserSessions(userId: string): Promise<void> {
    // Implémenter une blacklist Redis par userId si nécessaire
    this.logger.log(`All sessions invalidated for user: ${userId}`);
  }

  /**
   * Chiffrer les données de session en cookie
   */
  private async encryptSessionToCookie(sessionData: SessionData): Promise<string> {
    try {
      const scryptAsync = promisify(scrypt);
      const key = (await scryptAsync(this.sessionSecret, 'salt', 32)) as Buffer;
      const iv = randomBytes(16);
      const cipher = createCipheriv(this.algorithm, key, iv);

      const sessionJson = JSON.stringify({
        session: sessionData,
        expires: Date.now() + this.sessionTTL,
        signature: this.createSignature(sessionData)
      });

      let encrypted = cipher.update(sessionJson, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const authTag = cipher.getAuthTag();
      
      // Encoder en base64 pour le cookie
      const cookieData = Buffer.from(JSON.stringify({
        encrypted,
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex')
      })).toString('base64');

      return cookieData;
      
    } catch (error) {
      this.logger.error(`Session encryption failed: ${error.message}`);
      throw new Error('Session encryption failed');
    }
  }

  /**
   * Décrypter un cookie en données de session
   */
  private async decryptCookieToSession(cookieValue: string): Promise<SessionData> {
    try {
      const scryptAsync = promisify(scrypt);
      const key = (await scryptAsync(this.sessionSecret, 'salt', 32)) as Buffer;
      
      const cookieData = JSON.parse(Buffer.from(cookieValue, 'base64').toString('utf8'));
      const { encrypted, iv, authTag } = cookieData;
      
      const decipher = createDecipheriv(this.algorithm, key, Buffer.from(iv, 'hex'));
      decipher.setAuthTag(Buffer.from(authTag, 'hex'));
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      const data: CookieData = JSON.parse(decrypted);
      
      // Vérifier la signature
      const expectedSignature = this.createSignature(data.session);
      if (data.signature !== expectedSignature) {
        throw new Error('Invalid session signature');
      }
      
      // Vérifier l'expiration
      if (Date.now() > data.expires) {
        throw new Error('Session expired');
      }
      
      return data.session;
      
    } catch (error) {
      this.logger.error(`Session decryption failed: ${error.message}`);
      throw new Error('Session decryption failed');
    }
  }

  /**
   * Créer une signature pour vérifier l'intégrité
   */
  private createSignature(sessionData: SessionData): string {
    const dataToSign = `${sessionData.userId}:${sessionData.sessionId}:${sessionData.createdAt}`;
    return createHash('sha256')
      .update(dataToSign + this.sessionSecret)
      .digest('hex');
  }

  /**
   * Générer un ID de session unique
   */
  private generateSessionId(): string {
    return randomBytes(32).toString('hex');
  }

  /**
   * Générer un fingerprint de base
   */
  private generateFingerprint(): string {
    return randomBytes(16).toString('hex');
  }

  /**
   * Générer un secret aléatoirement si non fourni
   */
  private generateSecret(): string {
    const secret = randomBytes(32).toString('hex');
    this.logger.warn('No SESSION_SECRET provided, generated one. Please set SESSION_SECRET in production!');
    return secret;
  }

  /**
   * Créer les options du cookie sécurisé
   */
  getCookieOptions(): {
    httpOnly: boolean;
    secure: boolean;
    sameSite: 'strict' | 'lax' | 'none';
    domain: string;
    path: string;
    maxAge: number;
  } {
    const isProduction = this.configService.get('NODE_ENV') === 'production';
    
    return {
      httpOnly: true,
      secure: isProduction, // HTTPS uniquement en production
      sameSite: 'lax', // Permet le partage entre sous-domaines
      domain: this.configService.get('COOKIE_DOMAIN') || '.services.com',
      path: '/',
      maxAge: this.sessionTTL
    };
  }

  /**
   * Obtenir le nom du cookie
   */
  getCookieName(): string {
    return this.cookieName;
  }
}

