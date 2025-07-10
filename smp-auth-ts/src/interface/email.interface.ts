export interface EmailConfig {
  retryAttempts?: number;
  retryDelay?: number;
  timeout?: number;
}

export interface EmailMessage {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  templateId?: string;
  templateData?: Record<string, any>;
  attachments?: EmailAttachment[];
  replyTo?: string;
  metadata?: Record<string, any>;
}

export interface EmailAttachment {
  filename: string;
  content: string | Buffer;
  mimeType: string;
  encoding?: string;
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
  provider: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  htmlContent: string;
  textContent?: string;
  variables: string[];
}

export interface EmailProvider {
 
  initialize(): Promise<void>;

  sendEmail(message: EmailMessage): Promise<EmailResult>;

  sendMagicLink(email: string, token: string, options?: {
    redirectUrl?: string;
    action?: string;
    expiresAt?: string;
    userAgent?: string;
    ip?: string;
  }): Promise<EmailResult>;

  sendMFACode(email: string, code: string, options?: {
    method?: string;
    expiresInMinutes?: number;
  }): Promise<EmailResult>;

  sendWelcomeEmail(email: string, options: {
    firstName?: string;
    lastName?: string;
    verificationUrl?: string;
  }): Promise<EmailResult>;

  
}

export interface EmailService {

  registerProvider(name: string, provider: EmailProvider): void;

  sendEmail(message: EmailMessage, providerName?: string): Promise<EmailResult>;

  sendMagicLink(email: string, token: string, options?: {
    redirectUrl?: string;
    action?: string;
    expiresAt?: string;
    userAgent?: string;
    ip?: string;
    provider?: string;
  }): Promise<EmailResult>;

  sendMFACode(email: string, code: string, options?: {
    method?: string;
    expiresInMinutes?: number;
    provider?: string;
  }): Promise<EmailResult>;


  sendWelcomeEmail(email: string, options: {
    firstName?: string;
    lastName?: string;
    verificationUrl?: string;
    provider?: string;
  }): Promise<EmailResult>;

}

export interface EmailEvent {
  id: string;
  type: EmailEventType;
  provider: string;
  email: string;
  messageId?: string;
  success: boolean;
  timestamp: string;
  error?: string;
  metadata?: Record<string, any>;
}

export type EmailEventType = 
  | 'email_sent'
  | 'email_delivered'
  | 'email_bounced'
  | 'email_opened'
  | 'email_clicked'
  | 'email_failed';

export type EmailEventCallback = (event: EmailEvent) => void | Promise<void>;

export interface EmailProviderFactory {
  createSendGridProvider(config: any): EmailProvider;
}

export interface EmailWebhookHandler {
  handleWebhook(provider: string, payload: any): Promise<void>;
  validateWebhook(provider: string, payload: any, signature: string): boolean;
}

export interface TemplateEngine {
  renderTemplate(templateId: string, data: Record<string, any>): Promise<string>;
  compileTemplate(template: string, data: Record<string, any>): string;
  registerHelper(name: string, helper: Function): void;
}

export interface EmailValidator {
  validateEmail(email: string): boolean;
  validateDomain(domain: string): Promise<boolean>;
  sanitizeContent(content: string): string;
}
