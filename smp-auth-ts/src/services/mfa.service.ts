// smp-auth-ts/src/services/mfa.service.ts

import { randomBytes, createHash, timingSafeEqual } from 'crypto';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import {
  MFAService,
  MFAMethod,
  MFAChallenge,
  MFAConfig,
  MFASetupRequest,
  MFASetupResult,
  MFAVerificationRequest,
  MFAVerificationResult,
  MFAStatus,
  MFAMethodType,
  MFAVerificationStatus,
  BackupCodesGeneration,
  RecoveryOptions,
  TrustedDevice,
  DeviceTrustRequest,
  DeviceTrustResult,
  MFAEventCallback,
  MFAEventType,
  MFAEvent,
  MFAErrorCode,
  MFA_CONSTANTS
} from '../interface/mfa.interface.js';
import { ValidationResult, UserId, SessionId, CorrelationId } from '../interface/common.js';
import { RedisClient } from '../interface/redis.interface.js';

export class MFAServiceImpl implements MFAService {
  private readonly redisClient: RedisClient;
  private readonly config: MFAConfig;
  private eventCallbacks: Map<MFAEventType, MFAEventCallback[]> = new Map();

  constructor(
    redisClient: RedisClient,
    config: Partial<MFAConfig> = {}
  ) {
    this.redisClient = redisClient;
    this.config = {
      enabled: true,
      enforcedForRoles: ['admin', 'super_admin'],
      gracePeriodDays: 7,
      maxAttempts: 3,
      codeLength: 6,
      codeExpiry: 300,
      rateLimit: {
        maxAttempts: 5,
        windowMinutes: 15,
        lockoutMinutes: 60
      },
      allowedMethods: ['totp', 'sms', 'email', 'backup_codes'],
      requireBackupCodes: true,
      rememberDeviceDays: 30,
      ...config
    };

    authenticator.options = {
      step: MFA_CONSTANTS.TOTP.STEP,
      window: MFA_CONSTANTS.TOTP.WINDOW,
      algorithm: 'sha1' as any
    };
  }

 
  async getMFAConfig(userId: UserId): Promise<MFAConfig> {
    const userConfig = await this.redisClient.get(`mfa:config:${userId}`);
    if (userConfig) {
      return { ...this.config, ...JSON.parse(userConfig) };
    }
    return this.config;
  }

  async updateMFAConfig(userId: UserId, config: Partial<MFAConfig>): Promise<void> {
    const currentConfig = await this.getMFAConfig(userId);
    const newConfig = { ...currentConfig, ...config };
    
    await this.redisClient.set(
      `mfa:config:${userId}`,
      JSON.stringify(newConfig),
      { ttl: 86400 * 365 } // 1 an
    );
  }

  // ============================================================================
  // GESTION DES MÉTHODES MFA
  // ============================================================================

  async getUserMFAMethods(userId: UserId): Promise<MFAMethod[]> {
    const methodIds = await this.redisClient.sMembers(`mfa:user:${userId}:methods`);
    const methods: MFAMethod[] = [];

    for (const methodId of methodIds) {
      const methodData = await this.redisClient.get(`mfa:method:${methodId}`);
      if (methodData) {
        methods.push(JSON.parse(methodData));
      }
    }

    return methods.sort((a, b) => {
      if (a.isPrimary && !b.isPrimary) return -1;
      if (!a.isPrimary && b.isPrimary) return 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }

  async setupMFAMethod(request: MFASetupRequest): Promise<MFASetupResult> {
    const methodId = this.generateId();
    const now = new Date().toISOString();

    try {
      switch (request.methodType) {
        case 'totp':
          return await this.setupTOTP(methodId, request, now);
        case 'sms':
          return await this.setupSMS(methodId, request, now);
        case 'email':
          return await this.setupEmail(methodId, request, now);
        case 'webauthn':
          return await this.setupWebAuthn(methodId, request, now);
        default:
          throw new Error(`Unsupported MFA method: ${request.methodType}`);
      }
    } catch (error) {
      throw new Error(`MFA setup failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async setupTOTP(methodId: string, request: MFASetupRequest, now: string): Promise<MFASetupResult> {
    const secret = authenticator.generateSecret();
    const issuer = 'SMP Auth';
    const userEmail = request.metadata?.emailAddress || 'user@example.com';
    
    const otpauth = authenticator.keyuri(userEmail, issuer, secret);
    const qrCodeUrl = await QRCode.toDataURL(otpauth);

    const method: MFAMethod = {
      id: methodId,
      userId: request.userId,
      type: 'totp',
      name: request.name,
      isEnabled: false, // Sera activé après vérification
      isPrimary: false,
      isVerified: false,
      createdAt: now,
      metadata: {
        secret,
        qrCodeUrl
      }
    };

    await this.redisClient.set(`mfa:method:${methodId}`, JSON.stringify(method), { ttl: 86400 });

    return {
      success: true,
      methodId,
      secret,
      qrCodeUrl,
      verificationRequired: true
    };
  }

  private async setupSMS(methodId: string, request: MFASetupRequest, now: string): Promise<MFASetupResult> {
    if (!request.metadata?.phoneNumber) {
      throw new Error('Phone number is required for SMS MFA');
    }

    const method: MFAMethod = {
      id: methodId,
      userId: request.userId,
      type: 'sms',
      name: request.name,
      isEnabled: false,
      isPrimary: false,
      isVerified: false,
      createdAt: now,
      metadata: {
        phoneNumber: request.metadata.phoneNumber,
        phoneCountryCode: '+237'
      }
    };

    await this.redisClient.set(`mfa:method:${methodId}`, JSON.stringify(method), { ttl: 86400 });

    // Créer un challenge de vérification
    const challenge = await this.createVerificationChallenge(methodId, 'sms');

    return {
      success: true,
      methodId,
      verificationRequired: true,
      challenge
    };
  }

  private async setupEmail(methodId: string, request: MFASetupRequest, now: string): Promise<MFASetupResult> {
    if (!request.metadata?.emailAddress) {
      throw new Error('Email address is required for Email MFA');
    }

    const method: MFAMethod = {
      id: methodId,
      userId: request.userId,
      type: 'email',
      name: request.name,
      isEnabled: false,
      isPrimary: false,
      isVerified: false,
      createdAt: now,
      metadata: {
        emailAddress: request.metadata.emailAddress
      }
    };

    await this.redisClient.set(`mfa:method:${methodId}`, JSON.stringify(method), { ttl: 86400 });

    const challenge = await this.createVerificationChallenge(methodId, 'email');

    return {
      success: true,
      methodId,
      verificationRequired: true,
      challenge
    };
  }

  private async setupWebAuthn(methodId: string, request: MFASetupRequest, now: string): Promise<MFASetupResult> {
    // WebAuthn nécessite une implémentation côté client
    // Pour l'instant, on simule la configuration
    const method: MFAMethod = {
      id: methodId,
      userId: request.userId,
      type: 'webauthn',
      name: request.name,
      isEnabled: false,
      isPrimary: false,
      isVerified: false,
      createdAt: now,
      metadata: {
        deviceName: request.metadata?.deviceInfo?.name || 'Security Key'
      }
    };

    await this.redisClient.set(`mfa:method:${methodId}`, JSON.stringify(method), { ttl: 86400 });

    return {
      success: true,
      methodId,
      verificationRequired: true
    };
  }

  async verifyMFASetup(methodId: string, code: string): Promise<ValidationResult> {
    const methodData = await this.redisClient.get(`mfa:method:${methodId}`);
    if (!methodData) {
      return { valid: false, errors: ['Method not found'] };
    }

    const method: MFAMethod = JSON.parse(methodData);

    try {
      let isValid = false;

      switch (method.type) {
        case 'totp':
          isValid = authenticator.verify({
            token: code,
            secret: method.metadata.secret!
          });
          break;

        case 'sms':
        case 'email':
          const challengeData = await this.redisClient.get(`mfa:challenge:setup:${methodId}`);
          if (challengeData) {
            const challenge = JSON.parse(challengeData);
            isValid = timingSafeEqual(
              Buffer.from(code),
              Buffer.from(challenge.code)
            );
          }
          break;

        case 'webauthn':
          // Simulation pour WebAuthn
          isValid = code === 'webauthn-verified';
          break;
      }

      if (isValid) {
        // Activer la méthode
        method.isEnabled = true;
        method.isVerified = true;
        
        // Définir comme primaire si c'est la première méthode
        const userMethods = await this.getUserMFAMethods(method.userId);
        if (userMethods.length === 0) {
          method.isPrimary = true;
        }

        await this.redisClient.set(
          `mfa:method:${methodId}`,
          JSON.stringify(method),
          { ttl: 86400 * 365 }
        );

        // Ajouter à la liste des méthodes utilisateur
        await this.redisClient.sAdd(`mfa:user:${method.userId}:methods`, methodId);

        // Générer des codes de récupération si requis
        if (this.config.requireBackupCodes && method.type === 'totp') {
          await this.generateBackupCodes(method.userId);
        }

        // Nettoyer les challenges temporaires
        await this.redisClient.delete(`mfa:challenge:setup:${methodId}`);

        await this.emitEvent({
          type: 'mfa_method_added',
          userId: method.userId,
          data: {
            methodType: method.type,
            methodId: method.id
          }
        });

        return { valid: true };
      } else {
        return { valid: false, errors: ['Invalid verification code'] };
      }
    } catch (error) {
      return { 
        valid: false, 
        errors: [`Verification failed: ${error instanceof Error ? error.message : String(error)}`] 
      };
    }
  }

  async removeMFAMethod(methodId: string): Promise<void> {
    const methodData = await this.redisClient.get(`mfa:method:${methodId}`);
    if (!methodData) {
      throw new Error('Method not found');
    }

    const method: MFAMethod = JSON.parse(methodData);
    
    // Vérifier qu'il reste au moins une méthode active
    const userMethods = await this.getUserMFAMethods(method.userId);
    const activeMethods = userMethods.filter(m => m.isEnabled && m.id !== methodId);
    
    if (activeMethods.length === 0) {
      throw new Error('Cannot remove the last active MFA method');
    }

    // Supprimer la méthode
    await this.redisClient.delete(`mfa:method:${methodId}`);
    await this.redisClient.sRem(`mfa:user:${method.userId}:methods`, methodId);

    // Si c'était la méthode primaire, définir une nouvelle méthode primaire
    if (method.isPrimary && activeMethods.length > 0) {
      await this.setPrimaryMFAMethod(method.userId, activeMethods[0].id);
    }

    await this.emitEvent({
      type: 'mfa_method_removed',
      userId: method.userId,
      data: {
        methodType: method.type,
        methodId: method.id
      }
    });
  }

  async setPrimaryMFAMethod(userId: UserId, methodId: string): Promise<void> {
    const userMethods = await this.getUserMFAMethods(userId);
    
    for (const method of userMethods) {
      method.isPrimary = method.id === methodId;
      await this.redisClient.set(
        `mfa:method:${method.id}`,
        JSON.stringify(method),
        { ttl: 86400 * 365 }
      );
    }
  }

  // ============================================================================
  // VÉRIFICATION MFA
  // ============================================================================

  async initiateMFAChallenge(userId: UserId, methodType?: MFAMethodType): Promise<MFAChallenge> {
    const userMethods = await this.getUserMFAMethods(userId);
    const activeMethods = userMethods.filter(m => m.isEnabled);

    if (activeMethods.length === 0) {
      throw new Error('No active MFA methods found');
    }

    // Sélectionner la méthode
    let selectedMethod: MFAMethod;
    if (methodType) {
      const method = activeMethods.find(m => m.type === methodType);
      if (!method) {
        throw new Error(`MFA method ${methodType} not found or not active`);
      }
      selectedMethod = method;
    } else {
      selectedMethod = activeMethods.find(m => m.isPrimary) || activeMethods[0];
    }

    // Vérifier le rate limiting
    await this.checkRateLimit(userId);

    const challengeId = this.generateId();
    const code = this.generateMFACode(selectedMethod.type);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.config.codeExpiry! * 1000);

    const challenge: MFAChallenge = {
      id: challengeId,
      userId,
      methodId: selectedMethod.id,
      methodType: selectedMethod.type,
      status: 'pending',
      code,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      attemptsRemaining: this.config.maxAttempts!,
      metadata: {}
    };

    // Personnaliser selon le type de méthode
    switch (selectedMethod.type) {
      case 'sms':
        challenge.metadata!.maskedPhone = this.maskPhone(selectedMethod.metadata.phoneNumber!);
        await this.sendSMSCode(selectedMethod.metadata.phoneNumber!, code);
        break;

      case 'email':
        challenge.metadata!.maskedEmail = this.maskEmail(selectedMethod.metadata.emailAddress!);
        await this.sendEmailCode(selectedMethod.metadata.emailAddress!, code);
        break;

      case 'totp':
        // Pas besoin d'envoyer de code pour TOTP
        delete challenge.code;
        break;

      case 'webauthn':
        // WebAuthn utilise son propre défi
        challenge.metadata!.qrCodeUrl = 'webauthn-challenge-data';
        break;
    }

    // Sauvegarder le challenge
    await this.redisClient.set(
      `mfa:challenge:${challengeId}`,
      JSON.stringify(challenge),
      { ttl: this.config.codeExpiry! }
    );

    await this.emitEvent({
      type: 'mfa_challenge_created',
      userId,
      data: {
        methodType: selectedMethod.type,
        challengeId,
        correlationId: this.generateCorrelationId()
      }
    });

    return challenge;
  }

  async verifyMFAChallenge(request: MFAVerificationRequest): Promise<MFAVerificationResult> {
    const challengeData = await this.redisClient.get(`mfa:challenge:${request.challengeId}`);
    if (!challengeData) {
      return {
        success: false,
        status: 'expired',
        message: 'Challenge not found or expired'
      };
    }

    const challenge: MFAChallenge = JSON.parse(challengeData);

    // Vérifier l'expiration
    if (new Date() > new Date(challenge.expiresAt)) {
      await this.redisClient.delete(`mfa:challenge:${request.challengeId}`);
      return {
        success: false,
        status: 'expired',
        message: 'Challenge expired'
      };
    }

    // Vérifier les tentatives restantes
    if (challenge.attemptsRemaining <= 0) {
      return {
        success: false,
        status: 'rate_limited',
        message: 'Too many failed attempts'
      };
    }

    // Récupérer la méthode MFA
    const methodData = await this.redisClient.get(`mfa:method:${challenge.methodId}`);
    if (!methodData) {
      return {
        success: false,
        status: 'failed',
        message: 'MFA method not found'
      };
    }

    const method: MFAMethod = JSON.parse(methodData);

    // Vérifier le code selon le type de méthode
    let isValid = false;
    try {
      switch (method.type) {
        case 'totp':
          isValid = authenticator.verify({
            token: request.code,
            secret: method.metadata.secret!
          });
          break;

        case 'sms':
        case 'email':
          isValid = challenge.code ? timingSafeEqual(
            Buffer.from(request.code),
            Buffer.from(challenge.code)
          ) : false;
          break;

        case 'backup_codes':
          isValid = await this.verifyBackupCode(challenge.userId, request.code);
          break;

        case 'webauthn':
          // Simulation WebAuthn
          isValid = request.code === 'webauthn-success';
          break;
      }
    } catch (error) {
      console.error('MFA verification error:', error);
      isValid = false;
    }

    if (isValid) {
      // Succès de la vérification
      await this.redisClient.delete(`mfa:challenge:${request.challengeId}`);
      
      // Mettre à jour la méthode
      method.lastUsedAt = new Date().toISOString();
      await this.redisClient.set(
        `mfa:method:${challenge.methodId}`,
        JSON.stringify(method),
        { ttl: 86400 * 365 }
      );

      // Gérer la confiance de l'appareil
      let deviceTrusted = false;
      if (request.rememberDevice && request.deviceFingerprint) {
        const trustResult = await this.trustDevice(challenge.userId, {
          deviceFingerprint: request.deviceFingerprint,
          deviceName: `Device ${Date.now()}`,
          trustDurationDays: this.config.rememberDeviceDays
        });
        deviceTrusted = trustResult.trusted;
      }

      await this.emitEvent({
        type: 'mfa_verification_success',
        userId: challenge.userId,
        data: {
          methodType: method.type,
          challengeId: request.challengeId,
          success: true,
          deviceFingerprint: request.deviceFingerprint
        }
      });

      return {
        success: true,
        status: 'verified',
        message: 'MFA verification successful',
        deviceTrusted
      };
    } else {
      // Échec de la vérification
      challenge.attemptsRemaining--;
      challenge.status = challenge.attemptsRemaining > 0 ? 'pending' : 'rate_limited';

      await this.redisClient.set(
        `mfa:challenge:${request.challengeId}`,
        JSON.stringify(challenge),
        { ttl: this.config.codeExpiry! }
      );

      await this.emitEvent({
        type: 'mfa_verification_failed',
        userId: challenge.userId,
        data: {
          methodType: method.type,
          challengeId: request.challengeId,
          success: false,
          attemptsRemaining: challenge.attemptsRemaining
        }
      });

      return {
        success: false,
        status: challenge.status,
        message: 'Invalid verification code',
        attemptsRemaining: challenge.attemptsRemaining
      };
    }
  }

  async resendMFACode(challengeId: string): Promise<boolean> {
    const challengeData = await this.redisClient.get(`mfa:challenge:${challengeId}`);
    if (!challengeData) {
      return false;
    }

    const challenge: MFAChallenge = JSON.parse(challengeData);
    const methodData = await this.redisClient.get(`mfa:method:${challenge.methodId}`);
    if (!methodData) {
      return false;
    }

    const method: MFAMethod = JSON.parse(methodData);

    try {
      switch (method.type) {
        case 'sms':
          if (challenge.code) {
            await this.sendSMSCode(method.metadata.phoneNumber!, challenge.code);
          }
          break;

        case 'email':
          if (challenge.code) {
            await this.sendEmailCode(method.metadata.emailAddress!, challenge.code);
          }
          break;

        default:
          return false;
      }

      return true;
    } catch (error) {
      console.error('Failed to resend MFA code:', error);
      return false;
    }
  }

  // ============================================================================
  // CODES DE RÉCUPÉRATION
  // ============================================================================

  async generateBackupCodes(userId: UserId): Promise<BackupCodesGeneration> {
    const codes: string[] = [];
    for (let i = 0; i < MFA_CONSTANTS.DEFAULT_BACKUP_CODES_COUNT; i++) {
      codes.push(this.generateBackupCode());
    }

    const hashedCodes = codes.map(code => this.hashBackupCode(code));
    const generation: BackupCodesGeneration = {
      userId,
      codes,
      generatedAt: new Date().toISOString(),
      usedCodes: [],
      remainingCodes: codes.length
    };

    // Stocker les codes hachés
    await this.redisClient.set(
      `mfa:backup_codes:${userId}`,
      JSON.stringify({
        ...generation,
        codes: hashedCodes // Stocker les versions hachées
      }),
      { ttl: 86400 * 365 }
    );

    return generation;
  }

  async useBackupCode(userId: UserId, code: string): Promise<boolean> {
    const backupData = await this.redisClient.get(`mfa:backup_codes:${userId}`);
    if (!backupData) {
      return false;
    }

    const backup: BackupCodesGeneration = JSON.parse(backupData);
    const hashedCode = this.hashBackupCode(code);

    // Vérifier si le code existe et n'a pas été utilisé
    const codeIndex = backup.codes.findIndex(c => c === hashedCode);
    if (codeIndex === -1 || backup.usedCodes.includes(hashedCode)) {
      return false;
    }

    // Marquer le code comme utilisé
    backup.usedCodes.push(hashedCode);
    backup.remainingCodes = backup.codes.length - backup.usedCodes.length;

    await this.redisClient.set(
      `mfa:backup_codes:${userId}`,
      JSON.stringify(backup),
      { ttl: 86400 * 365 }
    );

    return true;
  }

  async getRecoveryOptions(userId: UserId): Promise<RecoveryOptions> {
    const userMethods = await this.getUserMFAMethods(userId);
    const backupData = await this.redisClient.get(`mfa:backup_codes:${userId}`);
    
    let backupCodesRemaining = 0;
    if (backupData) {
      const backup: BackupCodesGeneration = JSON.parse(backupData);
      backupCodesRemaining = backup.remainingCodes;
    }

    const recoveryMethods: MFAMethodType[] = userMethods
      .filter(m => m.isEnabled && ['sms', 'email'].includes(m.type))
      .map(m => m.type);

    return {
      hasBackupCodes: backupCodesRemaining > 0,
      backupCodesRemaining,
      hasRecoveryEmail: userMethods.some(m => m.type === 'email' && m.isEnabled),
      hasRecoveryPhone: userMethods.some(m => m.type === 'sms' && m.isEnabled),
      recoveryMethods
    };
  }

  // ============================================================================
  // DEVICE TRUST
  // ============================================================================

  async trustDevice(userId: UserId, request: DeviceTrustRequest): Promise<DeviceTrustResult> {
    const deviceId = this.generateId();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (request.trustDurationDays || this.config.rememberDeviceDays!) * 24 * 60 * 60 * 1000);

    const device: TrustedDevice = {
      id: deviceId,
      userId,
      fingerprint: request.deviceFingerprint,
      name: request.deviceName || `Device ${now.getTime()}`,
      isActive: true,
      createdAt: now.toISOString(),
      lastUsedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      metadata: {
        userAgent: '',
        mfaBypassEnabled: true
      }
    };

    await this.redisClient.set(
      `mfa:device:${deviceId}`,
      JSON.stringify(device),
      { ttl: (request.trustDurationDays || this.config.rememberDeviceDays!) * 24 * 60 * 60 }
    );

    await this.redisClient.sAdd(`mfa:user:${userId}:devices`, deviceId);

    await this.emitEvent({
      type: 'device_trusted',
      userId,
      data: {
        deviceFingerprint: request.deviceFingerprint
      }
    });

    return {
      success: true,
      deviceId,
      trusted: true,
      expiresAt: expiresAt.toISOString()
    };
  }

  async isDeviceTrusted(userId: UserId, deviceFingerprint: string): Promise<boolean> {
    const deviceIds = await this.redisClient.sMembers(`mfa:user:${userId}:devices`);
    
    for (const deviceId of deviceIds) {
      const deviceData = await this.redisClient.get(`mfa:device:${deviceId}`);
      if (deviceData) {
        const device: TrustedDevice = JSON.parse(deviceData);
        if (device.fingerprint === deviceFingerprint && 
            device.isActive && 
            new Date() < new Date(device.expiresAt!)) {
          
          // Mettre à jour la dernière utilisation
          device.lastUsedAt = new Date().toISOString();
          await this.redisClient.set(`mfa:device:${deviceId}`, JSON.stringify(device));
          
          return true;
        }
      }
    }

    return false;
  }

  async getTrustedDevices(userId: UserId): Promise<TrustedDevice[]> {
    const deviceIds = await this.redisClient.sMembers(`mfa:user:${userId}:devices`);
    const devices: TrustedDevice[] = [];

    for (const deviceId of deviceIds) {
      const deviceData = await this.redisClient.get(`mfa:device:${deviceId}`);
      if (deviceData) {
        const device: TrustedDevice = JSON.parse(deviceData);
        
        // Nettoyer les appareils expirés
        if (device.expiresAt && new Date() >= new Date(device.expiresAt)) {
          await this.revokeTrustedDevice(deviceId);
          continue;
        }
        
        devices.push(device);
      }
    }

    return devices.sort((a, b) => 
      new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime()
    );
  }

  async revokeTrustedDevice(deviceId: string): Promise<void> {
    const deviceData = await this.redisClient.get(`mfa:device:${deviceId}`);
    if (deviceData) {
      const device: TrustedDevice = JSON.parse(deviceData);
      await this.redisClient.delete(`mfa:device:${deviceId}`);
      await this.redisClient.sRem(`mfa:user:${device.userId}:devices`, deviceId);
    }
  }

  // ============================================================================
  // AUDIT ET STATUS
  // ============================================================================

  async getMFAStatus(userId: UserId): Promise<MFAStatus> {
    const userMethods = await this.getUserMFAMethods(userId);
    const activeMethods = userMethods.filter(m => m.isEnabled);

    if (activeMethods.length === 0) {
      return 'disabled';
    }

    const config = await this.getMFAConfig(userId);
    if (config.enforcedForRoles) {
      // Ici, vous devriez vérifier les rôles de l'utilisateur
      // Pour la démo, on considère que MFA est requis
      return 'enforced';
    }

    return 'enabled';
  }



  // ============================================================================
  // MÉTHODES PRIVÉES UTILITAIRES
  // ============================================================================

  private async createVerificationChallenge(methodId: string, methodType: MFAMethodType): Promise<MFAChallenge> {
    const code = this.generateMFACode(methodType);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.config.codeExpiry! * 1000);

    const challenge: MFAChallenge = {
      id: this.generateId(),
      userId: '', 
      methodId,
      methodType,
      status: 'pending',
      code,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      attemptsRemaining: this.config.maxAttempts!
    };

    await this.redisClient.set(
      `mfa:challenge:setup:${methodId}`,
      JSON.stringify(challenge),
      { ttl: this.config.codeExpiry! }
    );

    return challenge;
  }

  private generateMFACode(methodType: MFAMethodType): string {
    switch (methodType) {
      case 'sms':
      case 'email':
        // Générer un code numérique
        return Math.random().toString().slice(2, 2 + this.config.codeLength!);
      
      case 'backup_codes':
        return this.generateBackupCode();
      
      default:
        return '';
    }
  }

  private generateBackupCode(): string {
    return randomBytes(5).toString('hex').toUpperCase();
  }

  private hashBackupCode(code: string): string {
    return createHash('sha256').update(code).digest('hex');
  }

  private async sendSMSCode(phoneNumber: string, code: string): Promise<void> {
    // Implémentation de l'envoi SMS
    console.log(`SMS to ${phoneNumber}: Your verification code is ${code}`);
    // Ici, vous intégreriez un service SMS comme Twilio, AWS SNS, etc.
  }

  private async sendEmailCode(email: string, code: string): Promise<void> {
    // Implémentation de l'envoi d'email
    console.log(`Email to ${email}: Your verification code is ${code}`);
    // Ici, vous intégreriez un service d'email
  }

  private maskPhone(phone: string): string {
    if (phone.length <= 4) return phone;
    return phone.slice(0, -4).replace(/./g, '*') + phone.slice(-4);
  }

  private maskEmail(email: string): string {
    const [username, domain] = email.split('@');
    if (username.length <= 2) return email;
    return username.slice(0, 2) + '*'.repeat(username.length - 2) + '@' + domain;
  }

  private async checkRateLimit(userId: UserId): Promise<void> {
    const key = `mfa:rate_limit:${userId}`;
    const attempts = await this.redisClient.get(key);
    const currentAttempts = attempts ? parseInt(attempts) : 0;

    if (currentAttempts >= this.config.rateLimit!.maxAttempts) {
      throw new Error(`Rate limited. Try again in ${this.config.rateLimit!.lockoutMinutes} minutes`);
    }

    await this.redisClient.set(
      key, 
      (currentAttempts + 1).toString(), 
      { ttl: this.config.rateLimit!.windowMinutes * 60 }
    );
  }

  private async verifyBackupCode(userId: UserId, code: string): Promise<boolean> {
    return await this.useBackupCode(userId, code);
  }

  private generateId(): string {
    return randomBytes(16).toString('hex');
  }

  private generateCorrelationId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
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
          console.error(`MFA event callback error for ${event.type}:`, error);
        }
      }
    }
  }

  private mapEventTypeToAuditAction(eventType: MFAEventType): any {
    const mapping: Record<string, string> = {
      'mfa_challenge_created': 'mfa_challenge_created',
      'mfa_verification_success': 'mfa_verification_success',
      'mfa_verification_failed': 'mfa_verification_failed',
      'mfa_method_added': 'mfa_method_added',
      'mfa_method_removed': 'mfa_method_removed',
      'device_trusted': 'device_trusted',
      'magic_link_generated': 'magic_link_generated',
      'magic_link_used': 'magic_link_used',
      'passwordless_auth_success': 'passwordless_auth_success'
    };
    return mapping[eventType] || eventType;
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
}