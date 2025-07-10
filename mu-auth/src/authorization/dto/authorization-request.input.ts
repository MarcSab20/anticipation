import { Field, InputType, ID } from '@nestjs/graphql';
import { IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { GraphQLJSONObject } from 'graphql-type-json';
import { Type } from 'class-transformer';

@InputType()
class UserAttributesInput {
  @IsOptional()
  @Field(() => String, { nullable: true, description: "Département de l'utilisateur" })
  department?: string;

  @IsOptional()
  @Field(() => Number, { nullable: true, description: "Niveau d'habilitation" })
  clearanceLevel?: number;

  @IsOptional()
  @Field(() => String, { nullable: true, description: "Date d'expiration du contrat" })
  contractExpiryDate?: string;

  @IsOptional()
  @Field(() => String, { nullable: true, description: "ID du manager" })
  managerId?: string;

  @IsOptional()
  @Field(() => GraphQLJSONObject, { nullable: true, description: "Attributs supplémentaires" })
  additionalAttributes?: Record<string, any>;
}

@InputType()
class ResourceAttributesInput {
  @IsOptional()
  @Field(() => Boolean, { nullable: true, description: "Indique si la ressource est officielle" })
  isOfficial?: boolean;

  @IsOptional()
  @Field(() => String, { nullable: true, description: "Département associé à la ressource" })
  department?: string;

  @IsOptional()
  @Field(() => Boolean, { nullable: true, description: "Indique si la ressource est confidentielle" })
  confidential?: boolean;

  @IsOptional()
  @Field(() => Number, { nullable: true, description: "Niveau d'habilitation requis" })
  requiredClearance?: number;

  @IsOptional()
  @Field(() => String, { nullable: true, description: "État actuel de la ressource" })
  state?: string;

  @IsOptional()
  @Field(() => String, { nullable: true, description: "État cible de la ressource" })
  targetState?: string;

  @IsOptional()
  @Field(() => GraphQLJSONObject, { nullable: true, description: "Attributs supplémentaires" })
  additionalAttributes?: Record<string, any>;
}

@InputType()
class ContextInput {
  @IsOptional()
  @Field(() => String, { nullable: true, description: "Adresse IP" })
  ip?: string;

  @IsOptional()
  @Field(() => Boolean, { nullable: true, description: "Indique si la demande est effectuée pendant les heures de travail" })
  businessHours?: boolean;

  @IsOptional()
  @Field(() => String, { nullable: true, description: "Date courante" })
  currentDate?: string;

  @IsOptional()
  @Field(() => Number, { nullable: true, description: "Score de risque" })
  riskScore?: number;

  @IsOptional()
  @Field(() => GraphQLJSONObject, { nullable: true, description: "Structure hiérarchique de management" })
  managementHierarchy?: Record<string, string>;

  @IsOptional()
  @Field(() => GraphQLJSONObject, { nullable: true, description: "Informations contextuelles supplémentaires" })
  additionalContext?: Record<string, any>;
}

@InputType()
class UserInput {
  @IsString()
  @IsNotEmpty()
  @Field(() => ID, { description: "Identifiant de l'utilisateur" })
  id: string;

  @IsOptional()
  @Field(() => [String], { description: "Rôles de l'utilisateur" })
  roles: string[];

  @IsOptional()
  @Field(() => [String], { nullable: true, description: "IDs des organisations de l'utilisateur" })
  organization_ids?: string[];

  @IsOptional()
  @Field(() => String, { nullable: true, description: "État de l'utilisateur" })
  state?: string;

  @IsOptional()
  @Field(() => UserAttributesInput, { nullable: true, description: "Attributs de l'utilisateur" })
  @ValidateNested()
  @Type(() => UserAttributesInput)
  attributes?: UserAttributesInput;
}

@InputType()
class ResourceInput {
  @IsString()
  @IsNotEmpty()
  @Field(() => ID, { description: "Identifiant de la ressource" })
  id: string;

  @IsString()
  @IsNotEmpty()
  @Field(() => String, { description: "Type de ressource" })
  type: string;

  @IsOptional()
  @Field(() => String, { nullable: true, description: "Identifiant du propriétaire" })
  owner_id?: string;

  @IsOptional()
  @Field(() => String, { nullable: true, description: "Identifiant de l'organisation" })
  organization_id?: string;

  @IsOptional()
  @Field(() => ResourceAttributesInput, { nullable: true, description: "Attributs de la ressource" })
  @ValidateNested()
  @Type(() => ResourceAttributesInput)
  attributes?: ResourceAttributesInput;
}

@InputType()
export class AuthorizationRequestInput {
  @Field(() => UserInput, { description: "Informations sur l'utilisateur" })
  @ValidateNested()
  @Type(() => UserInput)
  user: UserInput;

  @Field(() => ResourceInput, { description: "Informations sur la ressource" })
  @ValidateNested()
  @Type(() => ResourceInput)
  resource: ResourceInput;

  @IsString()
  @IsNotEmpty()
  @Field(() => String, { description: "Action demandée" })
  action: string;

  @IsOptional()
  @Field(() => ContextInput, { nullable: true, description: "Contexte de la demande" })
  @ValidateNested()
  @Type(() => ContextInput)
  context?: ContextInput;
}