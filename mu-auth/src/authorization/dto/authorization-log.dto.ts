import { Field, ObjectType, ID } from '@nestjs/graphql';
import { GraphQLJSONObject } from 'graphql-type-json';

@ObjectType()
export class AuthorizationLogDto {
  @Field(() => ID, { description: "Identifiant du log" })
  id: string;

  @Field(() => ID, { description: "Identifiant de l'utilisateur" })
  userId: string;
  
  @Field(() => ID, { description: "Identifiant de la ressource" })
  resourceId: string;
  
  @Field(() => String, { description: "Type de ressource" })
  resourceType: string;
  
  @Field(() => String, { description: "Action demandée" })
  action: string;
  
  @Field(() => Boolean, { description: "Décision d'autorisation" })
  allow: boolean;
  
  @Field(() => String, { nullable: true, description: "Raison de la décision" })
  reason?: string;
  
  @Field(() => GraphQLJSONObject, { nullable: true, description: "Contexte de la demande" })
  context?: Record<string, any>;
  
  @Field(() => String, { description: "Timestamp de la décision" })
  timestamp: string;

  @Field(() => Number, { nullable: true, description: "Temps d'évaluation en ms" })
  evaluationTime?: number;

  @Field(() => String, { nullable: true, description: "ID de corrélation" })
  correlationId?: string;

  @Field(() => String, { nullable: true, description: "ID de session" })
  sessionId?: string;

  @Field(() => String, { nullable: true, description: "Adresse IP" })
  ip?: string;

  @Field(() => String, { nullable: true, description: "User Agent" })
  userAgent?: string;
}