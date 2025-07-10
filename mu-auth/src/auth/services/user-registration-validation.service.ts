// mu-auth/src/auth/services/user-registration-validation.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  UserRegistrationInputDto,
  PasswordValidationResult,
  UsernameValidationResult,
  EmailValidationResult,
  UserRegistrationConfig
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

    // Vérification de la longueur
    if (password.length < this.config.passwordPolicy.minLength) {
      errors.push(`Password must be at least ${this.config.passwordPolicy.minLength} characters long`);
    } else {
      score += 20;
    }

    // Vérification des caractères requis
    if (this.config.passwordPolicy.requireUppercase && !/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
      suggestions.push('Add an uppercase letter');
    } else if (this.config.passwordPolicy.requireUppercase) {
      score += 15;
    }

    if (this.config.passwordPolicy.requireLowercase && !/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
      suggestions.push('Add a lowercase letter');
    } else if (this.config.passwordPolicy.requireLowercase) {
      score += 15;
    }

    if (this.config.passwordPolicy.requireNumbers && !/\d/.test(password)) {
      errors.push('Password must contain at least one number');
      suggestions.push('Add a number');
    } else if (this.config.passwordPolicy.requireNumbers) {
      score += 15;
    }

    if (this.config.passwordPolicy.requireSpecialChars && !/[@$!%*?&]/.test(password)) {
      errors.push('Password must contain at least one special character (@$!%*?&)');
      suggestions.push('Add a special character');
    } else if (this.config.passwordPolicy.requireSpecialChars) {
      score += 15;
    }

    // Vérification des motifs interdits
    for (const pattern of this.config.passwordPolicy.forbiddenPatterns) {
      if (pattern && password.toLowerCase().includes(pattern.toLowerCase())) {
        errors.push(`Password cannot contain "${pattern}"`);
      }
    }

    // Bonus pour la complexité
    if (password.length >= 12) score += 10;
    if (password.length >= 16) score += 10;
    if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) score += 5;

    // Vérification des patterns communs
    if (/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/.test(password)) {
      if (this.isCommonPassword(password)) {
        errors.push('Password is too common');
        suggestions.push('Use a more unique password');
        score = Math.max(0, score - 30);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      score: Math.min(100, score),
      suggestions
    };
  }

  // ============================================================================
  // VALIDATION DU NOM D'UTILISATEUR
  // ============================================================================

  async validateUsername(username: string): Promise<UsernameValidationResult> {
    const errors: string[] = [];
    const suggestions: string[] = [];

    // Vérification de la longueur
    if (username.length < this.config.usernamePolicy.minLength) {
      errors.push(`Username must be at least ${this.config.usernamePolicy.minLength} characters long`);
    }
    if (username.length > this.config.usernamePolicy.maxLength) {
      errors.push(`Username must be no more than ${this.config.usernamePolicy.maxLength} characters long`);
    }

    // Vérification des caractères autorisés
    if (!this.config.usernamePolicy.allowedChars.test(username)) {
      errors.push('Username can only contain letters, numbers, underscores and hyphens');
    }

    // Vérification des noms réservés
    if (this.config.usernamePolicy.reservedUsernames.includes(username.toLowerCase())) {
      errors.push('Username is reserved and cannot be used');
      suggestions.push(`Try: ${username}1, ${username}_user, my_${username}`);
    }

    // Vérification de la disponibilité
    const available = await this.checkUsernameAvailability(username);
    if (!available) {
      suggestions.push(`Try: ${username}1, ${username}_2024, ${username}_user`);
    }

    return {
      valid: errors.length === 0,
      available,
      errors,
      suggestions
    };
  }

  // ============================================================================
  // VALIDATION DE L'EMAIL
  // ============================================================================

  async validateEmail(email: string): Promise<EmailValidationResult> {
  const errors: string[] = [];

  // Validation de base du format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    errors.push('Invalid email format');
    return {
      valid: false,
      available: false,
      deliverable: false,
      errors
    };
  }

  const domain = email.split('@')[1].toLowerCase();

  // Vérification des domaines autorisés - CORRIGER ici
  if (this.config.emailPolicy.allowedDomains && this.config.emailPolicy.allowedDomains.length > 0) {
    if (!this.config.emailPolicy.allowedDomains.includes(domain)) {
      errors.push(`Email domain ${domain} is not allowed`);
    }
  }

  // Vérification des domaines bloqués - CORRIGER ici aussi
  if (this.config.emailPolicy.blockedDomains && this.config.emailPolicy.blockedDomains.includes(domain)) {
    errors.push(`Email domain ${domain} is blocked`);
  }

  // Vérification de la disponibilité
  const available = await this.checkEmailAvailability(email);

  // Vérification de la délivrabilité (simulation)
  const deliverable = await this.checkEmailDeliverability(email);

  return {
    valid: errors.length === 0,
    available,
    deliverable,
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

  getPasswordPolicy(): UserRegistrationConfig['passwordPolicy'] {
    return this.config.passwordPolicy;
  }

  getEmailPolicy(): UserRegistrationConfig['emailPolicy'] {
    return this.config.emailPolicy;
  }

  getUsernamePolicy(): UserRegistrationConfig['usernamePolicy'] {
    return this.config.usernamePolicy;
  }

  getRegistrationFlow(): UserRegistrationConfig['registrationFlow'] {
    return this.config.registrationFlow;
  }

  async validateRegistrationData(input: UserRegistrationInputDto): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // 1. Validation du nom d'utilisateur
      const usernameValidation = await this.validateUsername(input.username);
      if (!usernameValidation.valid) {
        errors.push(...usernameValidation.errors);
      }
      if (!usernameValidation.available) {
        errors.push('Username is already taken');
      }

      // 2. Validation de l'email
      const emailValidation = await this.validateEmail(input.email);
      if (!emailValidation.valid) {
        errors.push(...emailValidation.errors);
      }
      if (!emailValidation.available) {
        errors.push('Email is already registered');
      }
      if (!emailValidation.deliverable) {
        warnings.push('Email deliverability could not be verified');
      }

      // 3. Validation du mot de passe
      const passwordValidation = await this.validatePassword(input.password);
      if (!passwordValidation.valid) {
        errors.push(...passwordValidation.errors);
      }
      if (passwordValidation.score < 70) {
        warnings.push('Password strength could be improved');
        warnings.push(...passwordValidation.suggestions);
      }

      // 4. Validation des données personnelles
      if (input.firstName && input.firstName.length < 2) {
        errors.push('First name must be at least 2 characters long');
      }
      if (input.lastName && input.lastName.length < 2) {
        errors.push('Last name must be at least 2 characters long');
      }

      // 5. Validation des attributs personnalisés
      if (input.attributes) {
        const attributeValidation = this.validateAttributes(input.attributes);
        if (!attributeValidation.valid) {
          errors.push(...attributeValidation.errors);
        }
      }

      console.log(`Validation completed for ${input.username}: ${errors.length} errors, ${warnings.length} warnings`);

      return {
        valid: errors.length === 0,
        errors,
        warnings
      };

    } catch (error) {
      console.error(`Validation failed for ${input.username}:`, error);
      return {
        valid: false,
        errors: ['Validation service error'],
        warnings: []
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
      const baseName = email.split('@')[0];
      suggestions.push(baseName);
      
      if (firstName && lastName) {
        suggestions.push(
          `${firstName.toLowerCase()}.${lastName.toLowerCase()}`,
          `${firstName.toLowerCase()}_${lastName.toLowerCase()}`,
          `${firstName.toLowerCase()}${lastName.toLowerCase()}`,
          `${firstName.charAt(0).toLowerCase()}${lastName.toLowerCase()}`
        );
      }
      
      // Ajouter des variantes avec des numéros
      for (let i = 1; i <= 3; i++) {
        suggestions.push(`${baseName}${i}`);
        if (firstName && lastName) {
          suggestions.push(`${firstName.toLowerCase()}.${lastName.toLowerCase()}${i}`);
        }
      }
      
      // Filtrer les suggestions valides et disponibles - CORRIGER ici
      const validSuggestions: string[] = []; // Typer explicitement le tableau
      for (const suggestion of suggestions) {
        const validation = await this.validateUsername(suggestion);
        if (validation.valid && validation.available) {
          validSuggestions.push(suggestion);
        }
      }
      
      return validSuggestions.slice(0, 5); // Limiter à 5 suggestions
      
    } catch (error) {
      console.error('Error generating username suggestions:', error);
      return [];
    }
  }

  /**
   * Valide et nettoie les données d'enregistrement
   */
  sanitizeRegistrationData(input: UserRegistrationInputDto): UserRegistrationInputDto {
    return {
      username: input.username.trim().toLowerCase(),
      email: input.email.trim().toLowerCase(),
      password: input.password, // Ne pas modifier le mot de passe
      firstName: input.firstName?.trim(),
      lastName: input.lastName?.trim(),
      enabled: input.enabled !== false,
      emailVerified: input.emailVerified || false,
      attributes: input.attributes
    };
  }

  /**
   * Vérifie si l'enregistrement est autorisé selon la configuration
   */
  isRegistrationAllowed(): boolean {
    return this.configService.get('REGISTRATION_ENABLED', true);
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