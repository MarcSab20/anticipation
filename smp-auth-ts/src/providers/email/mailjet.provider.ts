import { 
  EmailProvider, 
  EmailMessage, 
  EmailResult, 
  EmailConfig
} from '../../interface/email.interface.js';

export interface MailjetConfig extends EmailConfig {
  apiKey: string;
  apiSecret: string;
  fromEmail: string;
  fromName?: string;
  templates?: {
    magicLink: string;
    mfaCode: string;
    welcome: string;
    passwordReset: string;
  };
  sandbox?: boolean;
}

export class MailjetProvider implements EmailProvider {
  private readonly config: MailjetConfig;
  private isInitialized = false;

  constructor(config: MailjetConfig) {
    this.config = {
      retryAttempts: 3,
      retryDelay: 1000,
      timeout: 30000,
      fromName: config.fromName || 'SMP Platform',
      sandbox: config.sandbox ?? (process.env.NODE_ENV !== 'production'),
      //fromEmail: config.fromEmail,
      ...config
    };
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    if (!this.config.apiKey || !this.config.apiSecret) {
      throw new Error('Mailjet API Key and Secret are required');
    }

    if (!this.config.fromEmail) {
      throw new Error('From email is required for Mailjet');
    }

    this.isInitialized = true;
    console.log(`📧 Mailjet provider initialized - From: ${this.config.fromEmail}`);
  }

  async sendEmail(message: EmailMessage): Promise<EmailResult> {
    await this.initialize();

    try {
      console.log(`📧 Sending email via Mailjet to: ${message.to}`);
      
      const auth = Buffer.from(`${this.config.apiKey}:${this.config.apiSecret}`).toString('base64');
      
      const mailData = {
        Messages: [
          {
            From: {
              Email: this.config.fromEmail,
              Name: this.config.fromName
            },
            To: [
              {
                Email: message.to
              }
            ],
            Subject: message.subject,
            HTMLPart: message.html,
            TextPart: message.text
          }
        ]
      };

      const response = await fetch('https://api.mailjet.com/v3.1/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${auth}`
        },
        body: JSON.stringify(mailData)
      });

      const result = await response.json();

      if (response.ok && result.Messages?.[0]?.Status === 'success') {
        const messageId = result.Messages[0].To[0].MessageID || this.generateMessageId();
        
        console.log(`✅ Email sent successfully via Mailjet. Message ID: ${messageId}`);

        return {
          success: true,
          messageId,
          provider: 'mailjet',
          timestamp: new Date().toISOString(),
          metadata: {
            messageId,
            response: result
          }
        };
      } else {
        throw new Error(result.Messages?.[0]?.Errors?.[0]?.ErrorMessage || 'Mailjet send failed');
      }

    } catch (error) {
      console.error('❌ Mailjet provider error:', error);
      return this.handleError(error);
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
  }

  async sendMFACode(email: string, code: string, options?: {
    method?: string;
    expiresInMinutes?: number;
  }): Promise<EmailResult> {
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
  }

  async sendWelcomeEmail(email: string, options: {
    firstName?: string;
    lastName?: string;
    verificationUrl?: string;
  }): Promise<EmailResult> {
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

  // ============================================================================
  // TEMPLATES (identiques au code original)
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

  private handleError(error: any): EmailResult {
    console.error('❌ Mailjet provider error:', error);

    let errorMessage = 'Unknown Mailjet error';
    
    if (error.message) {
      errorMessage = error.message;
    } else if (error.code) {
      errorMessage = `Mailjet error code: ${error.code}`;
    }

    return {
      success: false,
      error: errorMessage,
      provider: 'mailjet',
      timestamp: new Date().toISOString(),
      metadata: {
        originalError: error.message,
        config: {
          hasApiKey: !!this.config.apiKey,
          hasFromEmail: !!this.config.fromEmail,
          sandbox: this.config.sandbox
        }
      }
    };
  }

  private generateMessageId(): string {
    return `mailjet_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
