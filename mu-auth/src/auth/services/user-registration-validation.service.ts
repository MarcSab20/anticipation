// mu-auth/src/auth/services/user-registration-validation.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  UserRegistrationInputDto,
  PasswordValidationResult,
  UsernameValidationResult,
  EmailValidationResult,
  UserRegistrationConfig,
  ValidationResult
} from '../dto/user-registration.dto';

@Injectable()
export class UserRegistrationValidationService {
  private readonly logger = new Logger(UserRegistrationValidationService.name);
  private readonly config: UserRegistrationConfig;

  constructor(private readonly configService: ConfigService) {
  this.config = {
    passwordPolicy: {
      minLength: this.configService.get('PASSWORD_MIN_LENGTH', 8),
      requireUppercase: this.configService.get('PASSWORD_REQUIRE_UPPERCASE', true),
      requireLowercase: this.configService.get('PASSWORD_REQUIRE_LOWERCASE', true),
      requireNumbers: this.configService.get('PASSWORD_REQUIRE_NUMBERS', true),
      requireSpecialChars: this.configService.get('PASSWORD_REQUIRE_SPECIAL', true),
      forbiddenPatterns: this.configService.get('PASSWORD_FORBIDDEN_PATTERNS', '').split(',').filter(p => p.trim())
    },
    emailPolicy: {
      requireVerification: this.configService.get('EMAIL_REQUIRE_VERIFICATION', true),
      allowedDomains: this.configService.get('EMAIL_ALLOWED_DOMAINS', '').split(',').filter(d => d.trim()).length > 0 
        ? this.configService.get('EMAIL_ALLOWED_DOMAINS', '').split(',').filter(d => d.trim()) 
        : undefined, // CORRIGER: s'assurer que c'est undefined si vide
      blockedDomains: this.configService.get('EMAIL_BLOCKED_DOMAINS', '').split(',').filter(d => d.trim()).length > 0
        ? this.configService.get('EMAIL_BLOCKED_DOMAINS', '').split(',').filter(d => d.trim())
        : undefined // CORRIGER: s'assurer que c'est undefined si vide
    },
    usernamePolicy: {
      minLength: this.configService.get('USERNAME_MIN_LENGTH', 3),
      maxLength: this.configService.get('USERNAME_MAX_LENGTH', 30),
      allowedChars: /^[a-zA-Z0-9_-]+$/,
      reservedUsernames: ['admin', 'root', 'system', 'test', 'api', 'www', 'mail', 'ftp']
    },
    registrationFlow: {
      requireEmailVerification: this.configService.get('REGISTRATION_REQUIRE_EMAIL_VERIFICATION', true),
      autoActivateAccount: this.configService.get('REGISTRATION_AUTO_ACTIVATE', true),
      sendWelcomeEmail: this.configService.get('REGISTRATION_SEND_WELCOME_EMAIL', false),
      assignDefaultRoles: this.configService.get('REGISTRATION_ASSIGN_DEFAULT_ROLES', true),
      defaultRoles: this.configService.get('REGISTRATION_DEFAULT_ROLES', 'USER').split(',').map(r => r.trim())
    }
  };
}

  // ============================================================================
  // VALIDATION DU MOT DE PASSE
  // ============================================================================

  async validatePassword(password: string): Promise<PasswordValidationResult> {
    const errors: string[] = [];
    const suggestions: string[] = [];
    let score = 0;

    if (!password) {
      errors.push('Le mot de passe est requis');
      return { valid: false, errors, suggestions, score };
    }

    // Longueur minimum
    const minLength = this.configService.get<number>('PASSWORD_MIN_LENGTH', 8);
    if (password.length < minLength) {
      errors.push(`Le mot de passe doit contenir au moins ${minLength} caractères`);
    } else {
      score += 20;
    }

    // Longueur maximum pour éviter les attaques DoS
    if (password.length > 128) {
      errors.push('Le mot de passe ne peut pas dépasser 128 caractères');
    }

    // Majuscules
    if (!/[A-Z]/.test(password)) {
      errors.push('Le mot de passe doit contenir au moins une majuscule');
      suggestions.push('Ajoutez une lettre majuscule (A-Z)');
    } else {
      score += 20;
    }

    // Minuscules
    if (!/[a-z]/.test(password)) {
      errors.push('Le mot de passe doit contenir au moins une minuscule');
      suggestions.push('Ajoutez une lettre minuscule (a-z)');
    } else {
      score += 20;
    }

    // Chiffres
    if (!/[0-9]/.test(password)) {
      errors.push('Le mot de passe doit contenir au moins un chiffre');
      suggestions.push('Ajoutez un chiffre (0-9)');
    } else {
      score += 20;
    }

    // Caractères spéciaux
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      errors.push('Le mot de passe doit contenir au moins un caractère spécial');
      suggestions.push('Ajoutez un caractère spécial (!@#$%^&*...)');
    } else {
      score += 20;
    }

    // Mots de passe communs
    const commonPasswords = [
      'password', '123456', '123456789', 'qwerty', 'abc123',
      'password123', 'admin', 'letmein', 'welcome', 'monkey'
    ];

    if (commonPasswords.some(common => password.toLowerCase().includes(common))) {
      errors.push('Le mot de passe ne doit pas contenir de mots communs');
      score = Math.max(0, score - 40);
    }

    // Patterns faibles
    if (/(.)\1{2,}/.test(password)) {
      errors.push('Le mot de passe ne doit pas contenir plus de 2 caractères consécutifs identiques');
      score = Math.max(0, score - 20);
    }

    if (/^[a-zA-Z]+$/.test(password) || /^[0-9]+$/.test(password)) {
      errors.push('Le mot de passe ne peut pas être uniquement composé de lettres ou de chiffres');
      score = Math.max(0, score - 30);
    }

    // Bonus pour la longueur
    if (password.length >= 12) {
      score += 10;
    }
    if (password.length >= 16) {
      score += 10;
    }

    // Bonus pour la diversité de caractères
    const charTypes = [
      /[a-z]/.test(password),
      /[A-Z]/.test(password),
      /[0-9]/.test(password),
      /[!@#$%^&*(),.?":{}|<>]/.test(password)
    ].filter(Boolean).length;

    if (charTypes >= 4) {
      score += 10;
    }

    return {
      valid: errors.length === 0,
      errors,
      suggestions,
      score: Math.min(100, Math.max(0, score))
    };
  }

  // ============================================================================
  // VALIDATION DU NOM D'UTILISATEUR
  // ============================================================================

  async validateUsername(username: string): Promise<UsernameValidationResult> {
    const errors: string[] = [];
    const suggestions: string[] = [];

    if (!username) {
      errors.push('Le nom d\'utilisateur est requis');
      return { valid: false, available: false, errors, suggestions };
    }

    const cleanUsername = username.trim().toLowerCase();

    // Longueur
    if (cleanUsername.length < 4) {
      errors.push('Le nom d\'utilisateur doit contenir au moins 4 caractères');
    }

    if (cleanUsername.length > 30) {
      errors.push('Le nom d\'utilisateur ne peut pas dépasser 30 caractères');
    }

    // Format
    if (!/^[a-z0-9_-]+$/.test(cleanUsername)) {
      errors.push('Le nom d\'utilisateur ne peut contenir que des lettres minuscules, chiffres, tirets et underscores');
    }

    // Caractères consécutifs
    if (/_{2,}|^_|_$|-{2,}|^-|-$/.test(cleanUsername)) {
      errors.push('Le nom d\'utilisateur ne peut pas commencer/finir par _ ou - ou contenir des caractères consécutifs');
    }

    // Noms réservés
    const reservedNames = [
      'admin', 'administrator', 'root', 'system', 'user', 'test', 'demo',
      'api', 'www', 'mail', 'email', 'support', 'help', 'info', 'contact',
      'null', 'undefined', 'false', 'true', 'error', 'success'
    ];

    if (reservedNames.includes(cleanUsername)) {
      errors.push('Ce nom d\'utilisateur est réservé');
      suggestions.push(`${cleanUsername}123`, `my_${cleanUsername}`, `${cleanUsername}_user`);
    }

    // Patterns interdits
    const forbiddenPatterns = [
      /^[0-9]+$/, // Seulement des chiffres
      /admin/i,
      /test/i,
      /temp/i
    ];

    for (const pattern of forbiddenPatterns) {
      if (pattern.test(cleanUsername)) {
        errors.push('Ce format de nom d\'utilisateur n\'est pas autorisé');
        break;
      }
    }

    // TODO: Vérifier la disponibilité en base de données
    // const isAvailable = await this.checkUsernameAvailability(cleanUsername);

    return {
      valid: errors.length === 0,
      available: errors.length === 0, // Temporaire - à remplacer par la vraie vérification
      errors,
      suggestions
    };
  }


  // ============================================================================
  // VALIDATION DE L'EMAIL
  // ============================================================================

  async validateEmail(email: string): Promise<EmailValidationResult> {
    const errors: string[] = [];

    if (!email) {
      errors.push('L\'email est requis');
      return { valid: false, available: false, deliverable: false, errors };
    }

    const cleanEmail = email.trim().toLowerCase();

    // Format de base
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      errors.push('Format d\'email invalide');
    }

    // Longueur
    if (cleanEmail.length > 254) {
      errors.push('L\'email est trop long (maximum 254 caractères)');
    }

    // Partie locale
    const [localPart, domain] = cleanEmail.split('@');
    if (localPart && localPart.length > 64) {
      errors.push('La partie locale de l\'email est trop longue (maximum 64 caractères)');
    }

    // Domaine
    if (domain && domain.length > 253) {
      errors.push('Le domaine de l\'email est trop long');
    }

    // Caractères interdits dans la partie locale
    if (localPart && !/^[a-zA-Z0-9._%+-]+$/.test(localPart)) {
      errors.push('L\'email contient des caractères non autorisés');
    }

    // Points consécutifs
    if (localPart && /\.{2,}/.test(localPart)) {
      errors.push('L\'email ne peut pas contenir de points consécutifs');
    }

    // Commence ou finit par un point
    if (localPart && (localPart.startsWith('.') || localPart.endsWith('.'))) {
      errors.push('L\'email ne peut pas commencer ou finir par un point');
    }

    // Domaines jetables basiques (à étendre)
    const disposableDomains = [
      '10minutemail.com', 'guerrillamail.com', 'mailinator.com',
      'tempmail.org', 'temp-mail.org'
    ];

    if (domain && disposableDomains.includes(domain)) {
      errors.push('Les adresses email temporaires ne sont pas autorisées');
    }

    // TODO: Vérifier la disponibilité en base de données
    // const isAvailable = await this.checkEmailAvailability(cleanEmail);

    return {
      valid: errors.length === 0,
      available: errors.length === 0, // Temporaire
      deliverable: errors.length === 0, // Temporaire - à remplacer par une vraie vérification
      errors
    };
  }

  // ============================================================================
  // MÉTHODES DE VÉRIFICATION DE DISPONIBILITÉ
  // ============================================================================

  private async checkUsernameAvailability(username: string): Promise<boolean> {
    try {
      // Ici, vous devriez vérifier avec smp-auth-ts/Keycloak
      // Pour l'instant, simulation simple
      const commonUsernames = ['admin', 'user', 'test', 'demo', 'guest'];
      return !commonUsernames.includes(username.toLowerCase());
    } catch (error) {
      this.logger.error(`Error checking username availability for ${username}:`, error.message);
      return false;
    }
  }

  private async checkEmailAvailability(email: string): Promise<boolean> {
    try {
      // Ici, vous devriez vérifier avec smp-auth-ts/Keycloak
      // Pour l'instant, simulation simple
      const commonEmails = ['admin@example.com', 'test@test.com'];
      return !commonEmails.includes(email.toLowerCase());
    } catch (error) {
      this.logger.error(`Error checking email availability for ${email}:`, error.message);
      return false;
    }
  }

  private async checkEmailDeliverability(email: string): Promise<boolean> {
    try {
      // Ici, vous pourriez intégrer un service de validation d'email
      // Pour l'instant, validation basique du domaine
      const domain = email.split('@')[1];
      const tempDomains = ['tempmail.org', '10minutemail.com', 'guerrillamail.com'];
      return !tempDomains.includes(domain.toLowerCase());
    } catch (error) {
      this.logger.error(`Error checking email deliverability for ${email}:`, error.message);
      return true; // Assumer que c'est délivrable en cas d'erreur
    }
  }

  // ============================================================================
  // MÉTHODES UTILITAIRES
  // ============================================================================

  private isCommonPassword(password: string): boolean {
    const commonPasswords = [
      'password123', 'Password123!', '123456789', 'qwerty123',
      'admin123', 'welcome123', 'password1', 'Passw0rd!',
      '12345678', 'abcd1234', 'password!', 'Welcome123!'
    ];
    
    return commonPasswords.includes(password);
  }

  // ============================================================================
  // CONFIGURATION ET UTILITAIRES
  // ============================================================================

  getEmailPolicy(): UserRegistrationConfig['emailPolicy'] {
    return this.config.emailPolicy;
  }

  getUsernamePolicy(): UserRegistrationConfig['usernamePolicy'] {
    return this.config.usernamePolicy;
  }

  getRegistrationFlow(): UserRegistrationConfig['registrationFlow'] {
    return this.config.registrationFlow;
  }

 async validateRegistrationData(input: UserRegistrationInputDto): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      this.logger.debug(`🔍 Validating registration data for user: ${input.username}`);

      // 1. Validation du nom d'utilisateur
      const usernameValidation = await this.validateUsername(input.username);
      if (!usernameValidation.valid) {
        errors.push(...usernameValidation.errors);
      }

      // 2. Validation de l'email
      const emailValidation = await this.validateEmail(input.email);
      if (!emailValidation.valid) {
        errors.push(...emailValidation.errors);
      }

      // 3. Validation du mot de passe
      const passwordValidation = await this.validatePassword(input.password);
      if (!passwordValidation.valid) {
        errors.push(...passwordValidation.errors);
      }

      // 4. Validation des données optionnelles
      if (input.firstName && input.firstName.trim().length === 0) {
        warnings.push('Le prénom est vide');
      }

      if (input.lastName && input.lastName.trim().length === 0) {
        warnings.push('Le nom est vide');
      }

      // 5. Validation métier spécifique
      if (input.username && input.email && input.username.toLowerCase() === input.email.split('@')[0].toLowerCase()) {
        warnings.push('Le nom d\'utilisateur est identique à la partie locale de l\'email');
      }

      const result: ValidationResult = {
        valid: errors.length === 0,
        errors,
        warnings
      };

      this.logger.debug(`✅ Validation completed for ${input.username}: ${result.valid ? 'VALID' : 'INVALID'}`, {
        errorCount: errors.length,
        warningCount: warnings.length,
        errors: errors.length > 0 ? errors : undefined
      });

      return result;

    } catch (error) {
      this.logger.error(`❌ Error during validation for ${input.username}:`, error);
      return {
        valid: false,
        errors: ['Erreur interne lors de la validation']
      };
    }
  }

  private validateAttributes(attributes: Record<string, string[]>): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // Validation de base des attributs
    for (const [key, values] of Object.entries(attributes)) {
      if (!key || key.length === 0) {
        errors.push('Attribute key cannot be empty');
        continue;
      }

      if (!Array.isArray(values)) {
        errors.push(`Attribute ${key} must be an array of strings`);
        continue;
      }

      for (const value of values) {
        if (typeof value !== 'string') {
          errors.push(`All values for attribute ${key} must be strings`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }


  /**
   * Génère des suggestions de nom d'utilisateur basées sur l'email ou le nom
   */
  async generateUsernameSuggestions(email: string, firstName?: string, lastName?: string): Promise<string[]> {
    const suggestions: string[] = [];
    
    try {
      // Basé sur l'email
      const emailBase = email.split('@')[0].toLowerCase();
      if (emailBase.length >= 4) {
        suggestions.push(emailBase);
      }

      // Basé sur le prénom
      if (firstName && firstName.length >= 3) {
        const firstNameClean = firstName.toLowerCase().replace(/[^a-z0-9]/g, '');
        suggestions.push(firstNameClean);
        
        if (lastName && lastName.length >= 3) {
          const lastNameClean = lastName.toLowerCase().replace(/[^a-z0-9]/g, '');
          suggestions.push(`${firstNameClean}_${lastNameClean}`);
          suggestions.push(`${firstNameClean}${lastNameClean}`);
          suggestions.push(`${firstNameClean.charAt(0)}${lastNameClean}`);
        }
      }

      // Variations avec numéros
      if (emailBase.length >= 4) {
        suggestions.push(`${emailBase}123`);
        suggestions.push(`${emailBase}_user`);
        suggestions.push(`my_${emailBase}`);
      }

      // Nettoyer et filtrer les suggestions
      const cleanSuggestions = suggestions
        .filter(s => s.length >= 4 && s.length <= 30)
        .filter(s => /^[a-z0-9_-]+$/.test(s))
        .slice(0, 5);

      return cleanSuggestions;

    } catch (error) {
      this.logger.error('Error generating username suggestions:', error);
      return [];
    }
  }

  /**
   * 🔧 POLITIQUE DE MOT DE PASSE
   */
  getPasswordPolicy() {
    return {
      minLength: this.configService.get<number>('PASSWORD_MIN_LENGTH', 8),
      requireUppercase: this.configService.get<boolean>('PASSWORD_REQUIRE_UPPERCASE', true),
      requireLowercase: this.configService.get<boolean>('PASSWORD_REQUIRE_LOWERCASE', true),
      requireNumbers: this.configService.get<boolean>('PASSWORD_REQUIRE_NUMBERS', true),
      requireSpecialChars: this.configService.get<boolean>('PASSWORD_REQUIRE_SPECIAL', true),
      forbiddenPatterns: []
    };
  }

  /**
   * Valide et nettoie les données d'enregistrement
   */
  sanitizeRegistrationData(input: UserRegistrationInputDto): UserRegistrationInputDto {
    return {
      ...input,
      username: input.username?.trim().toLowerCase() || '',
      email: input.email?.trim().toLowerCase() || '',
      firstName: input.firstName?.trim() || '',
      lastName: input.lastName?.trim() || '',
      // Le mot de passe n'est pas modifié pour préserver l'intention de l'utilisateur
    };
  }

  /**
   * 🔧 VÉRIFICATION SI L'ENREGISTREMENT EST AUTORISÉ
   */
  isRegistrationAllowed(): boolean {
    const registrationEnabled = this.configService.get<boolean>('REGISTRATION_ENABLED', true);
    const maintenanceMode = this.configService.get<boolean>('MAINTENANCE_MODE', false);

    if (maintenanceMode) {
      this.logger.warn('Registration blocked: system in maintenance mode');
      return false;
    }

    if (!registrationEnabled) {
      this.logger.warn('Registration blocked: registration disabled');
      return false;
    }

    return true;
  }

  /**
   * Vérifie si la vérification d'email est requise
   */
  isEmailVerificationRequired(): boolean {
    return this.config.registrationFlow.requireEmailVerification;
  }

  /**
   * Obtient les rôles par défaut à assigner
   */
  getDefaultRoles(): string[] {
    return this.config.registrationFlow.defaultRoles;
  }
}