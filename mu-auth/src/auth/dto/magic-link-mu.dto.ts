// mu-auth/src/auth/dto/magic-link-mu.dto.ts
import { Field, InputType, ObjectType } from '@nestjs/graphql';
import { IsEmail, IsNotEmpty, IsString, IsOptional, IsEnum } from 'class-validator';

@InputType()
export class MagicLinkGenerationInputDto {
  @Field(() => String, { description: "Adresse email" })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @Field(() => String, { nullable: true, defaultValue: 'login', description: "Action à effectuer" })
  @IsOptional()
  @IsEnum(['login', 'register', 'reset_password', 'verify_email'])
  action?: 'login' | 'register' | 'reset_password' | 'verify_email';

  @Field(() => String, { nullable: true, description: "URL de redirection" })
  @IsOptional()
  @IsString()
  redirectUrl?: string;

  @Field(() => String, { nullable: true, description: "Adresse IP" })
  @IsOptional()
  @IsString()
  ip?: string;

  @Field(() => String, { nullable: true, description: "User Agent" })
  @IsOptional()
  @IsString()
  userAgent?: string;

  @Field(() => String, { nullable: true, description: "Empreinte de l'appareil" })
  @IsOptional()
  @IsString()
  deviceFingerprint?: string;

  @Field(() => String, { nullable: true, description: "URL de référence" })
  @IsOptional()
  @IsString()
  referrer?: string;
}

@InputType()
export class MagicLinkVerificationInputDto {
  @Field(() => String, { description: "Token Magic Link" })
  @IsString()
  @IsNotEmpty()
  token: string;
}

@ObjectType()
export class MagicLinkGenerationResponseDto {
  @Field(() => Boolean, { description: "Succès de la génération" })
  success: boolean;

  @Field(() => String, { nullable: true, description: "ID du lien" })
  linkId?: string;

  @Field(() => String, { description: "Message de statut" })
  message: string;

  @Field(() => String, { nullable: true, description: "Date d'expiration" })
  expiresAt?: string;

  @Field(() => Boolean, { nullable: true, description: "Email envoyé" })
  emailSent?: boolean;
}

@ObjectType()
export class MagicLinkVerificationResponseDto {
  @Field(() => Boolean, { description: "Succès de la vérification" })
  success: boolean;

  @Field(() => String, { description: "Statut du lien" })
  status: string;

  @Field(() => String, { nullable: true, description: "Message" })
  message?: string;

  @Field(() => String, { nullable: true, description: "Token d'accès" })
  accessToken?: string;

  @Field(() => String, { nullable: true, description: "Token de rafraîchissement" })
  refreshToken?: string;

  @Field(() => String, { nullable: true, description: "Type de token" })
  tokenType?: string;

  @Field(() => Number, { nullable: true, description: "Durée de validité" })
  expiresIn?: number;

  @Field(() => Boolean, { nullable: true, description: "MFA requis" })
  requiresMFA?: boolean;
}

// Extensions pour AuthController
export interface MagicLinkEndpoints {
  generateMagicLink(body: MagicLinkGenerationInputDto, req?: any): Promise<any>;
  verifyMagicLink(body: MagicLinkVerificationInputDto): Promise<any>;
  getMagicLinkStatus(email: string): Promise<any>;
  revokeMagicLink(linkId: string): Promise<any>;
}