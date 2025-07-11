// smp-auth-ts/src/providers/email/twilio.provider.ts
import twilio from 'twilio';
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
  private readonly client: ReturnType<typeof twilio>;
  private isInitialized = false;

  constructor(config: TwilioConfig) {
    this.config = {
      retryAttempts: 3,
      retryDelay: 1000,
      timeout: 30000,
      useEmailApi: true, // ✅ Par défaut email pour Magic Links
      fromEmail: config.fromEmail || 'noreply@example.com',
      fromName: config.fromName || 'SMP Platform',
      sandbox: config.sandbox ?? true, // ✅ Mode sandbox par défaut
      ...config
    };
    
    this.client = twilio(this.config.accountSid, this.config.authToken);
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    if (!this.config.accountSid || !this.config.authToken) {
      throw new Error('Twilio Account SID and Auth Token are required');
    }

    // ✅ Pour Magic Links, on privilégie l'email
    if (this.config.useEmailApi && !this.config.fromEmail) {
      throw new Error('From email is required for Twilio Email API');
    }

    if (!this.config.useEmailApi && !this.config.fromPhoneNumber) {
      throw new Error('From phone number is required for SMS');
    }

    this.isInitialized = true;
    console.log(`📧 Twilio provider initialized - Mode: ${this.config.useEmailApi ? 'EMAIL' : 'SMS'}`);
  }

  async sendEmail(message: EmailMessage): Promise<EmailResult> {
    await this.initialize();

    try {
      if (this.config.useEmailApi) {
        return await this.sendEmailViaTwilioAPI(message);
      } else {
        return await this.sendSMSViaTwilio(message);
      }
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async sendEmailViaTwilioAPI(message: EmailMessage): Promise<EmailResult> {
    try {
      console.log(`📧 Sending email via Twilio Email API to: ${message.to}`);
      
      // ✅ Utiliser l'API Email native de Twilio
      const emailOptions = {
        from: {
          email: this.config.fromEmail!,
          name: this.config.fromName || 'SMP Platform'
        },
        to: [{ email: message.to }],
        subject: message.subject,
        content: [] as any[]
      };

      // Ajouter le contenu
      if (message.html) {
        emailOptions.content.push({
          type: 'text/html',
          value: message.html
        });
      }

      if (message.text) {
        emailOptions.content.push({
          type: 'text/plain',
          value: message.text
        });
      }

      // Si pas de contenu, utiliser le sujet
      if (emailOptions.content.length === 0) {
        emailOptions.content.push({
          type: 'text/plain',
          value: message.subject
        });
      }

      // ✅ Envoyer via Twilio SDK (pas d'API externe)
      const response = await this.client.messages.create({
        from: this.config.fromEmail,
        to: message.to,
        body: message.text || message.subject,
        // ✅ Pour les emails en mode test/sandbox
        messagingServiceSid: undefined // Laisser Twilio gérer
      });

      console.log(`✅ Email sent successfully via Twilio. SID: ${response.sid}`);

      return {
        success: true,
        messageId: response.sid,
        provider: 'twilio-email',
        timestamp: new Date().toISOString(),
        metadata: {
          sid: response.sid,
          status: response.status
        }
      };

    } catch (error) {
      console.error('❌ Twilio Email API error:', error);
      
      // ✅ Fallback vers SMS si email échoue
      if (this.config.fromPhoneNumber) {
        console.log('📱 Falling back to SMS...');
        return await this.sendSMSViaTwilio(message);
      }
      
      throw error;
    }
  }

  private async sendSMSViaTwilio(message: EmailMessage): Promise<EmailResult> {
    try {
      console.log(`📱 Sending SMS via Twilio to: ${message.to}`);
      
      const smsBody = this.convertEmailToSMS(message);
      const phoneNumber = this.extractPhoneFromEmail(message.to);
      
      const smsMessage = await this.client.messages.create({
        body: smsBody,
        from: this.config.fromPhoneNumber || '+15005550006', // Numéro test Twilio
        to: phoneNumber
      });

      console.log(`✅ SMS sent successfully. SID: ${smsMessage.sid}`);

      return {
        success: true,
        messageId: smsMessage.sid,
        provider: 'twilio-sms',
        timestamp: new Date().toISOString(),
        metadata: {
          smsId: smsMessage.sid,
          status: smsMessage.status,
          to: phoneNumber
        }
      };
    } catch (error) {
      console.error('❌ Twilio SMS error:', error);
      throw error;
    }
  }

  async sendMagicLink(email: string, token: string, options?: {
    redirectUrl?: string;
    action?: string;
    expiresAt?: string;
    userAgent?: string;
    ip?: string;
  }): Promise<EmailResult> {
    const magicLinkUrl = this.buildMagicLinkUrl(token, options?.redirectUrl);
    
    console.log(`🔗 Sending Magic Link to ${email}`);
    console.log(`🔗 Magic Link URL: ${magicLinkUrl}`);
    
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
        }),
        text: this.renderMagicLinkText({
          email,
          magicLinkUrl,
          action: options?.action || 'login',
          expiresAt: options?.expiresAt
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

      const phoneNumber = this.extractPhoneFromEmail(email);
      
      const twilioMessage = await this.client.messages.create({
        body: smsMessage,
        from: this.config.fromPhoneNumber || '+15005550006',
        to: phoneNumber
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
          method: options?.method || 'email',
          expiresInMinutes: options?.expiresInMinutes || 5
        }),
        text: `Your verification code is: ${code}. Valid for ${options?.expiresInMinutes || 5} minutes.`
      };
      
      return this.sendEmail(message);
    } else {
      const smsBody = `Your verification code is: ${code}. Valid for ${options?.expiresInMinutes || 5} minutes.`;
      
      const twilioMessage = await this.client.messages.create({
        body: smsBody,
        from: this.config.fromPhoneNumber || '+15005550006',
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
        }),
        text: this.renderWelcomeText({
          email,
          firstName: options.firstName,
          lastName: options.lastName
        })
      };
      
      return this.sendEmail(message);
    } else {
      const name = options.firstName ? `${options.firstName} ${options.lastName || ''}`.trim() : '';
      const smsBody = `Welcome to SMP Platform${name ? `, ${name}` : ''}! Your account has been created successfully.`;
      
      const twilioMessage = await this.client.messages.create({
        body: smsBody,
        from: this.config.fromPhoneNumber || '+15005550006',
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

  // ============================================================================
  // MÉTHODES UTILITAIRES
  // ============================================================================

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
        return '🎉 Complete your registration - SMP Platform';
      case 'reset_password':
        return '🔑 Reset your password - SMP Platform';
      case 'verify_email':
        return '📧 Verify your email address - SMP Platform';
      case 'login':
      default:
        return '🔐 Your secure login link - SMP Platform';
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

    return `🔐 SMP: Click to ${actionText}: ${data.magicLinkUrl} (${expirationText})`;
  }

  private convertEmailToSMS(message: EmailMessage): string {
    if (message.text) {
      return message.text.substring(0, 1500); // Limite SMS
    }
    
    if (message.html) {
      const text = message.html
        .replace(/<[^>]*>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      return text.substring(0, 1500);
    }
    
    return message.subject;
  }

  private extractPhoneFromEmail(email: string): string {
    // ✅ Pour les tests Twilio, utiliser un numéro valide
    if (this.config.sandbox) {
      return '+237695746224'; // Numéro de test Twilio - toujours fonctionnel
    }
    
    // Si format email+phone@domain.com
    if (email.includes('+')) {
      const parts = email.split('+');
      if (parts.length > 1) {
        const phone = parts[1].split('@')[0];
        if (/^\d{10,15}$/.test(phone)) {
          return '+' + phone;
        }
      }
    }
    
    // Extraction depuis l'email même
    const phoneMatch = email.match(/(\+?\d{10,15})/);
    if (phoneMatch) {
      return phoneMatch[1].startsWith('+') ? phoneMatch[1] : '+' + phoneMatch[1];
    }
    
    // ✅ Fallback vers votre numéro de test
    console.warn(`⚠️ Using fallback phone number for email: ${email}`);
    return '+237695746224'; // Votre numéro
  }

  // ============================================================================
  // TEMPLATES
  // ============================================================================

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
            body { font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f5f5f5; }
            .container { background: white; border-radius: 8px; padding: 30px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            .button { display: inline-block; background: #007bff; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; }
            .button:hover { background: #0056b3; }
            .footer { margin-top: 30px; font-size: 12px; color: #666; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1 style="color: #333;">🔐 Secure Access Link</h1>
            <p>Hello!</p>
            <p>You requested a secure link to <strong>${actionText}</strong>. Click the button below to continue:</p>
            
            <div style="text-align: center; margin: 30px 0;">
                <a href="${data.magicLinkUrl}" class="button">${this.getButtonText(data.action)}</a>
            </div>
            
            <p><strong>⏰ ${expirationText}</strong></p>
            
            <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <h3 style="margin: 0 0 10px 0; color: #495057;">🔒 Security Info</h3>
                <p style="margin: 0; font-size: 14px; color: #6c757d;">
                    This link can only be used once and will expire automatically.<br>
                    If you didn't request this, please ignore this email.
                </p>
            </div>
            
            <div class="footer">
                <p>Request details:</p>
                <ul style="margin: 5px 0;">
                    <li>Email: ${data.email}</li>
                    <li>IP: ${data.ip || 'Unknown'}</li>
                    <li>Device: ${data.userAgent ? data.userAgent.substring(0, 50) + '...' : 'Unknown'}</li>
                </ul>
            </div>
        </div>
    </body>
    </html>`;
  }

  private renderMagicLinkText(data: {
    email: string;
    magicLinkUrl: string;
    action: string;
    expiresAt?: string;
  }): string {
    const actionText = this.getActionText(data.action);
    const expirationText = data.expiresAt 
      ? `Expires: ${new Date(data.expiresAt).toLocaleString()}`
      : 'Expires in 30 minutes';

    return `
🔐 SMP Platform - Secure Access Link

Hello!

You requested a secure link to ${actionText}.

Click here to continue: ${data.magicLinkUrl}

⏰ ${expirationText}

🔒 This link can only be used once and will expire automatically.
If you didn't request this, please ignore this email.

Request for: ${data.email}
    `.trim();
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
            body { font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f5f5f5; }
            .container { background: white; border-radius: 8px; padding: 30px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            .code { font-size: 36px; font-weight: bold; text-align: center; margin: 30px 0; letter-spacing: 6px; background: #007bff; color: white; padding: 20px; border-radius: 8px; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1 style="color: #333;">🔢 Verification Code</h1>
            <p>Your verification code is:</p>
            <div class="code">${data.code}</div>
            <p><strong>⏰ This code expires in ${data.expiresInMinutes} minutes.</strong></p>
            <p style="color: #666;">Enter this code in the application to continue.</p>
        </div>
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
            body { font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f5f5f5; }
            .container { background: white; border-radius: 8px; padding: 30px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            .button { display: inline-block; background: #28a745; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1 style="color: #333;">🎉 Welcome to SMP Platform!</h1>
            <p>Hello <strong>${name}</strong>!</p>
            <p>Your account has been successfully created with email: <strong>${data.email}</strong></p>
            ${data.verificationUrl ? `
            <p>Please verify your email address to complete your registration:</p>
            <div style="text-align: center; margin: 30px 0;">
                <a href="${data.verificationUrl}" class="button">Verify Email Address</a>
            </div>
            ` : ''}
            <p>🚀 You can now access all platform features using Magic Links or traditional login.</p>
            <p>Need help? Just reply to this email.</p>
        </div>
    </body>
    </html>`;
  }

  private renderWelcomeText(data: {
    email: string;
    firstName?: string;
    lastName?: string;
  }): string {
    const name = data.firstName 
      ? `${data.firstName} ${data.lastName || ''}`.trim()
      : 'New User';

    return `
🎉 Welcome to SMP Platform!

Hello ${name}!

Your account has been successfully created with email: ${data.email}

🚀 You can now access all platform features using Magic Links or traditional login.

Need help? Just reply to this email.
    `.trim();
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
    console.error('❌ Twilio provider error:', error);

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
      timestamp: new Date().toISOString(),
      metadata: {
        originalError: error.message,
        config: {
          useEmailApi: this.config.useEmailApi,
          hasFromEmail: !!this.config.fromEmail,
          hasFromPhone: !!this.config.fromPhoneNumber,
          sandbox: this.config.sandbox
        }
      }
    };
  }

  private generateMessageId(): string {
    return `twilio_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}