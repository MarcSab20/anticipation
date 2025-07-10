import {
  EmailService,
  EmailProvider,
  EmailMessage,
  EmailResult,
  EmailEvent,
  EmailEventType,
  EmailEventCallback
} from '../interface/email.interface.js';

export class EmailServiceImpl implements EmailService {
  private providers: Map<string, EmailProvider> = new Map();
  private defaultProvider?: string;
  private eventCallbacks: Map<EmailEventType, EmailEventCallback[]> = new Map();

  constructor() {
  }


  registerProvider(name: string, provider: EmailProvider): void {
    this.providers.set(name, provider);

    console.log(`📧 Email provider '${name}' registered successfully`);
  }

  setDefaultProvider(name: string): void {
    if (!this.providers.has(name)) {
      throw new Error(`Email provider '${name}' not found`);
    }
    this.defaultProvider = name;
    console.log(`📧 Default email provider set to '${name}'`);
  }

  private getProvider(providerName?: string): { name: string; provider: EmailProvider } {
    const name = providerName || this.defaultProvider;
    
    if (!name) {
      throw new Error('No email provider specified and no default provider set');
    }

    const provider = this.providers.get(name);
    if (!provider) {
      throw new Error(`Email provider '${name}' not found`);
    }

    return { name, provider };
  }


  async sendEmail(message: EmailMessage, providerName?: string): Promise<EmailResult> {
    const startTime = Date.now();
    const { name, provider } = this.getProvider(providerName);

    try {
      this.validateMessage(message);

      const result = await provider.sendEmail(message);
      
      await this.emitEvent({
        type: result.success ? 'email_sent' : 'email_failed',
        provider: name,
        email: message.to,
        messageId: result.messageId,
        success: result.success,
        error: result.error,
        metadata: {
          subject: message.subject,
          deliveryTime: Date.now() - startTime
        }
      });

      return result;
    } catch (error) {
      const errorResult: EmailResult = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        provider: name,
        timestamp: new Date().toISOString()
      };
      
      await this.emitEvent({
        type: 'email_failed',
        provider: name,
        email: message.to,
        success: false,
        error: errorResult.error
      });

      return errorResult;
    }
  }

  async sendMagicLink(email: string, token: string, options?: {
    redirectUrl?: string;
    action?: string;
    expiresAt?: string;
    userAgent?: string;
    ip?: string;
    provider?: string;
  }): Promise<EmailResult> {
    const { name, provider } = this.getProvider(options?.provider);

    try {
      console.log(`📧 Sending magic link to ${email} via ${name}`);
      
      const result = await provider.sendMagicLink(email, token, {
        redirectUrl: options?.redirectUrl,
        action: options?.action || 'login',
        expiresAt: options?.expiresAt,
        userAgent: options?.userAgent,
        ip: options?.ip
      });

      await this.emitEvent({
        type: result.success ? 'email_sent' : 'email_failed',
        provider: name,
        email,
        messageId: result.messageId,
        success: result.success,
        error: result.error,
        metadata: {
          type: 'magic_link',
          action: options?.action || 'login'
        }
      });

      return result;
    } catch (error) {
      const errorResult: EmailResult = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        provider: name,
        timestamp: new Date().toISOString()
      };

      await this.emitEvent({
        type: 'email_failed',
        provider: name,
        email,
        success: false,
        error: errorResult.error,
        metadata: { type: 'magic_link' }
      });

      return errorResult;
    }
  }

  async sendMFACode(email: string, code: string, options?: {
    method?: string;
    expiresInMinutes?: number;
    provider?: string;
  }): Promise<EmailResult> {
    const { name, provider } = this.getProvider(options?.provider);

    try {
      console.log(`📧 Sending MFA code to ${email} via ${name}`);
      
      const result = await provider.sendMFACode(email, code, {
        method: options?.method || 'email',
        expiresInMinutes: options?.expiresInMinutes || 5
      });

      await this.emitEvent({
        type: result.success ? 'email_sent' : 'email_failed',
        provider: name,
        email,
        messageId: result.messageId,
        success: result.success,
        error: result.error,
        metadata: {
          type: 'mfa_code',
          method: options?.method || 'email'
        }
      });

      return result;
    } catch (error) {
      const errorResult: EmailResult = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        provider: name,
        timestamp: new Date().toISOString()
      };

      await this.emitEvent({
        type: 'email_failed',
        provider: name,
        email,
        success: false,
        error: errorResult.error,
        metadata: { type: 'mfa_code' }
      });

      return errorResult;
    }
  }

  async sendWelcomeEmail(email: string, options: {
    firstName?: string;
    lastName?: string;
    verificationUrl?: string;
    provider?: string;
  }): Promise<EmailResult> {
    const { name, provider } = this.getProvider(options.provider);

    try {
      console.log(`📧 Sending welcome email to ${email} via ${name}`);
      
      const result = await provider.sendWelcomeEmail(email, {
        firstName: options.firstName,
        lastName: options.lastName,
        verificationUrl: options.verificationUrl
      });

      await this.emitEvent({
        type: result.success ? 'email_sent' : 'email_failed',
        provider: name,
        email,
        messageId: result.messageId,
        success: result.success,
        error: result.error,
        metadata: {
          type: 'welcome',
          hasVerificationUrl: !!options.verificationUrl
        }
      });

      return result;
    } catch (error) {
      const errorResult: EmailResult = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        provider: name,
        timestamp: new Date().toISOString()
      };

      await this.emitEvent({
        type: 'email_failed',
        provider: name,
        email,
        success: false,
        error: errorResult.error,
        metadata: { type: 'welcome' }
      });

      return errorResult;
    }
  }

  private validateMessage(message: EmailMessage): void {
    if (!message.to) {
      throw new Error('Recipient email is required');
    }

    if (!this.isValidEmail(message.to)) {
      throw new Error('Invalid recipient email format');
    }

    if (!message.subject) {
      throw new Error('Email subject is required');
    }

    if (!message.html && !message.text) {
      throw new Error('Email content (html or text) is required');
    }
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private async emitEvent(event: Omit<EmailEvent, 'id' | 'timestamp'>): Promise<void> {
    const fullEvent: EmailEvent = {
      ...event,
      id: this.generateEventId(),
      timestamp: new Date().toISOString()
    };

    const callbacks = this.eventCallbacks.get(event.type);
    if (callbacks) {
      for (const callback of callbacks) {
        try {
          await callback(fullEvent);
        } catch (error) {
          console.error(`Email event callback error for ${event.type}:`, error);
        }
      }
    }
  }

  private generateEventId(): string {
    return `email_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  addEventListener(eventType: EmailEventType, callback: EmailEventCallback): void {
    if (!this.eventCallbacks.has(eventType)) {
      this.eventCallbacks.set(eventType, []);
    }
    this.eventCallbacks.get(eventType)!.push(callback);
  }

  removeEventListener(eventType: EmailEventType, callback: EmailEventCallback): void {
    const callbacks = this.eventCallbacks.get(eventType);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  getProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  getDefaultProvider(): string | undefined {
    return this.defaultProvider;
  }
}

 export function createEmailService(): EmailService {
    return new EmailServiceImpl();
  }