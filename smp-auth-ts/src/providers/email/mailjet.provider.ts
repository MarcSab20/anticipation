import { 
  EmailProvider, 
  EmailMessage, 
  EmailResult, 
  EmailConfig
} from '../../interface/email.interface.js';
import https from 'https';
import { Buffer } from 'buffer';

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
            ...config,
      retryAttempts: 3,
      retryDelay: 1000,
      timeout: 60000,
      fromName: config.fromName || 'SMP Platform',
      sandbox: config.sandbox ?? (process.env.NODE_ENV !== 'production'),
      apiKey:'9f9407158854c43269491c424a3df4f7',
      apiSecret: 'a0d7e5c8275f4634a33dacb93ea1c9f3',
      fromEmail:'marcfotso20@gmail.com'
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

      const result = await this.sendEmailWithHttps(mailData);
      return result;

    } catch (error) {
      console.error('❌ Mailjet provider error:', error);
      return this.handleError(error);
    }
  }
  
  private async sendEmailWithHttps(mailData: any): Promise<EmailResult> {
    return new Promise((resolve) => {
      console.log('📧 Sending via Mailjet HTTPS API...');
      
      const auth = Buffer.from(`${this.config.apiKey}:${this.config.apiSecret}`).toString('base64');
      const postData = JSON.stringify(mailData);
      
      const options = {
        hostname: 'api.mailjet.com',
        port: 443,
        path: '/v3.1/send',
        method: 'POST',
        family: 4,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${auth}`,
          'Content-Length': Buffer.byteLength(postData),
          'User-Agent': 'smp-auth-ts-es6/2.0.0',
          'Accept': 'application/json',
          'Connection': 'close' 
        },
        timeout: 10000
      };

      const req = https.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            console.log(`📧 Mailjet response status: ${res.statusCode}`);
            console.log(`📧 Mailjet response data: ${data}`);
            
            const result = JSON.parse(data);
            
            if (res.statusCode === 200 && result.Messages?.[0]?.Status === 'success') {
              const messageId = result.Messages[0].To[0].MessageID || this.generateMessageId();
              
              console.log(`✅ Email sent successfully via Mailjet HTTPS. Message ID: ${messageId}`);
              
              resolve({
                success: true,
                messageId,
                provider: 'mailjet-https',
                timestamp: new Date().toISOString(),
                metadata: { messageId, response: result }
              });
            } else {
              const errorMsg = result.Messages?.[0]?.Errors?.[0]?.ErrorMessage || `HTTP ${res.statusCode}`;
              console.error(`❌ Mailjet API error: ${errorMsg}`);
              
              resolve(this.handleError(new Error(errorMsg)));
            }
          } catch (parseError) {
            console.error('❌ Failed to parse Mailjet response:', parseError);
            resolve(this.handleError(parseError));
          }
        });
      });

      req.on('timeout', () => {
        console.error('❌ Mailjet request timeout');
        req.destroy();
        resolve(this.handleError(new Error('Request timeout')));
      });

      req.on('error', (error) => {
        console.error('❌ Mailjet request error:', error);
        resolve(this.handleError(error));
      });

      req.write(postData);
      req.end();
    });
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

  private buildMagicLinkUrl(token: string, redirectUrl?: string): string {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const magicLinkPath = '/api/auth/magic-link/verify-and-redirect';
    
    const url = new URL(magicLinkPath, frontendUrl);
    url.searchParams.set('token', token);
    
    if (redirectUrl) {
      url.searchParams.set('redirect', redirectUrl);
    }
    
    console.log(`🔗 Magic Link URL generated: ${url.toString()}`);
    
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
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${this.getMagicLinkSubject(data.action)}</title>
        <style>
            body { 
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                max-width: 600px; 
                margin: 0 auto; 
                padding: 20px; 
                background: #f8fafc; 
                color: #1a202c;
            }
            .container { 
                background: white; 
                border-radius: 12px; 
                padding: 40px; 
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
                border: 1px solid #e2e8f0;
            }
            .header {
                text-align: center;
                margin-bottom: 30px;
            }
            .logo {
                font-size: 24px;
                font-weight: bold;
                color: #3182ce;
                margin-bottom: 10px;
            }
            .button { 
                display: inline-block; 
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white; 
                padding: 16px 32px; 
                text-decoration: none; 
                border-radius: 8px; 
                font-weight: 600;
                font-size: 16px;
                transition: all 0.3s ease;
                box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
            }
            .button:hover { 
                transform: translateY(-2px);
                box-shadow: 0 8px 25px rgba(102, 126, 234, 0.6);
            }
            .security-box {
                background: linear-gradient(135deg, #f7fafc 0%, #edf2f7 100%);
                padding: 20px;
                border-radius: 8px;
                margin: 25px 0;
                border-left: 4px solid #48bb78;
            }
            .footer { 
                margin-top: 30px; 
                font-size: 12px; 
                color: #718096;
                border-top: 1px solid #e2e8f0;
                padding-top: 20px;
            }
            .highlight {
                background: linear-gradient(120deg, #a8edea 0%, #fed6e3 100%);
                padding: 2px 8px;
                border-radius: 4px;
                font-weight: 600;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div class="logo">🔐 SMP Platform</div>
                <h1 style="color: #2d3748; margin: 0;">Secure Access Link</h1>
            </div>
            
            <p style="font-size: 16px; line-height: 1.6;">Hello!</p>
            <p style="font-size: 16px; line-height: 1.6;">
                You requested a secure link to <span class="highlight">${actionText}</span>. 
                Click the button below to continue:
            </p>
            
            <div style="text-align: center; margin: 35px 0;">
                <a href="${data.magicLinkUrl}" class="button">${this.getButtonText(data.action)}</a>
            </div>
            
            <p style="text-align: center; font-weight: 600; color: #e53e3e;">
                ⏰ ${expirationText}
            </p>
            
            <div class="security-box">
                <h3 style="margin: 0 0 10px 0; color: #38a169; font-size: 16px;">
                    🔒 Security Information
                </h3>
                <p style="margin: 0; font-size: 14px; color: #4a5568; line-height: 1.5;">
                    This link can only be used <strong>once</strong> and will expire automatically.<br>
                    If you didn't request this, please ignore this email.
                </p>
            </div>
            
            <div class="footer">
                <p><strong>Request details:</strong></p>
                <ul style="margin: 5px 0; padding-left: 20px;">
                    <li>Email: ${data.email}</li>
                    <li>IP Address: ${data.ip || 'Unknown'}</li>
                    <li>Device: ${data.userAgent ? data.userAgent.substring(0, 50) + '...' : 'Unknown'}</li>
                    <li>Time: ${new Date().toLocaleString()}</li>
                </ul>
                <!-- 🧪 LIENS DE TEST DIRECT -->
                <div style="margin-top: 15px; padding: 10px; background: #e6fffa; border-radius: 5px;">
                    <p style="margin: 0; font-weight: bold; color: #234e52;">🧪 Test Links:</p>
                    <p style="margin: 5px 0; font-size: 11px;">
                        <a href="${data.magicLinkUrl}" style="color: #065f46;">Direct Backend Link</a>
                    </p>
                    <p style="margin: 5px 0; font-size: 11px;">
                        <a href="${process.env.BACKEND_URL || 'http://localhost:3001'}/test/magic-link/simulate-frontend?token=${data.magicLinkUrl.split('token=')[1]?.split('&')[0] || ''}" style="color: #065f46;">Test Simulation Link</a>
                    </p>
                </div>
                <p style="margin-top: 15px; font-style: italic;">
                    Need help? Contact our support team.
                </p>
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
Time: ${new Date().toLocaleString()}

Need help? Contact our support team.
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
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
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
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
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