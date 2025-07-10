import { Twilio } from 'twilio';
import { 
  EmailProvider, 
  EmailMessage, 
  EmailResult, 
  EmailConfig
} from '../../interface/email.interface.js';

export interface TwilioConfig extends EmailConfig {
  accountSid: string;
  authToken: string;
  fromPhoneNumber?: string; 
  fromEmail?: string; 
  fromName?: string;
  useEmailApi?: boolean; 
  templates?: {
    magicLink: string;
    mfaCode: string;
    welcome: string;
    passwordReset: string;
  };
  sandbox?: boolean;
}

export class TwilioProvider implements EmailProvider {
  private readonly config: TwilioConfig;
  private readonly client: Twilio;
  private isInitialized = false;

  constructor(config: TwilioConfig) {
    this.config = {
      retryAttempts: 3,
      retryDelay: 1000,
      timeout: 30000,
      useEmailApi: false, // Par défaut SMS
      ...config
    };
    
    this.client = new Twilio(this.config.accountSid, this.config.authToken);
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    if (!this.config.accountSid || !this.config.authToken) {
      throw new Error('Twilio Account SID and Auth Token are required');
    }

    if (!this.config.useEmailApi && !this.config.fromPhoneNumber) {
      throw new Error('From phone number is required for SMS');
    }

    if (this.config.useEmailApi && !this.config.fromEmail) {
      throw new Error('From email is required for email API');
    }

    this.isInitialized = true;
  }

  async sendEmail(message: EmailMessage): Promise<EmailResult> {
    await this.initialize();

    try {
      if (this.config.useEmailApi) {
        return await this.sendEmailViaTwilio(message);
      } else {
        // Envoyer par SMS si pas d'API email
        return await this.sendSMSViaTwilio(message);
      }
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async sendEmailViaTwilio(message: EmailMessage): Promise<EmailResult> {
  // Utilise l'API Email de Twilio SendGrid
  const emailData = {
    personalizations: [{
      to: [{ email: message.to }],
      subject: message.subject
    }],
    from: {
      email: this.config.fromEmail!,
      name: this.config.fromName || 'SMP Platform'
    },
    content: [] as Array<{ type: string; value: string }>
  };

  if (message.html) {
    emailData.content.push({
      type: 'text/html',
      value: message.html
    });
  }

  if (message.text) {
    emailData.content.push({
      type: 'text/plain',
      value: message.text
    });
  }

  // URL correcte pour Twilio SendGrid API
  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${this.config.authToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(emailData)
  });

  if (response.ok) {
    return {
      success: true,
      messageId: response.headers.get('x-message-id') || this.generateMessageId(),
      provider: 'twilio-email',
      timestamp: new Date().toISOString()
    };
  } else {
    const errorText = await response.text();
    throw new Error(`Twilio SendGrid API error: ${response.status} - ${errorText}`);
  }
}

  private async sendSMSViaTwilio(message: EmailMessage): Promise<EmailResult> {
    // Convertir le message email en SMS
    const smsBody = this.convertEmailToSMS(message);
    
    const smsMessage = await this.client.messages.create({
      body: smsBody,
      from: this.config.fromPhoneNumber,
      to: this.extractPhoneFromEmail(message.to) // Fonction pour extraire/convertir
    });

    return {
      success: true,
      messageId: smsMessage.sid,
      provider: 'twilio-sms',
      timestamp: new Date().toISOString(),
      metadata: {
        smsId: smsMessage.sid,
        status: smsMessage.status
      }
    };
  }

  async sendMagicLink(email: string, token: string, options?: {
    redirectUrl?: string;
    action?: string;
    expiresAt?: string;
    userAgent?: string;
    ip?: string;
  }): Promise<EmailResult> {
    const magicLinkUrl = this.buildMagicLinkUrl(token, options?.redirectUrl);
    
    if (this.config.useEmailApi) {
      const message: EmailMessage = {
        to: email,
        subject: this.getMagicLinkSubject(options?.action),
        html: await this.renderMagicLinkTemplate({
          email,
          magicLinkUrl,
          action: options?.action || 'login',
          expiresAt: options?.expiresAt,
          userAgent: options?.userAgent,
          ip: options?.ip
        })
      };
      
      return this.sendEmail(message);
    } else {
      // Envoyer par SMS
      const smsMessage = this.buildMagicLinkSMS({
        email,
        magicLinkUrl,
        action: options?.action || 'login',
        expiresAt: options?.expiresAt
      });

      const twilioMessage = await this.client.messages.create({
        body: smsMessage,
        from: this.config.fromPhoneNumber,
        to: this.extractPhoneFromEmail(email)
      });

      return {
        success: true,
        messageId: twilioMessage.sid,
        provider: 'twilio-sms',
        timestamp: new Date().toISOString()
      };
    }
  }

  async sendMFACode(email: string, code: string, options?: {
    method?: string;
    expiresInMinutes?: number;
  }): Promise<EmailResult> {
    if (this.config.useEmailApi) {
      const message: EmailMessage = {
        to: email,
        subject: 'Your verification code',
        html: await this.renderMFATemplate({
          email,
          code,
          method: options?.method || 'sms',
          expiresInMinutes: options?.expiresInMinutes || 5
        })
      };
      
      return this.sendEmail(message);
    } else {
      // Envoyer code MFA par SMS
      const smsBody = `Your verification code is: ${code}. Valid for ${options?.expiresInMinutes || 5} minutes.`;
      
      const twilioMessage = await this.client.messages.create({
        body: smsBody,
        from: this.config.fromPhoneNumber,
        to: this.extractPhoneFromEmail(email)
      });

      return {
        success: true,
        messageId: twilioMessage.sid,
        provider: 'twilio-sms',
        timestamp: new Date().toISOString()
      };
    }
  }

  async sendWelcomeEmail(email: string, options: {
    firstName?: string;
    lastName?: string;
    verificationUrl?: string;
  }): Promise<EmailResult> {
    if (this.config.useEmailApi) {
      const message: EmailMessage = {
        to: email,
        subject: 'Welcome to SMP Platform',
        html: await this.renderWelcomeTemplate({
          email,
          firstName: options.firstName,
          lastName: options.lastName,
          verificationUrl: options.verificationUrl
        })
      };
      
      return this.sendEmail(message);
    } else {
      // Welcome message par SMS
      const name = options.firstName ? `${options.firstName} ${options.lastName || ''}`.trim() : '';
      const smsBody = `Welcome to SMP Platform${name ? `, ${name}` : ''}! Your account has been created successfully.`;
      
      const twilioMessage = await this.client.messages.create({
        body: smsBody,
        from: this.config.fromPhoneNumber,
        to: this.extractPhoneFromEmail(email)
      });

      return {
        success: true,
        messageId: twilioMessage.sid,
        provider: 'twilio-sms',
        timestamp: new Date().toISOString()
      };
    }
  }

  // Méthodes utilitaires
  private buildMagicLinkUrl(token: string, redirectUrl?: string): string {
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const magicLinkPath = '/auth/magic-link';
    
    const url = new URL(magicLinkPath, baseUrl);
    url.searchParams.set('token', token);
    
    if (redirectUrl) {
      url.searchParams.set('redirect', encodeURIComponent(redirectUrl));
    }
    
    return url.toString();
  }

  private getMagicLinkSubject(action?: string): string {
    switch (action) {
      case 'register':
        return 'Complete your registration';
      case 'reset_password':
        return 'Reset your password';
      case 'verify_email':
        return 'Verify your email address';
      case 'login':
      default:
        return 'Your secure login link';
    }
  }

  private buildMagicLinkSMS(data: {
    email: string;
    magicLinkUrl: string;
    action: string;
    expiresAt?: string;
  }): string {
    const actionText = this.getActionText(data.action);
    const expirationText = data.expiresAt 
      ? `Expires: ${new Date(data.expiresAt).toLocaleString()}`
      : 'Expires in 30 minutes';

    return `🔐 SMP Platform: Click to ${actionText}: ${data.magicLinkUrl} (${expirationText})`;
  }

  private convertEmailToSMS(message: EmailMessage): string {
    // Convertir le contenu HTML/text en format SMS
    if (message.text) {
      return message.text.substring(0, 1600); // Limite SMS
    }
    
    if (message.html) {
      // Extraction basique du texte depuis HTML
      const text = message.html
        .replace(/<[^>]*>/g, '') // Supprimer tags HTML
        .replace(/\s+/g, ' ') // Normaliser espaces
        .trim();
      return text.substring(0, 1600);
    }
    
    return message.subject;
  }

  private extractPhoneFromEmail(email: string): string {
    // Cette fonction doit être adaptée à votre logique métier
    // Exemples de stratégies :
    
    // 1. Si l'email contient un numéro de téléphone
    const phoneMatch = email.match(/(\+?\d{10,15})/);
    if (phoneMatch) {
      return phoneMatch[1];
    }
    
    // 2. Lookup dans une base de données utilisateur
    // return await this.getUserPhoneNumber(email);
    
    // 3. Format spécial email+phone
    if (email.includes('+')) {
      const parts = email.split('+');
      if (parts.length > 1 && /^\d+/.test(parts[1])) {
        return '+' + parts[1].split('@')[0];
      }
    }
    
    // 4. Valeur par défaut ou erreur
    throw new Error(`Cannot extract phone number from email: ${email}. Please provide phone number.`);
  }

  private async renderMagicLinkTemplate(data: {
    email: string;
    magicLinkUrl: string;
    action: string;
    expiresAt?: string;
    userAgent?: string;
    ip?: string;
  }): Promise<string> {
    const expirationText = data.expiresAt 
      ? `This link expires on ${new Date(data.expiresAt).toLocaleString()}`
      : 'This link expires in 30 minutes';

    const actionText = this.getActionText(data.action);

    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>${this.getMagicLinkSubject(data.action)}</title>
        <style>
            body { font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; }
            .container { background: white; border-radius: 8px; padding: 30px; }
            .button { display: inline-block; background: #007bff; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🔐 Secure Access Link</h1>
            <p>You requested a secure link to ${actionText}. Click below to continue:</p>
            <div style="text-align: center; margin: 30px 0;">
                <a href="${data.magicLinkUrl}" class="button">${this.getButtonText(data.action)}</a>
            </div>
            <p><strong>${expirationText}</strong></p>
            <p style="color: #666;">If you didn't request this, ignore this email.</p>
        </div>
    </body>
    </html>`;
  }

  private async renderMFATemplate(data: {
    email: string;
    code: string;
    method: string;
    expiresInMinutes: number;
  }): Promise<string> {
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>Your Verification Code</title>
        <style>
            body { font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; }
            .code { font-size: 32px; font-weight: bold; text-align: center; margin: 20px 0; }
        </style>
    </head>
    <body>
        <h1>🔢 Verification Code</h1>
        <p>Your verification code is:</p>
        <div class="code">${data.code}</div>
        <p><strong>This code expires in ${data.expiresInMinutes} minutes.</strong></p>
    </body>
    </html>`;
  }

  private async renderWelcomeTemplate(data: {
    email: string;
    firstName?: string;
    lastName?: string;
    verificationUrl?: string;
  }): Promise<string> {
    const name = data.firstName 
      ? `${data.firstName} ${data.lastName || ''}`.trim()
      : 'New User';

    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>Welcome to SMP Platform</title>
        <style>
            body { font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; }
            .button { display: inline-block; background: #28a745; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; }
        </style>
    </head>
    <body>
        <h1>🎉 Welcome to SMP Platform!</h1>
        <p>Hello ${name}!</p>
        <p>Your account has been successfully created.</p>
        ${data.verificationUrl ? `
        <p>Please verify your email address:</p>
        <div style="text-align: center;">
            <a href="${data.verificationUrl}" class="button">Verify Email</a>
        </div>
        ` : ''}
    </body>
    </html>`;
  }

  private getActionText(action: string): string {
    switch (action) {
      case 'register': return 'complete your registration';
      case 'reset_password': return 'reset your password';
      case 'verify_email': return 'verify your email address';
      case 'login':
      default: return 'sign in to your account';
    }
  }

  private getButtonText(action: string): string {
    switch (action) {
      case 'register': return 'Complete Registration';
      case 'reset_password': return 'Reset Password';
      case 'verify_email': return 'Verify Email';
      case 'login':
      default: return 'Sign In Securely';
    }
  }

  private handleError(error: any): EmailResult {
    console.error('Twilio error:', error);

    let errorMessage = 'Unknown Twilio error';
    
    if (error.message) {
      errorMessage = error.message;
    } else if (error.code) {
      errorMessage = `Twilio error code: ${error.code}`;
    }

    return {
      success: false,
      error: errorMessage,
      provider: this.config.useEmailApi ? 'twilio-email' : 'twilio-sms',
      timestamp: new Date().toISOString()
    };
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}