import { randomBytes, createHash, timingSafeEqual } from 'crypto';
import {
  MagicLinkService,
  PasswordlessAuthService,
  MagicLinkRequest,
  MagicLink,
  MagicLinkResult,
  MagicLinkVerificationResult,
  MagicLinkStatus,
  PasswordlessAuthRequest,
  PasswordlessAuthResult,
  MFAEventCallback,
  MFAEventType,
  MFAEvent
} from '../interface/mfa.interface.js';
import { UserId, CorrelationId } from '../interface/common.js';
import { RedisClient } from '../interface/redis.interface.js';
import { KeycloakClient, UserInfo, AuthResponse } from '../interface/auth.interface.js';
import { EmailService, EmailResult } from '../interface/email.interface.js';
import { MagicLinkConfigImpl, loadMagicLinkConfig } from '../config/magic-link.config.js';
import { EmailServiceImpl } from './email.service.js';
import { TwilioProvider } from '../providers/email/twilio.provider.js';

export class MagicLinkServiceImpl implements MagicLinkService, PasswordlessAuthService {
  private readonly redisClient: RedisClient;
  private readonly keycloakClient: KeycloakClient;
  private readonly config: MagicLinkConfigImpl;
  private readonly emailService: EmailService;
  private eventCallbacks: Map<MFAEventType, MFAEventCallback[]> = new Map();

  constructor(
    redisClient: RedisClient,
    keycloakClient: KeycloakClient,
    config?: Partial<MagicLinkConfigImpl>
  ) {
    this.redisClient = redisClient;
    this.keycloakClient = keycloakClient;
    this.config = loadMagicLinkConfig(config);
    
    this.emailService = this.createEmailService();
    
    console.log('✅ Enhanced Magic Link Service initialized with', this.config.email.provider);
  }

  private createEmailService(): EmailService {
    const emailService = new EmailServiceImpl();
    
    switch (this.config.email.provider) {
      case 'twilio':
        const twilioProvider = new TwilioProvider(this.config.email.config);
        emailService.registerProvider('twilio', twilioProvider);
        emailService.setDefaultProvider('twilio');
        break;

      default:
        throw new Error(`Unsupported email provider: ${this.config.email.provider}`);
    }
    
    return emailService;
  }

  async getMagicLinkConfig(): Promise<MagicLinkConfigImpl> {
    return this.config;
  }

  async updateMagicLinkConfig(config: Partial<MagicLinkConfigImpl>): Promise<void> {
    Object.assign(this.config, config);
  }

  async generateMagicLink(request: MagicLinkRequest): Promise<MagicLinkResult> {
    try {
      console.log(`🔗 Generating magic link for ${request.email}, action: ${request.context?.action || 'login'}`);
      
      await this.checkDailyLimit(request.email);

      let userId: UserId | undefined;
      const existingUser = await this.keycloakClient.getUserByEmail(request.email);
      
      if (existingUser) {
        userId = existingUser.id;
        console.log(`👤 Existing user found: ${userId}`);
      } else if (this.config.requireExistingUser) {
        console.log(`❌ User not found and registration disabled`);
        return {
          success: false,
          message: 'User not found. Please register first.'
        };
      } else {
        console.log(`👤 New user - will be created if magic link is used`);
      }

      await this.revokeExistingLinks(request.email);

      const token = this.generateSecureToken();
      const linkId = this.generateId();
      const now = new Date();
      const expiresAt = new Date(now.getTime() + this.config.expiryMinutes! * 60 * 1000);

      const magicLink: MagicLink = {
        id: linkId,
        token,
        email: request.email,
        userId,
        status: 'pending',
        action: request.context?.action || 'login',
        createdAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
        redirectUrl: this.buildRedirectUrl(request),
        metadata: {
          ip: request.context?.ip,
          userAgent: request.context?.userAgent,
          deviceFingerprint: request.context?.deviceFingerprint,
          correlationId: this.generateCorrelationId()
        }
      };

      // Stocker le lien
      await this.storeMagicLink(magicLink);

      // Incrémenter le compteur quotidien
      await this.incrementDailyCounter(request.email);

      // Envoyer l'email avec le provider configuré
      const emailResult = await this.sendMagicLinkEmail(magicLink);

      await this.emitEvent({
        type: 'magic_link_generated',
        userId: userId || 'anonymous',
        data: {
          correlationId: magicLink.metadata?.correlationId,
          email: request.email,
          action: magicLink.action,
          emailSent: emailResult.success
        }
      });

      return {
        success: true,
        linkId,
        message: emailResult.success 
          ? 'Magic link sent successfully' 
          : `Magic link generated but email failed: ${emailResult.error}`,
        expiresAt: expiresAt.toISOString(),
        emailSent: emailResult.success
      };

    } catch (error) {
      console.error('❌ Failed to generate magic link:', error);
      return {
        success: false,
        message: `Failed to generate magic link: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  private async sendMagicLinkEmail(magicLink: MagicLink): Promise<EmailResult> {
    try {
      console.log(`📧 Sending magic link email to ${magicLink.email} via ${this.config.email.provider}`);
      
      const magicLinkUrl = this.buildMagicLinkUrl(magicLink);
      
      const emailResult = await this.emailService.sendMagicLink(
        magicLink.email,
        magicLink.token,
        {
          redirectUrl: magicLink.redirectUrl,
          action: magicLink.action,
          expiresAt: magicLink.expiresAt,
          userAgent: magicLink.metadata?.userAgent,
          ip: magicLink.metadata?.ip,
          provider: this.config.email.provider
        }
      );

      if (emailResult.success) {
        console.log(`✅ Magic link email sent successfully. Message ID: ${emailResult.messageId}`);
        
        
        await this.updateMagicLink(magicLink);
      } else {
        console.error(`❌ Failed to send magic link email: ${emailResult.error}`);
      }

      return emailResult;
    } catch (error) {
      console.error('❌ Error sending magic link email:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        provider: this.config.email.provider,
        timestamp: new Date().toISOString()
      };
    }
  }

  private buildMagicLinkUrl(magicLink: MagicLink): string {
    const baseUrl = this.config.frontend.baseUrl;
    const magicLinkPath = this.config.frontend.magicLinkPath;
    
    const url = new URL(magicLinkPath, baseUrl);
    url.searchParams.set('token', magicLink.token);
    
    if (magicLink.redirectUrl) {
      url.searchParams.set('redirect', encodeURIComponent(magicLink.redirectUrl));
    }
    
    // Ajouter l'action pour le frontend
    url.searchParams.set('action', magicLink.action);
    
    return url.toString();
  }

  private buildRedirectUrl(request: MagicLinkRequest): string {
    if (request.redirectUrl) {
      return request.redirectUrl;
    }

    const action = request.context?.action || 'login';
    const redirectPaths = this.config.frontend.redirectPaths;
    
    switch (action) {
      case 'register':
        return redirectPaths.register;
      case 'reset_password':
        return redirectPaths.resetPassword;
      case 'verify_email':
        return redirectPaths.verifyEmail;
      case 'login':
      default:
        return redirectPaths.login;
    }
  }

  async verifyMagicLink(token: string): Promise<MagicLinkVerificationResult> {
    try {
      console.log(`🔍 Verifying magic link token: ${token.substring(0, 8)}...`);
      
      const linkId = await this.redisClient.get(`magic_link:token:${token}`);
      if (!linkId) {
        console.log(`❌ Magic link not found for token`);
        return {
          success: false,
          status: 'expired',
          message: 'Magic link not found or expired'
        };
      }

      const magicLink = await this.getMagicLink(linkId);
      if (!magicLink) {
        console.log(`❌ Magic link data not found for ID: ${linkId}`);
        return {
          success: false,
          status: 'expired',
          message: 'Magic link not found'
        };
      }

      // Vérifier le statut
      if (magicLink.status === 'used') {
        console.log(`❌ Magic link already used`);
        return {
          success: false,
          status: 'used',
          message: 'Magic link has already been used'
        };
      }

      if (magicLink.status === 'revoked') {
        console.log(`❌ Magic link revoked`);
        return {
          success: false,
          status: 'revoked',
          message: 'Magic link has been revoked'
        };
      }

      // Vérifier l'expiration
      if (new Date() > new Date(magicLink.expiresAt)) {
        console.log(`❌ Magic link expired`);
        await this.updateLinkStatus(linkId, 'expired');
        return {
          success: false,
          status: 'expired',
          message: 'Magic link has expired'
        };
      }

      // Marquer comme utilisé
      await this.updateLinkStatus(linkId, 'used');
      magicLink.usedAt = new Date().toISOString();

      console.log(`✅ Magic link verified successfully for action: ${magicLink.action}`);

      // Traiter selon l'action
      const result = await this.processMagicLinkAction(magicLink);

      await this.emitEvent({
        type: 'magic_link_used',
        userId: result.userInfo?.sub || magicLink.userId || 'anonymous',
        data: {
          correlationId: magicLink.metadata?.correlationId,
          email: magicLink.email,
          action: magicLink.action,
          success: result.success
        }
      });

      return result;

    } catch (error) {
      console.error('❌ Failed to verify magic link:', error);
      return {
        success: false,
        status: 'expired',
        message: `Magic link verification failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  private async processMagicLinkAction(magicLink: MagicLink): Promise<MagicLinkVerificationResult> {
    switch (magicLink.action) {
      case 'login':
        return await this.handleLogin(magicLink);
      
      case 'register':
        return await this.handleRegistration(magicLink);
      
      case 'verify_email':
        return await this.handleEmailVerification(magicLink);
      
      case 'reset_password':
        return await this.handlePasswordReset(magicLink);
      
      default:
        return {
          success: false,
          status: 'expired',
          message: `Unsupported action: ${magicLink.action}`
        };
    }
  }

  private async handleLogin(magicLink: MagicLink): Promise<MagicLinkVerificationResult> {
    if (!magicLink.userId) {
      return {
        success: false,
        status: 'expired',
        message: 'User not found for login'
      };
    }

    try {
      // Récupérer les informations utilisateur
      const userInfo = await this.keycloakClient.getUserInfo(magicLink.userId);
      if (!userInfo) {
        return {
          success: false,
          status: 'expired',
          message: 'User account not found'
        };
      }

      // Générer un token d'accès
      const authResponse = await this.keycloakClient.getClientCredentialsToken!();

      console.log(`✅ Login successful for user: ${userInfo.preferred_username}`);

      return {
        success: true,
        status: 'used',
        message: 'Login successful',
        authResponse,
        userInfo,
        requiresMFA: this.shouldRequireMFA(userInfo)
      };
    } catch (error) {
      console.error('❌ Login processing failed:', error);
      return {
        success: false,
        status: 'expired',
        message: 'Login processing failed'
      };
    }
  }

  private async handleRegistration(magicLink: MagicLink): Promise<MagicLinkVerificationResult> {
    if (!this.config.autoCreateUser) {
      return {
        success: false,
        status: 'expired',
        message: 'User registration is disabled'
      };
    }

    try {
      console.log(`👤 Creating new user account for: ${magicLink.email}`);
      
      const username = this.generateUsernameFromEmail(magicLink.email);

      const userData = {
        username,
        email: magicLink.email,
        password: this.generateTemporaryPassword(),
        emailVerified: true, 
        enabled: true,
        firstName: '',
        lastName: ''
      };

      const registrationResult = await this.keycloakClient.registerUser(userData);
      
      if (!registrationResult.success || !registrationResult.userId) {
        return {
          success: false,
          status: 'expired',
          message: `Registration failed: ${registrationResult.message}`
        };
      }

      console.log(`✅ User created successfully: ${registrationResult.userId}`);

      const userInfo = await this.keycloakClient.getUserInfo(registrationResult.userId);
      
      const authResponse = await this.keycloakClient.getClientCredentialsToken!();

      await this.sendWelcomeEmail(magicLink.email, userInfo?.given_name, userInfo?.family_name);

      return {
        success: true,
        status: 'used',
        message: 'Registration completed successfully',
        authResponse,
        userInfo: userInfo || undefined
      };
    } catch (error) {
      console.error('❌ Registration processing failed:', error);
      return {
        success: false,
        status: 'expired',
        message: `Registration failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  private async handleEmailVerification(magicLink: MagicLink): Promise<MagicLinkVerificationResult> {
    if (!magicLink.userId) {
      return {
        success: false,
        status: 'expired',
        message: 'User ID not found for email verification'
      };
    }

    try {
      console.log(`📧 Verifying email for user: ${magicLink.userId}`);
      
      const success = await this.keycloakClient.verifyEmail(magicLink.userId, magicLink.token);
      
      if (success) {
        console.log(`✅ Email verified successfully`);
        return {
          success: true,
          status: 'used',
          message: 'Email verified successfully'
        };
      } else {
        return {
          success: false,
          status: 'expired',
          message: 'Email verification failed'
        };
      }
    } catch (error) {
      console.error('❌ Email verification failed:', error);
      return {
        success: false,
        status: 'expired',
        message: 'Email verification processing failed'
      };
    }
  }

  private async handlePasswordReset(magicLink: MagicLink): Promise<MagicLinkVerificationResult> {
    try {
      console.log(`🔑 Processing password reset for: ${magicLink.email}`);
      
      const resetToken = this.generateSecureToken();

      await this.redisClient.set(
        `password_reset:${resetToken}`,
        JSON.stringify({
          email: magicLink.email,
          userId: magicLink.userId,
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString() // 15 minutes
        }),
        { ttl: 15 * 60 }
      );
      
      console.log(`✅ Password reset token generated`);
      
      return {
        success: true,
        status: 'used',
        message: 'Password reset authorized',
        userInfo: {
          sub: magicLink.userId || '',
          email: magicLink.email,
          // Informations minimales pour le reset
        } as any
      };
    } catch (error) {
      console.error('❌ Password reset processing failed:', error);
      return {
        success: false,
        status: 'expired',
        message: 'Password reset processing failed'
      };
    }
  }

  private async sendWelcomeEmail(email: string, firstName?: string, lastName?: string): Promise<void> {
    try {
      console.log(`📧 Sending welcome email to: ${email}`);
      
      const result = await this.emailService.sendWelcomeEmail(email, {
        firstName,
        lastName,
        provider: this.config.email.provider
      });
      
      if (result.success) {
        console.log(`✅ Welcome email sent successfully`);
      } else {
        console.error(`❌ Failed to send welcome email: ${result.error}`);
      }
    } catch (error) {
      console.error('❌ Welcome email error:', error);
    }
  }

  async initiatePasswordlessAuth(request: PasswordlessAuthRequest): Promise<PasswordlessAuthResult> {
    if (request.method !== 'magic_link') {
      return {
        success: false,
        method: request.method,
        message: `Method ${request.method} not supported by Magic Link service`
      };
    }

    console.log(`🔗 Initiating passwordless auth for: ${request.identifier}`);

    const magicLinkResult = await this.generateMagicLink({
      email: request.identifier,
      redirectUrl: request.redirectUrl,
      context: {
        ...request.context,
        action: request.action || 'login'
      }
    });

    return {
      success: magicLinkResult.success,
      method: 'magic_link',
      linkId: magicLinkResult.linkId,
      message: magicLinkResult.message,
      expiresAt: magicLinkResult.expiresAt,
      maskedDestination: this.maskEmail(request.identifier)
    };
  }

  async verifyPasswordlessAuth(challengeId: string, code: string): Promise<MagicLinkVerificationResult> {
    return await this.verifyMagicLink(code);
  }

  async isPasswordlessEnabled(email: string): Promise<boolean> {
    return this.config.enabled;
  }

  async getPasswordlessOptions(email: string): Promise<any[]> {
    return this.config.enabled ? ['magic_link'] : [];
  }

  private async storeMagicLink(magicLink: MagicLink): Promise<void> {
    await this.redisClient.set(
      `magic_link:${magicLink.id}`,
      JSON.stringify(magicLink),
      { ttl: this.config.expiryMinutes! * 60 }
    );

    await this.redisClient.set(
      `magic_link:token:${magicLink.token}`,
      magicLink.id,
      { ttl: this.config.expiryMinutes! * 60 }
    );

    // Indexer par email pour la gestion
    await this.redisClient.sAdd(`magic_link:email:${magicLink.email}`, magicLink.id);
    await this.redisClient.expire(`magic_link:email:${magicLink.email}`, this.config.expiryMinutes! * 60);
  }

  private async updateMagicLink(magicLink: MagicLink): Promise<void> {
    await this.redisClient.set(
      `magic_link:${magicLink.id}`,
      JSON.stringify(magicLink),
      { ttl: this.config.expiryMinutes! * 60 }
    );
  }

  async getMagicLink(linkId: string): Promise<MagicLink | null> {
    try {
      const linkData = await this.redisClient.get(`magic_link:${linkId}`);
      return linkData ? JSON.parse(linkData) : null;
    } catch (error) {
      console.error('Failed to get magic link:', error);
      return null;
    }
  }

  
  async sendMagicLink(linkId: string): Promise<boolean> {
    try {
      const magicLink = await this.getMagicLink(linkId);
      if (!magicLink) {
        console.error(`❌ Magic link not found: ${linkId}`);
        return false;
      }

      // Vérifier que le lien n'a pas expiré
      if (new Date() > new Date(magicLink.expiresAt)) {
        console.error(`❌ Magic link expired: ${linkId}`);
        await this.updateLinkStatus(linkId, 'expired');
        return false;
      }

      // Vérifier que le lien n'a pas déjà été utilisé
      if (magicLink.status === 'used' || magicLink.status === 'revoked') {
        console.error(`❌ Magic link already used or revoked: ${linkId}`);
        return false;
      }

      // Envoyer l'email avec le provider configuré
      const emailResult = await this.sendMagicLinkEmail(magicLink);

      if (emailResult.success) {
        console.log(`✅ Magic link email resent successfully: ${linkId}`);
        
        // Optionnel: marquer la dernière fois que l'email a été envoyé
        magicLink.metadata = {
          ...magicLink.metadata
        };
        
        await this.updateMagicLink(magicLink);
        
        return true;
      } else {
        console.error(`❌ Failed to resend magic link email: ${emailResult.error}`);
        return false;
      }
    } catch (error) {
      console.error(`❌ Error resending magic link ${linkId}:`, error);
      return false;
    }
  }

  async getUserMagicLinks(email: string): Promise<MagicLink[]> {
    try {
      const linkIds = await this.redisClient.sMembers(`magic_link:email:${email}`);
      const links: MagicLink[] = [];

      for (const linkId of linkIds) {
        const link = await this.getMagicLink(linkId);
        if (link) {
          links.push(link);
        }
      }

      return links.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    } catch (error) {
      console.error('Failed to get user magic links:', error);
      return [];
    }
  }

  async revokeMagicLink(linkId: string): Promise<void> {
    await this.updateLinkStatus(linkId, 'revoked');
  }

  async cleanupExpiredLinks(): Promise<number> {
    let cleanedCount = 0;
    
    try {
      const pattern = 'magic_link:*';
      const keys = await this.redisClient.keys(pattern);
      
      for (const key of keys) {
        if (key.includes(':token:') || key.includes(':email:')) {
          continue;
        }
        
        const link = await this.getMagicLink(key.replace('magic_link:', ''));
        if (link && new Date() > new Date(link.expiresAt)) {
          await this.deleteMagicLink(link.id);
          cleanedCount++;
        }
      }
    } catch (error) {
      console.error('Failed to cleanup expired links:', error);
    }
    
    return cleanedCount;
  }

  private async updateLinkStatus(linkId: string, status: MagicLinkStatus): Promise<void> {
    const link = await this.getMagicLink(linkId);
    if (link) {
      link.status = status;
      if (status === 'used') {
        link.usedAt = new Date().toISOString();
      }
      await this.updateMagicLink(link);
    }
  }

  private async deleteMagicLink(linkId: string): Promise<void> {
    const link = await this.getMagicLink(linkId);
    if (link) {
      await this.redisClient.delete(`magic_link:${linkId}`);
      
      await this.redisClient.delete(`magic_link:token:${link.token}`);
      
      await this.redisClient.sRem(`magic_link:email:${link.email}`, linkId);
    }
  }

  private async revokeExistingLinks(email: string): Promise<void> {
    const existingLinks = await this.getUserMagicLinks(email);
    
    for (const link of existingLinks) {
      if (link.status === 'pending') {
        await this.updateLinkStatus(link.id, 'revoked');
      }
    }
  }

  private async checkDailyLimit(email: string): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    const counterKey = `magic_link:daily:${email}:${today}`;
    
    const count = await this.redisClient.get(counterKey);
    const currentCount = count ? parseInt(count) : 0;
    
    if (currentCount >= this.config.maxUsesPerDay!) {
      throw new Error(`Daily magic link limit exceeded (${this.config.maxUsesPerDay})`);
    }
  }

  private async incrementDailyCounter(email: string): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    const counterKey = `magic_link:daily:${email}:${today}`;
    
    const currentCount = await this.redisClient.get(counterKey);
    const newCount = currentCount ? parseInt(currentCount) + 1 : 1;
    
    await this.redisClient.set(counterKey, newCount.toString(), { ttl: 86400 }); // 24h
  }

  private generateSecureToken(): string {
    return randomBytes(this.config.tokenLength! / 2).toString('hex');
  }

  private generateId(): string {
    return randomBytes(16).toString('hex');
  }

  private generateCorrelationId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateTemporaryPassword(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$%';
    let password = '';
    for (let i = 0; i < 16; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }

  private generateUsernameFromEmail(email: string): string {
    const [localPart] = email.split('@');
    const cleanUsername = localPart.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    const suffix = Math.random().toString(36).substr(2, 4);
    return `${cleanUsername}_${suffix}`;
  }

  private maskEmail(email: string): string {
    const [username, domain] = email.split('@');
    if (username.length <= 2) return email;
    return username.slice(0, 2) + '*'.repeat(username.length - 2) + '@' + domain;
  }

  private shouldRequireMFA(userInfo: UserInfo): boolean {
 
  const adminRoles = ['admin', 'super_admin', 'administrator'];
  const hasAdminRole = userInfo.roles.some(role => 
    adminRoles.some(adminRole => role.toLowerCase().includes(adminRole))
  );
  
  // MFA requis pour les administrateurs ou selon les attributs utilisateur
  const riskScoreRequiresMFA = userInfo.attributes?.riskScore != null && userInfo.attributes.riskScore > 50;
  
  return hasAdminRole || riskScoreRequiresMFA;
  }

  private async emitEvent(event: Omit<MFAEvent, 'id' | 'timestamp'>): Promise<void> {
    const fullEvent: MFAEvent = {
      ...event,
      id: this.generateId(),
      timestamp: new Date().toISOString()
    };

    const callbacks = this.eventCallbacks.get(event.type);
    if (callbacks) {
      for (const callback of callbacks) {
        try {
          await callback(fullEvent);
        } catch (error) {
          console.error(`Magic link event callback error for ${event.type}:`, error);
        }
      }
    }

    // Logger l'événement dans Redis pour l'audit
    await this.redisClient.set(
      `magic_link:event:${fullEvent.id}`,
      JSON.stringify(fullEvent),
      { ttl: 86400 * 30 } // 30 jours
    );
  }

  addEventListener(eventType: MFAEventType, callback: MFAEventCallback): void {
    if (!this.eventCallbacks.has(eventType)) {
      this.eventCallbacks.set(eventType, []);
    }
    this.eventCallbacks.get(eventType)!.push(callback);
  }

  removeEventListener(eventType: MFAEventType, callback: MFAEventCallback): void {
    const callbacks = this.eventCallbacks.get(eventType);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }


  static create(
    redisClient: RedisClient,
    keycloakClient: KeycloakClient,
    config?: Partial<MagicLinkConfigImpl>
  ): MagicLinkServiceImpl {
    return new MagicLinkServiceImpl(redisClient, keycloakClient, config);
  }

  static createWithTwilio(
  redisClient: RedisClient,
  keycloakClient: KeycloakClient,
  twilioConfig: {
    accountSid: string;
    authToken: string;
    fromEmail?: string;
    fromPhoneNumber?: string;
    fromName?: string;
    useEmailApi?: boolean;
    templates?: {
      magicLink?: string;
      welcome?: string;
      passwordReset?: string;
      mfaCode?: string;
    };
    sandbox?: boolean;
  },
  magicLinkConfig?: Partial<MagicLinkConfigImpl>
): MagicLinkServiceImpl {
  const config: Partial<MagicLinkConfigImpl> = {
    ...magicLinkConfig,
    email: {
      provider: 'twilio',
      config: {
        accountSid: twilioConfig.accountSid,
        authToken: twilioConfig.authToken,
        fromEmail: twilioConfig.fromEmail,
        fromPhoneNumber: twilioConfig.fromPhoneNumber,
        fromName: twilioConfig.fromName || 'SMP Platform',
        useEmailApi: twilioConfig.useEmailApi ?? true,
        templates: {
          magicLink: twilioConfig.templates?.magicLink || '',
          mfaCode: twilioConfig.templates?.mfaCode || '',
          welcome: twilioConfig.templates?.welcome || '',
          passwordReset: twilioConfig.templates?.passwordReset || ''
        },
        retryAttempts: 3,
        retryDelay: 1000,
        timeout: 30000,
        sandbox: twilioConfig.sandbox ?? (process.env.NODE_ENV !== 'production')
      },
      templates: {
        magicLink: twilioConfig.templates?.magicLink || 'magic-link-template',
        welcome: twilioConfig.templates?.welcome || 'welcome-template',
        passwordReset: twilioConfig.templates?.passwordReset || 'password-reset-template'
      }
    }
  };

  return new MagicLinkServiceImpl(redisClient, keycloakClient, config);
}
}